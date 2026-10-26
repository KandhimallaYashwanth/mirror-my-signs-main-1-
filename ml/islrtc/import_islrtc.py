"""Import manually downloaded ISLRTC ISL Dictionary videos into a reproducible dataset.

ISLRTC publishes the dictionary only as videos (YouTube, Google Drive, DIKSHA) — no dataset API.
Data-use conditions (https://islrtc.nic.in/faq/ Q23): no resale / profiteering, and acknowledge
ISLRTC, DEPwD, Ministry of Social Justice and Empowerment, Govt. of India.

Input:
  --videos  folder of videos you downloaded yourself (any nesting; sub-folder name = category)
  --meta    OPTIONAL CSV with columns: video_file,english,hindi,category,source
            (english/hindi are copied as-is; missing values stay empty — never invented)
  If no --meta row exists for a video, the English label is taken from the file name only.

Output (in --out):
  manifest.csv / manifest.json   one row per usable video (sign_id, isl_label, english_meaning,
                                  hindi_meaning, video_file, category, training_label, source)
  report.json                    unreadable, duplicate (sha256) and unlabelled videos, class counts
  dictionary.json                metadata for the app's Dictionary page (copy to public/dictionary/)

Usage: python islrtc/import_islrtc.py --videos data/islrtc_raw --meta data/islrtc_meta.csv --out data/islrtc
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
from collections import Counter
from pathlib import Path

import cv2

VIDEO_EXT = {".mp4", ".mov", ".mkv", ".webm", ".avi"}
SOURCE = "ISLRTC ISL Dictionary (DEPwD, MoSJE, Govt. of India)"


def label_from_name(stem: str) -> str:
    s = re.sub(r"^\d+[\s._-]*", "", stem)          # leading numbering
    s = re.sub(r"[_-]+", " ", s)
    s = re.sub(r"\s*\(.*?\)\s*", " ", s)            # "(ISL)" etc.
    return s.strip()


def readable(p: Path) -> tuple[bool, int]:
    cap = cv2.VideoCapture(str(p))
    ok, _ = cap.read()
    n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    cap.release()
    return ok and n >= 4, n


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--videos", required=True)
    ap.add_argument("--meta")
    ap.add_argument("--out", default="data/islrtc")
    ap.add_argument("--public-url-prefix", default="", help="optional base URL where you host the videos for the Dictionary page")
    a = ap.parse_args()
    root, out = Path(a.videos), Path(a.out)
    out.mkdir(parents=True, exist_ok=True)

    meta: dict[str, dict] = {}
    if a.meta:
        with open(a.meta, newline="", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                meta[Path(r["video_file"]).name] = r

    rows, unreadable, dups, unlabelled, seen = [], [], [], [], {}
    for p in sorted(x for x in root.rglob("*") if x.suffix.lower() in VIDEO_EXT):
        h = hashlib.sha256(p.read_bytes()).hexdigest()
        if h in seen:
            dups.append({"file": str(p.relative_to(root)), "duplicate_of": seen[h]}); continue
        seen[h] = str(p.relative_to(root))
        ok, frames = readable(p)
        if not ok:
            unreadable.append(str(p.relative_to(root))); continue
        m = meta.get(p.name, {})
        english = (m.get("english") or label_from_name(p.stem)).strip()
        if not english:
            unlabelled.append(str(p.relative_to(root))); continue
        category = (m.get("category") or (p.parent.name if p.parent != root else "")).strip()
        rows.append({
            "sign_id": f"islrtc-{h[:10]}",
            "isl_label": english.upper(),
            "english_meaning": english,
            "hindi_meaning": (m.get("hindi") or "").strip(),
            "video_file": str(p.relative_to(root)),
            "category": category,
            "training_label": re.sub(r"[^a-z0-9]+", "_", english.lower()).strip("_"),
            "source": (m.get("source") or SOURCE).strip(),
            "frames": frames,
        })

    fields = list(rows[0].keys()) if rows else ["sign_id"]
    with open(out / "manifest.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields); w.writeheader(); w.writerows(rows)
    (out / "manifest.json").write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    counts = Counter(r["training_label"] for r in rows)
    report = {
        "usable_videos": len(rows), "classes": len(counts),
        "classes_with_3plus_videos": sum(1 for c in counts.values() if c >= 3),
        "unreadable": unreadable, "duplicates": dups, "unlabelled": unlabelled,
        "class_distribution": dict(counts),
    }
    (out / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    dictionary = {
        "source": SOURCE, "generated_from": "ml/islrtc/import_islrtc.py",
        "entries": [{k: r[k] for k in ("sign_id", "isl_label", "english_meaning", "hindi_meaning", "category", "source")}
                    | {"video_url": (a.public_url_prefix.rstrip("/") + "/" + r["video_file"]) if a.public_url_prefix else None}
                    for r in rows],
    }
    (out / "dictionary.json").write_text(json.dumps(dictionary, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({k: v for k, v in report.items() if k != "class_distribution"}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
