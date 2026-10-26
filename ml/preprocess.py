"""Extract MediaPipe hand-landmark sequences from INCLUDE videos.

INCLUDE layout after unzip:  <Category>/<N. Label>/<video>.MOV
Output: data/processed/sequences.npz  (X: list of (n,126) arrays, y: labels, paths)
        data/processed/report.json    (class distribution, failures)

Usage: python preprocess.py --raw data/raw --out data/processed --task hand_landmarker.task
Uses the same MediaPipe Hand Landmarker model as the web app so features match.
"""
from __future__ import annotations

import argparse
import json
import re
import zipfile
from collections import Counter
from pathlib import Path

import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks import python as mpt
from mediapipe.tasks.python import vision

from isl_features import frame_features

VIDEO_EXT = {".mov", ".mp4", ".avi", ".mkv"}


def clean_label(folder: str) -> str:
    return re.sub(r"^\d+\.\s*", "", folder).strip().lower().replace(" ", "_")


def make_landmarker(task: str):
    opts = vision.HandLandmarkerOptions(
        base_options=mpt.BaseOptions(model_asset_path=task),
        running_mode=vision.RunningMode.VIDEO, num_hands=2,
        min_hand_detection_confidence=0.5, min_tracking_confidence=0.5,
    )
    return vision.HandLandmarker.create_from_options(opts)


def extract(path: Path, task: str, max_width: int, fps: float) -> np.ndarray | None:
    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        return None
    src_fps = cap.get(cv2.CAP_PROP_FPS) or 25
    step = max(1, round(src_fps / fps))
    lm = make_landmarker(task)  # fresh tracker per video (timestamps must increase)
    frames, i = [], 0
    while True:
        ok, img = cap.read()
        if not ok:
            break
        if i % step == 0:
            h, w = img.shape[:2]
            if w > max_width:
                img = cv2.resize(img, (max_width, int(h * max_width / w)))
            rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
            res = lm.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb), int(i * 1000 / src_fps))
            hands = [[(p.x, p.y, p.z) for p in h] for h in res.hand_landmarks]
            sides = [h[0].category_name for h in res.handedness]
            f = frame_features(hands, sides)
            if f is not None:  # frames without hands are dropped; order of the rest is preserved
                frames.append(f)
        i += 1
    cap.release(); lm.close()
    return np.asarray(frames, dtype=np.float32) if len(frames) >= 4 else None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", default="data/raw")
    ap.add_argument("--out", default="data/processed")
    ap.add_argument("--task", default="hand_landmarker.task")
    ap.add_argument("--fps", type=float, default=12)
    ap.add_argument("--max-width", type=int, default=640)
    ap.add_argument("--limit-per-class", type=int, default=0)
    a = ap.parse_args()
    raw, out = Path(a.raw), Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    for z in raw.glob("*.zip"):
        marker = raw / (z.stem + ".extracted")
        if not marker.exists():
            print("unzipping", z.name); zipfile.ZipFile(z).extractall(raw); marker.touch()

    videos = sorted(p for p in raw.rglob("*") if p.suffix.lower() in VIDEO_EXT)
    X, y, paths, failed, per = [], [], [], [], Counter()
    for n, v in enumerate(videos, 1):
        label = clean_label(v.parent.name)
        if a.limit_per_class and per[label] >= a.limit_per_class:
            continue
        seq = extract(v, a.task, a.max_width, a.fps)
        print(f"[{n}/{len(videos)}] {label:20s} {v.name} -> {'FAIL' if seq is None else seq.shape[0]}", flush=True)
        if seq is None:
            failed.append(str(v)); continue
        X.append(seq); y.append(label); paths.append(str(v.relative_to(raw))); per[label] += 1
    np.savez_compressed(out / "sequences.npz", X=np.array(X, dtype=object), y=np.array(y), paths=np.array(paths))
    report = {"videos_found": len(videos), "usable": len(X), "failed": failed, "class_distribution": dict(per)}
    (out / "report.json").write_text(json.dumps(report, indent=2))
    print(json.dumps({k: v for k, v in report.items() if k != "failed"}, indent=2), "failed:", len(failed))


if __name__ == "__main__":
    main()
