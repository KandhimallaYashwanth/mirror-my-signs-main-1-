# ISL model pipeline

## Dataset
**INCLUDE** — AI4Bharat / IIT Madras, Zenodo record 4010759, licence **CC BY 4.0** (open; attribution required).
- Indian Sign Language, 263 isolated word signs, ~4,287 videos, 15 categories, ~50 GB of zip parts.
- Labels come from folder names (`<Category>/<N. Word>/<video>`), recorded by ISL signers.
- Isolated signs only — no continuous signing. Videos only (no landmarks); we extract landmarks.
- Cite: Sridhar, Ganesan, Kumar, Khapra. *INCLUDE: A Large Scale Dataset for Indian Sign Language Recognition*, ACM Multimedia 2020.

Other sources reviewed: ISLRTC / DEPwD dictionary (reference videos, not licensed as an ML dataset — not used); RKMVU ISL resources (research, access on request).

## Workflow
```bash
cd ml && pip install -r requirements.txt
curl -LO https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task
python download_include.py --list
python download_include.py --parts Greetings_1of2 Greetings_2of2 --out data/raw   # or --all
python preprocess.py --raw data/raw --out data/processed --task hand_landmarker.task
python train.py --data data/processed/sequences.npz --out models --version 1.0
cp models/isl_model.json ../public/models/isl_model.json   # web app runs it on-device
uvicorn api.app:app --port 8000                            # optional server
```
In the app: **Settings → Sign model → Pre-trained ISL model** (on-device), or **External ISL model** with
`https://<host>/predict-sequence` (or set `VITE_ISL_API_URL`).

## Features (must match `src/lib/isl-model.ts` / `src/lib/recognition.ts`)
MediaPipe Hand Landmarker, 2 hands × 21 points × xyz, wrist-relative and scaled by max wrist distance,
slots ordered [Left, Right]; frames without hands dropped; sequence linearly resampled to 16 frames; z-score standardized.

## Limitations
- Hands only: signs distinguished mainly by face/body position or facial expression may be confused.
- INCLUDE does not publish signer IDs in this release, so the split is stratified per video, not per signer — test accuracy is likely optimistic for new users.
- Trained on a subset of categories; only those words can be recognized. Not production-ready.
