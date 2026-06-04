#!/bin/bash
# Copy exported models into Android assets before building.
# Run from the ZepirisMobile/ project root.

set -e

EXPORTED_DIR="$(dirname "$0")/../models_exported"
ASSETS_DIR="$(dirname "$0")/../android/app/src/main/assets/models"

mkdir -p "$ASSETS_DIR"

FILES=("spoof_fp16.onnx" "w600k_mbf_fp16.onnx" "face_landmarker.task")

for f in "${FILES[@]}"; do
  src="$EXPORTED_DIR/$f"
  dst="$ASSETS_DIR/$f"
  if [ -f "$src" ]; then
    cp "$src" "$dst"
    size=$(du -sh "$dst" | cut -f1)
    echo "  Copied $f -> assets/models/ ($size)"
  else
    echo "  WARNING: $src not found. Run scripts/export_models.py first."
  fi
done

echo ""
echo "Total assets/models size:"
du -sh "$ASSETS_DIR"
