# ASL Citizen BiGRU + Attention (pretrained, not retrained)
Source: https://huggingface.co/SharoonArshad/asl-citizen-bigru-attention-encoder-200 — licence CC BY-NC-SA 4.0 (non-commercial, attribution, share-alike).
- `model.py` rebuilds the network from the checkpoint keys (GELU activations); on 736 published test samples it scores 97.96% (README: 98.48%).
- `export_onnx.py best_bigru_attention_model.pt <outdir> <test_features.npy>` exports ONNX (verified: max diff 2e-6 vs PyTorch). The app runs it in the browser with onnxruntime-web — no server needed.
- Preprocessing (inferred from the processed dataset's config and data, see src/lib/asl-model.ts): 33 pose + 21 left + 21 right hand landmarks, missing hand = zeros, minus shoulder centre, ÷ 3D shoulder width, linear resample to 200 frames, + velocity.
- Caveat: the original ASL Citizen keypoints came from MediaPipe Holistic; the app uses MediaPipe Pose + Hand Landmarker, which produce the same landmark layout but may differ slightly, so live accuracy will be lower than the reported numbers.
