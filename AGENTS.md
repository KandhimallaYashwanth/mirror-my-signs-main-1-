<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Sign recognition runs in the browser (MediaPipe hands → `src/lib/recognition.ts` KNN or user-configured external model URL); never fabricate predictions — show "setup required" when no model is available. Why: the brief forbids simulated results.
- Model weights (>10 MB) are stored via lovable-assets pointers in src/assets/*.asset.json, never in public/. Why: repo per-file size limit.
- ASL page (/asl) runs the pretrained ASL Citizen ONNX model in-browser (src/lib/asl-model.ts); preprocessing must match ml/asl/README.md. Why: no Python hosting available.
- ISL "Pre-trained ISL model" option runs the MLP exported by ml/train.py in-browser (src/lib/isl-model.ts); features must match ml/isl_features.py. Why: same.
- ISLRTC dictionary data has no API; it is imported manually via ml/islrtc/import_islrtc.py into public/dictionary/islrtc.json. Why: only video downloads are offered.
