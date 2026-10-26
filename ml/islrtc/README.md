# ISLRTC ISL Dictionary — import workflow

## What was found (checked Oct 2026)
- Official FAQ (https://islrtc.nic.in/faq/, Q18–Q23): the dictionary has ~10,000 terms in 6 categories,
  **video format only**, each sign performed once by a Deaf signer with the English term as caption.
- Access: ISLRTC YouTube channel, a public Google Drive folder
  (https://drive.google.com/drive/folders/1U-Pr4r1-cupgNOOq9NH_uTsQnPSVEKco), and the DIKSHA portal.
- **No dataset download, no metadata file and no API.** Hindi translations appear only inside the videos.
- The dictionary site (divyangjan.depwd.gov.in/islrtc) could not be reached from the build environment.
- Use conditions: no resale or profiteering; acknowledge ISLRTC, DEPwD, Ministry of Social Justice and
  Empowerment, Government of India.

Because of this, nothing was downloaded automatically. You download the videos yourself.

## Manual download
1. Open the Google Drive folder above, choose a category folder, select the videos you want → Download.
   (Drive zips them.) Unzip into `ml/data/islrtc_raw/<Category>/`.
2. Optional: create `ml/data/islrtc_meta.csv` with `video_file,english,hindi,category,source`
   for Hindi meanings you have verified. Leave cells empty if unknown — nothing is guessed.

## Important limitation: one video per sign
ISLRTC has **one example per sign**. A classifier cannot be trained or honestly tested with one example per
class. For every sign you want recognised, add at least 2 more recordings of the same sign (e.g. INCLUDE
videos of the same word, or recordings by real signers, with consent) in the same folder. `train.py`
drops classes with fewer than 3 videos.

## Run
```bash
cd ml
python islrtc/import_islrtc.py --videos data/islrtc_raw --meta data/islrtc_meta.csv --out data/islrtc
python preprocess.py --raw data/islrtc_raw --out data/islrtc_processed --task hand_landmarker.task
python train.py --data data/islrtc_processed/sequences.npz --out models --version islrtc-1.0
ISL_METADATA_PATH=data/islrtc/manifest.json uvicorn api.app:app --host 0.0.0.0 --port 8000
cp data/islrtc/dictionary.json ../public/dictionary/islrtc.json   # Dictionary page metadata
```
Google Colab: upload the `ml/` folder, `pip install -r requirements.txt`, run the same commands.

## Deploy the API
Any Python host (Render, Railway, Fly.io, a VM): start command
`uvicorn api.app:app --host 0.0.0.0 --port $PORT`, include `models/isl_model.json` and the manifest.
Then in the app: Settings → Sign model → External ISL model → `https://<host>/predict-sequence`.
Check the Model status page; it calls `/health` and `/model-info`.
