"""Download parts of the INCLUDE Indian Sign Language dataset from its official Zenodo record.

Source : https://zenodo.org/records/4010759  (AI4Bharat / IIT Madras, CC BY 4.0)
Citation: Sridhar et al., "INCLUDE: A Large Scale Dataset for Indian Sign Language Recognition", ACM MM 2020.

Usage:
  python download_include.py --list
  python download_include.py --parts Greetings_1of2 Greetings_2of2 --out data/raw
  python download_include.py --all --out data/raw          # ~50 GB
Resumable (HTTP Range), verifies Zenodo md5 checksums, skips already-verified files.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

import requests

RECORD = "4010759"
API = f"https://zenodo.org/api/records/{RECORD}"


def md5(path: Path) -> str:
    h = hashlib.md5()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def download(entry: dict, out: Path) -> bool:
    name, size, checksum = entry["key"], entry["size"], entry["checksum"].split(":", 1)[1]
    dest = out / name
    if dest.exists() and dest.stat().st_size == size and md5(dest) == checksum:
        print(f"[skip] {name} already verified")
        return True
    url = entry["links"]["self"]
    have = dest.stat().st_size if dest.exists() else 0
    headers = {"Range": f"bytes={have}-"} if 0 < have < size else {}
    if have >= size:
        dest.unlink(); have = 0; headers = {}
    with requests.get(url, headers=headers, stream=True, timeout=60) as r:
        if r.status_code not in (200, 206):
            print(f"[error] {name}: HTTP {r.status_code}"); return False
        mode = "ab" if r.status_code == 206 else "wb"
        with dest.open(mode) as f:
            done = have if mode == "ab" else 0
            for chunk in r.iter_content(1 << 20):
                f.write(chunk); done += len(chunk)
                print(f"\r{name}: {done/size:6.1%}", end="", flush=True)
    print()
    ok = md5(dest) == checksum
    print(f"[{'ok' if ok else 'checksum mismatch'}] {name}")
    return ok


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="data/raw")
    ap.add_argument("--parts", nargs="*", default=[])
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--list", action="store_true")
    a = ap.parse_args()

    r = requests.get(API, timeout=30)
    r.raise_for_status()
    rec = r.json()
    files = {f["key"]: f for f in rec["files"]}
    if a.list:
        for k, f in sorted(files.items()):
            print(f"{k:45s} {f['size']/1e9:6.2f} GB")
        return
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    (out / "ATTRIBUTION.json").write_text(json.dumps({
        "dataset": rec["metadata"]["title"], "source": f"https://zenodo.org/records/{RECORD}",
        "license": rec["metadata"].get("license", {}).get("id"), "doi": rec.get("doi"),
    }, indent=2))
    wanted = list(files) if a.all else [p if p.endswith(".zip") else p + ".zip" for p in a.parts]
    missing = [w for w in wanted if w not in files]
    for m in missing:
        print(f"[missing] {m} is not in the record")
    failed = [w for w in wanted if w in files and not download(files[w], out)]
    if failed or missing:
        print("Failed:", failed + missing); sys.exit(1)


if __name__ == "__main__":
    main()
