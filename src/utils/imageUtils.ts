/**
 * Image preprocessing utilities.
 *
 * Spoof preprocessing is an EXACT port of zepiris/ml_inference/spoof_detection.py:
 *   resize 224x224 → normalize with ImageNet mean/std → HWC→CHW → Float32Array
 *
 * FaceNet (w600k_mbf) preprocessing:
 *   crop+align 112x112 → normalize to [-1,1] → HWC→CHW → Float32Array
 */

import {IMAGENET_MEAN, IMAGENET_STD} from '../constants';

export interface RGBFrame {
  data: Uint8Array; // RGB bytes, row-major, length = width * height * 3
  width: number;
  height: number;
}

/**
 * Bilinear resize of an RGB Uint8Array to (targetW x targetH).
 * Returns a new Uint8Array in RGB row-major order.
 */
export function resizeRGB(
  src: Uint8Array,
  srcW: number,
  srcH: number,
  targetW: number,
  targetH: number,
): Uint8Array {
  const out = new Uint8Array(targetW * targetH * 3);
  const xRatio = srcW / targetW;
  const yRatio = srcH / targetH;

  for (let y = 0; y < targetH; y++) {
    for (let x = 0; x < targetW; x++) {
      const srcX = x * xRatio;
      const srcY = y * yRatio;
      const x0 = Math.floor(srcX);
      const y0 = Math.floor(srcY);
      const x1 = Math.min(x0 + 1, srcW - 1);
      const y1 = Math.min(y0 + 1, srcH - 1);
      const dx = srcX - x0;
      const dy = srcY - y0;

      const dstIdx = (y * targetW + x) * 3;
      for (let c = 0; c < 3; c++) {
        const tl = src[(y0 * srcW + x0) * 3 + c];
        const tr = src[(y0 * srcW + x1) * 3 + c];
        const bl = src[(y1 * srcW + x0) * 3 + c];
        const br = src[(y1 * srcW + x1) * 3 + c];
        out[dstIdx + c] = Math.round(
          tl * (1 - dx) * (1 - dy) +
            tr * dx * (1 - dy) +
            bl * (1 - dx) * dy +
            br * dx * dy,
        );
      }
    }
  }
  return out;
}

/**
 * Preprocess an RGB frame for the spoof ONNX model.
 * Mirrors zepiris/ml_inference/spoof_detection.py preprocess() exactly.
 *
 * Pipeline:
 *   1. Resize to 224x224 (bilinear)
 *   2. float32 / 255.0
 *   3. Subtract ImageNet mean, divide by ImageNet std (per channel)
 *   4. HWC -> CHW layout
 *
 * Returns Float32Array of shape [1, 3, 224, 224] flattened = 150528 elements.
 */
export function preprocessForSpoof(frame: RGBFrame): Float32Array {
  const SIZE = 224;
  // No CLAHE here — spoof model was trained on unmodified ImageNet-normalised frames.
  // Applying CLAHE shifts the pixel distribution and triggers false positives.
  const resized = resizeRGB(frame.data, frame.width, frame.height, SIZE, SIZE);

  const out = new Float32Array(3 * SIZE * SIZE);
  for (let c = 0; c < 3; c++) {
    const mean = IMAGENET_MEAN[c];
    const std = IMAGENET_STD[c];
    for (let h = 0; h < SIZE; h++) {
      for (let w = 0; w < SIZE; w++) {
        const pixelVal = resized[(h * SIZE + w) * 3 + c] / 255.0;
        out[c * SIZE * SIZE + h * SIZE + w] = (pixelVal - mean) / std;
      }
    }
  }
  return out; // NCHW: [1,3,224,224] when passed as Tensor with shape [1,3,224,224]
}

/**
 * Preprocess a face crop for the MobileFaceNet (w600k_mbf) ONNX model.
 * Standard ArcFace preprocessing: normalize to [-1, 1].
 *
 * Pipeline:
 *   1. Resize/crop to 112x112 (bilinear)
 *   2. (pixel / 255.0 - 0.5) / 0.5  =>  [-1, 1]
 *   3. HWC -> CHW layout
 *
 * Returns Float32Array of shape [1, 3, 112, 112] flattened = 37632 elements.
 */
export function preprocessForFaceNet(frame: RGBFrame): Float32Array {
  const SIZE = 112;
  const enhanced = applyCLAHE(frame);
  const resized = resizeRGB(enhanced.data, enhanced.width, enhanced.height, SIZE, SIZE);

  const out = new Float32Array(3 * SIZE * SIZE);
  for (let c = 0; c < 3; c++) {
    for (let h = 0; h < SIZE; h++) {
      for (let w = 0; w < SIZE; w++) {
        const pixelVal = resized[(h * SIZE + w) * 3 + c] / 255.0;
        out[c * SIZE * SIZE + h * SIZE + w] = (pixelVal - 0.5) / 0.5;
      }
    }
  }
  return out;
}

/**
 * Crop a face region from an RGB frame using a bounding box.
 * bbox: [x1, y1, x2, y2] in pixel coordinates.
 * Adds 10% padding around the bbox.
 */
export function cropFace(
  frame: RGBFrame,
  bbox: [number, number, number, number],
): RGBFrame {
  const [x1raw, y1raw, x2raw, y2raw] = bbox;
  const padX = (x2raw - x1raw) * 0.1;
  const padY = (y2raw - y1raw) * 0.1;

  const x1 = Math.max(0, Math.floor(x1raw - padX));
  const y1 = Math.max(0, Math.floor(y1raw - padY));
  const x2 = Math.min(frame.width, Math.ceil(x2raw + padX));
  const y2 = Math.min(frame.height, Math.ceil(y2raw + padY));

  const cropW = x2 - x1;
  const cropH = y2 - y1;
  const cropData = new Uint8Array(cropW * cropH * 3);

  for (let row = 0; row < cropH; row++) {
    for (let col = 0; col < cropW; col++) {
      const srcIdx = ((y1 + row) * frame.width + (x1 + col)) * 3;
      const dstIdx = (row * cropW + col) * 3;
      cropData[dstIdx] = frame.data[srcIdx];
      cropData[dstIdx + 1] = frame.data[srcIdx + 1];
      cropData[dstIdx + 2] = frame.data[srcIdx + 2];
    }
  }

  return {data: cropData, width: cropW, height: cropH};
}

/**
 * Convert a JPEG base64 string to an RGBFrame.
 * Used when capturing a snapshot from the camera.
 * Relies on react-native-fs + native JPEG decoding.
 *
 * NOTE: On Android, this is done via a native call. This function
 * returns a placeholder — the native module (MediaPipeModule) handles
 * decoding and passes RGB bytes directly.
 */
export function base64ToRGBFrame(
  _base64: string,
  width: number,
  height: number,
): RGBFrame {
  // Placeholder: real implementation decodes via NativeModules.MediaPipeModule
  return {data: new Uint8Array(width * height * 3), width, height};
}

/**
 * CLAHE — Contrast Limited Adaptive Histogram Equalisation (grayscale).
 *
 * Applied before ONNX inference to handle harsh sunlight, deep shadows,
 * and low-light outdoor conditions common in Indian field deployments.
 * Divides the image into tileSize×tileSize blocks, equalises each block's
 * histogram independently, then bilinear-interpolates at boundaries.
 * clipLimit prevents over-amplification of noise.
 */
export function applyCLAHE(
  frame: RGBFrame,
  tileSize: number = 8,
  clipLimit: number = 2.0,
): RGBFrame {
  const {data, width, height} = frame;

  // Convert to grayscale luminance
  const gray = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    gray[i] = Math.round(
      0.299 * data[i * 3] + 0.587 * data[i * 3 + 1] + 0.114 * data[i * 3 + 2],
    );
  }

  const tilesX = Math.ceil(width / tileSize);
  const tilesY = Math.ceil(height / tileSize);

  // Build clipped histogram LUT for each tile
  const luts: Uint8Array[] = new Array(tilesX * tilesY);
  for (let ty = 0; ty < tilesY; ty++) {
    for (let tx = 0; tx < tilesX; tx++) {
      const hist = new Int32Array(256);
      const x0 = tx * tileSize, y0 = ty * tileSize;
      const x1 = Math.min(x0 + tileSize, width);
      const y1 = Math.min(y0 + tileSize, height);
      const n = (x1 - x0) * (y1 - y0);

      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          hist[gray[y * width + x]]++;
        }
      }

      // Clip and redistribute
      const maxBin = Math.round(clipLimit * n / 256);
      let excess = 0;
      for (let b = 0; b < 256; b++) {
        if (hist[b] > maxBin) {
          excess += hist[b] - maxBin;
          hist[b] = maxBin;
        }
      }
      const redist = Math.floor(excess / 256);
      for (let b = 0; b < 256; b++) hist[b] += redist;

      // Build CDF → LUT
      const lut = new Uint8Array(256);
      let cdf = 0;
      for (let b = 0; b < 256; b++) {
        cdf += hist[b];
        lut[b] = Math.min(255, Math.round((cdf * 255) / n));
      }
      luts[ty * tilesX + tx] = lut;
    }
  }

  // Apply bilinear-interpolated LUT to each pixel, convert back to RGB
  const out = new Uint8Array(data.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const txf = (x / tileSize) - 0.5;
      const tyf = (y / tileSize) - 0.5;
      const tx0 = Math.max(0, Math.floor(txf));
      const ty0 = Math.max(0, Math.floor(tyf));
      const tx1 = Math.min(tilesX - 1, tx0 + 1);
      const ty1 = Math.min(tilesY - 1, ty0 + 1);
      const ax = txf - tx0, ay = tyf - ty0;

      const pxGray = gray[y * width + x];
      const v =
        luts[ty0 * tilesX + tx0][pxGray] * (1 - ax) * (1 - ay) +
        luts[ty0 * tilesX + tx1][pxGray] * ax * (1 - ay) +
        luts[ty1 * tilesX + tx0][pxGray] * (1 - ax) * ay +
        luts[ty1 * tilesX + tx1][pxGray] * ax * ay;

      const enh = Math.round(v) / 255;
      const idx = (y * width + x) * 3;
      // Scale original RGB channels proportionally to preserve colour
      const orig = (gray[y * width + x] || 1) / 255;
      const scale = enh / orig;
      out[idx]     = Math.min(255, Math.round(data[idx] * scale));
      out[idx + 1] = Math.min(255, Math.round(data[idx + 1] * scale));
      out[idx + 2] = Math.min(255, Math.round(data[idx + 2] * scale));
    }
  }

  return {data: out, width, height};
}

/**
 * Compute Laplacian variance for blur detection.
 * Pure JS alternative to ResNet18-based blur model (43MB).
 *
 * Converts RGB to grayscale, applies 3x3 Laplacian kernel,
 * computes variance of the response.
 *
 * Low variance = blurry image.
 */
export function laplacianVariance(frame: RGBFrame): number {
  const {data, width, height} = frame;

  // Grayscale
  const gray = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 3];
    const g = data[i * 3 + 1];
    const b = data[i * 3 + 2];
    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }

  // Laplacian kernel: [0,1,0; 1,-4,1; 0,1,0]
  let sum = 0;
  let sumSq = 0;
  let count = 0;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const lap =
        gray[idx - width] +
        gray[idx + width] +
        gray[idx - 1] +
        gray[idx + 1] -
        4 * gray[idx];
      sum += lap;
      sumSq += lap * lap;
      count++;
    }
  }

  const mean = sum / count;
  return sumSq / count - mean * mean; // variance
}
