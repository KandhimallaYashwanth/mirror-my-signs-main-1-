"""Export the pretrained ASL Citizen checkpoint to ONNX for in-browser inference and verify parity."""
import json, sys, numpy as np, torch
from model import BiGRUAttention
ck = torch.load(sys.argv[1], map_location="cpu", weights_only=False)
m = BiGRUAttention(); m.load_state_dict(ck["model_state_dict"]); m.eval()
out = sys.argv[2]
torch.onnx.export(m, torch.zeros(1, 200, 450), f"{out}/asl_bigru.onnx", input_names=["x"], output_names=["logits"], opset_version=17, dynamo=False)
json.dump({str(k): v for k, v in ck["id_to_label"].items()}, open(f"{out}/labels.json", "w"))
import onnxruntime as ort
x = np.load(sys.argv[3])[:1].astype(np.float32)
a = ort.InferenceSession(f"{out}/asl_bigru.onnx").run(None, {"x": x})[0]
with torch.no_grad(): b = m(torch.from_numpy(x)).numpy()
print("max abs diff", np.abs(a - b).max(), "same argmax", (a.argmax(1) == b.argmax(1)).all())
