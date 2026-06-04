"""
Model export script for ZepIris Mobile.

Exports and prepares all on-device ML models:
  1. spoof_model.pth (Zepiris) -> spoof_int8.onnx via ONNX + INT8 quantization
  2. w600k_mbf.onnx (InsightFace buffalo_sc MobileFaceNet) -> downloaded
  3. face_landmarker.task (MediaPipe) -> downloaded from Google CDN

Run from the zepiris-mobile/ directory:
    python scripts/export_models.py

Requires Python 3.12 with:
    pip install torch torchvision onnx onnxruntime onnxruntime-tools huggingface_hub requests
"""

from __future__ import annotations

import os
import sys
import struct
import hashlib
from pathlib import Path

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

SCRIPT_DIR = Path(__file__).parent
PROJECT_DIR = SCRIPT_DIR.parent
ZEPIRIS_DIR = PROJECT_DIR.parent / "zepiris"
ZEPIRIS_MODELS_DIR = ZEPIRIS_DIR / "models"
OUTPUT_DIR = PROJECT_DIR / "models_exported"
SPOOF_CHECKPOINT = ZEPIRIS_MODELS_DIR / "spoof_model.pth"

OUTPUT_DIR.mkdir(exist_ok=True)

# ---------------------------------------------------------------------------
# FP16 conversion helper (no extra packages — pure onnx)
# ---------------------------------------------------------------------------

def _convert_fp32_to_fp16(model):
    """Proper FP16 conversion using onnxconverter-common.

    keep_io_types=True keeps the graph input/output as float32 so the
    caller API is unchanged. Internal ops and weights use float16.
    This handles HardSwish, BatchNorm, and other FP16-sensitive ops correctly.
    """
    from onnxconverter_common import float16
    # Block BatchNormalization from FP16 — its epsilon values (1e-12) truncate
    # to FP16 min (1e-7), causing sqrt(near-zero variance) → NaN on ARM NEON.
    # Conv/Gemm/MatMul still convert to FP16 for size reduction.
    return float16.convert_float_to_float16(
        model,
        keep_io_types=True,
        op_block_list=['BatchNormalization'],
    )

SPOOF_FP32_OUT = OUTPUT_DIR / "spoof_fp32.onnx"
SPOOF_FP16_OUT = OUTPUT_DIR / "spoof_fp16.onnx"
FACENET_FP32_OUT = OUTPUT_DIR / "w600k_mbf.onnx"
FACENET_FP16_OUT = OUTPUT_DIR / "w600k_mbf_fp16.onnx"
LANDMARKER_OUT = OUTPUT_DIR / "face_landmarker.task"

# ---------------------------------------------------------------------------
# Step A: Export spoof_model.pth -> ONNX -> INT8
# ---------------------------------------------------------------------------

def export_spoof_model():
    print("\n=== Step A: Exporting spoof model to ONNX ===")

    if not SPOOF_CHECKPOINT.exists():
        raise FileNotFoundError(
            f"Spoof checkpoint not found at {SPOOF_CHECKPOINT}. "
            "Run this script from the zepiris-mobile/ directory with zepiris/ as a sibling."
        )

    try:
        import torch
        import onnx
    except ImportError as e:
        print(f"Missing dependency: {e}")
        print("Install with: pip install torch torchvision onnx")
        sys.exit(1)

    # Import MobileNetV3LSpoof directly from its file — avoids loading the full
    # zepiris package __init__.py which pulls in cv2, insightface, etc.
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        "spoof_model",
        str(ZEPIRIS_DIR / "zepiris" / "ml_inference" / "models" / "spoof.py"),
    )
    spoof_module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(spoof_module)
    MobileNetV3LSpoof = spoof_module.MobileNetV3LSpoof

    print(f"  Loading checkpoint from {SPOOF_CHECKPOINT} ({SPOOF_CHECKPOINT.stat().st_size / 1e6:.1f} MB) ...")
    checkpoint = torch.load(str(SPOOF_CHECKPOINT), map_location="cpu", weights_only=False)
    model = MobileNetV3LSpoof()
    model.load_state_dict(checkpoint["model_state_dict"])
    model.eval()
    print("  Model loaded and set to eval mode.")

    dummy = torch.zeros(1, 3, 224, 224)

    print(f"  Exporting to ONNX (opset 17) -> {SPOOF_FP32_OUT} ...")
    torch.onnx.export(
        model,
        dummy,
        str(SPOOF_FP32_OUT),
        input_names=["input"],
        output_names=["logit"],
        dynamic_axes={"input": {0: "batch"}, "logit": {0: "batch"}},
        opset_version=17,
        do_constant_folding=True,
        dynamo=False,  # force legacy TorchScript path; new dynamo path needs onnxscript
    )

    onnx_model = onnx.load(str(SPOOF_FP32_OUT))
    onnx.checker.check_model(onnx_model)
    fp32_size = SPOOF_FP32_OUT.stat().st_size / 1e6
    print(f"  FP32 ONNX exported and validated. Size: {fp32_size:.1f} MB")

    # Convert to FP16 — avoids ConvInteger ops that ORT mobile builds exclude
    print(f"  Converting to FP16 -> {SPOOF_FP16_OUT} ...")
    onnx_fp16 = _convert_fp32_to_fp16(onnx_model)
    onnx.save(onnx_fp16, str(SPOOF_FP16_OUT))
    fp16_size = SPOOF_FP16_OUT.stat().st_size / 1e6
    print(f"  FP16 ONNX. Size: {fp16_size:.1f} MB (was {fp32_size:.1f} MB, {fp32_size/fp16_size:.1f}x reduction)")

    # Validate FP16 model
    import onnxruntime as ort
    import numpy as np
    sess = ort.InferenceSession(str(SPOOF_FP16_OUT), providers=["CPUExecutionProvider"])
    dummy_np = np.zeros((1, 3, 224, 224), dtype=np.float32)
    out = sess.run(None, {sess.get_inputs()[0].name: dummy_np})
    assert out[0].shape == (1, 1), f"Unexpected output shape: {out[0].shape}"
    print(f"  Validation passed. Output shape: {out[0].shape}")
    print(f"  spoof_fp16.onnx -> {fp16_size:.1f} MB")


# ---------------------------------------------------------------------------
# Step B: Download MobileFaceNet (w600k_mbf.onnx) from InsightFace buffalo_sc
# ---------------------------------------------------------------------------

def download_facenet():
    print("\n=== Step B: Downloading MobileFaceNet (w600k_mbf.onnx) ===")

    if FACENET_FP16_OUT.exists():
        size = FACENET_FP16_OUT.stat().st_size / 1e6
        print(f"  Already exists ({size:.1f} MB), skipping.")
        return

    try:
        from huggingface_hub import hf_hub_download
        import onnx
    except ImportError:
        print("Missing: pip install huggingface_hub onnx")
        sys.exit(1)

    # Download FP32 model if not already present
    if not FACENET_FP32_OUT.exists():
        print("  Downloading from InsightFace buffalo_sc on HuggingFace ...")
        try:
            path = hf_hub_download(
                repo_id="deepinsight/insightface",
                filename="models/buffalo_sc/w600k_mbf.onnx",
                repo_type="model",
            )
            import shutil
            shutil.copy(path, str(FACENET_FP32_OUT))
        except Exception as e:
            print(f"  HuggingFace download failed: {e}")
            print("  Trying direct GitHub release download ...")
            _download_facenet_github()
        fp32_size = FACENET_FP32_OUT.stat().st_size / 1e6
        print(f"  FP32 model downloaded ({fp32_size:.1f} MB)")
    else:
        fp32_size = FACENET_FP32_OUT.stat().st_size / 1e6
        print(f"  FP32 model already present ({fp32_size:.1f} MB)")

    # Convert to FP16
    print(f"  Converting to FP16 -> {FACENET_FP16_OUT} ...")
    facenet_fp32 = onnx.load(str(FACENET_FP32_OUT))
    facenet_fp16 = _convert_fp32_to_fp16(facenet_fp32)
    onnx.save(facenet_fp16, str(FACENET_FP16_OUT))
    fp16_size = FACENET_FP16_OUT.stat().st_size / 1e6
    print(f"  FP16 model: {fp16_size:.1f} MB (was {fp32_size:.1f} MB, {fp32_size/fp16_size:.1f}x reduction)")

    # Validate FP16 output shape
    try:
        import onnxruntime as ort
        import numpy as np
        sess = ort.InferenceSession(str(FACENET_FP16_OUT), providers=["CPUExecutionProvider"])
        inp = sess.get_inputs()[0]
        print(f"  Model input: name={inp.name}, shape={inp.shape}")
        dummy = np.zeros([1, 3, 112, 112], dtype=np.float32)
        out = sess.run(None, {inp.name: dummy})
        print(f"  Model output shape: {out[0].shape}")
        assert out[0].shape[1] == 512, f"Expected 512-dim embedding, got {out[0].shape[1]}"
        print("  Validation passed: 512-dim output confirmed.")
    except Exception as e:
        print(f"  Warning: validation failed: {e}")


def _download_facenet_github():
    import requests
    # Fallback: direct download from InsightFace GitHub release assets
    url = "https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_sc.zip"
    print(f"  Fetching {url} ...")
    resp = requests.get(url, stream=True, timeout=60)
    resp.raise_for_status()
    zip_path = OUTPUT_DIR / "buffalo_sc.zip"
    with open(str(zip_path), "wb") as f:
        for chunk in resp.iter_content(chunk_size=65536):
            f.write(chunk)
    import zipfile
    with zipfile.ZipFile(str(zip_path), "r") as z:
        for name in z.namelist():
            if "w600k_mbf.onnx" in name:
                data = z.read(name)
                FACENET_FP32_OUT.write_bytes(data)
                print(f"  Extracted w600k_mbf.onnx ({len(data)/1e6:.1f} MB)")
                break
    zip_path.unlink()


# ---------------------------------------------------------------------------
# Step C: Download MediaPipe Face Landmarker
# ---------------------------------------------------------------------------

def download_landmarker():
    print("\n=== Step C: Downloading MediaPipe Face Landmarker ===")

    if LANDMARKER_OUT.exists():
        size = LANDMARKER_OUT.stat().st_size / 1e6
        print(f"  Already exists ({size:.1f} MB), skipping download.")
        return

    import requests
    url = (
        "https://storage.googleapis.com/mediapipe-models/"
        "face_landmarker/face_landmarker/float16/1/face_landmarker.task"
    )
    print(f"  Downloading from {url} ...")
    resp = requests.get(url, stream=True, timeout=120)
    resp.raise_for_status()
    total = 0
    with open(str(LANDMARKER_OUT), "wb") as f:
        for chunk in resp.iter_content(chunk_size=65536):
            f.write(chunk)
            total += len(chunk)
    size = LANDMARKER_OUT.stat().st_size / 1e6
    print(f"  Downloaded face_landmarker.task ({size:.1f} MB)")


# ---------------------------------------------------------------------------
# Step D: Copy to Android assets
# ---------------------------------------------------------------------------

def copy_to_android_assets():
    print("\n=== Step D: Copying models to Android assets ===")
    import shutil
    assets_dir = PROJECT_DIR / "android" / "app" / "src" / "main" / "assets" / "models"
    assets_dir.mkdir(parents=True, exist_ok=True)

    files = [
        (SPOOF_FP16_OUT, "spoof_fp16.onnx"),
        (FACENET_FP16_OUT, "w600k_mbf_fp16.onnx"),
        (LANDMARKER_OUT, "face_landmarker.task"),
    ]
    for src, name in files:
        if src.exists():
            dst = assets_dir / name
            shutil.copy(str(src), str(dst))
            print(f"  {name} -> {dst} ({dst.stat().st_size/1e6:.1f} MB)")
        else:
            print(f"  WARNING: {src} not found, skipping.")

    total = sum((assets_dir / name).stat().st_size for _, name in files if (assets_dir / name).exists())
    print(f"\n  Total model bundle size: {total/1e6:.1f} MB")
    if total / 1e6 > 20:
        print("  WARNING: Total exceeds 20MB budget!")
    else:
        print("  Budget check: PASSED (under 20MB)")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print("ZepIris Mobile — Model Export Pipeline")
    print(f"Zepiris source: {ZEPIRIS_DIR}")
    print(f"Output dir:     {OUTPUT_DIR}")

    export_spoof_model()
    download_facenet()
    download_landmarker()
    copy_to_android_assets()

    print("\n=== Export complete ===")
    print("Next step: cd android && ./gradlew assembleDebug")
