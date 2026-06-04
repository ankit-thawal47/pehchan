/**
 * Blur detector — pure JS Laplacian variance.
 *
 * Replaces zepiris's ResNet18-based blur_model.pth (43MB) with a
 * classical signal-processing approach. At 224x224 with typed arrays
 * this runs in ~2ms on device — no ONNX model needed.
 */

import {BLUR_LAPLACIAN_THRESHOLD} from '../constants';
import {laplacianVariance, type RGBFrame} from '../utils/imageUtils';

export interface BlurResult {
  isSharp: boolean;
  variance: number;
}

export function detectBlur(frame: RGBFrame): BlurResult {
  const variance = laplacianVariance(frame);
  return {
    isSharp: variance >= BLUR_LAPLACIAN_THRESHOLD,
    variance,
  };
}
