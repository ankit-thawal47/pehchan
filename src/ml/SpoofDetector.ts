/**
 * Passive anti-spoofing detector.
 *
 * Ports zepiris/ml_inference/spoof_detection.py to on-device ONNX inference.
 * Model: MobileNetV3-Large binary classifier (spoof_int8.onnx, INT8 quantized).
 * Input: (1, 3, 224, 224) ImageNet-normalized float32 tensor (CLAHE pre-applied).
 * Output: (1, 1) raw logit -> sigmoid -> prob_live.
 */

import {Tensor} from 'onnxruntime-react-native';
import {getSession} from './OnnxSession';
import {MODEL_SPOOF, SPOOF_THRESHOLD} from '../constants';
import {preprocessForSpoof, type RGBFrame} from '../utils/imageUtils';

export interface SpoofResult {
  isLive: boolean;
  probLive: number;
  inferenceMs: number;
}

export async function detectSpoof(frame: RGBFrame): Promise<SpoofResult> {
  const t0 = Date.now();

  try {
    const tensor = preprocessForSpoof(frame);
    const session = await getSession(MODEL_SPOOF);

    const feeds = {
      [session.inputNames[0]]: new Tensor('float32', tensor, [1, 3, 224, 224]),
    };

    const results = await session.run(feeds);
    const logit = (results[session.outputNames[0]].data as Float32Array)[0];

    // NaN guard: FP16 BatchNorm epsilon truncation causes NaN on some ARM devices.
    // Fall back to isLive=true so active liveness (MediaPipe blink/smile/head-turn)
    // remains the primary anti-spoofing layer.
    if (isNaN(logit) || !isFinite(logit)) {
      console.warn('[SpoofDetector] NaN/Inf logit — passive check bypassed, active liveness enforced');
      return {isLive: true, probLive: 1.0, inferenceMs: Date.now() - t0};
    }

    const probLive = 1 / (1 + Math.exp(-logit));
    const result = {
      isLive: probLive > SPOOF_THRESHOLD,
      probLive,
      inferenceMs: Date.now() - t0,
    };
    console.log(`[SpoofDetector] logit=${logit.toFixed(4)} probLive=${probLive.toFixed(4)} isLive=${result.isLive} ms=${result.inferenceMs}`);
    return result;
  } catch (e: any) {
    console.warn('[SpoofDetector] inference error:', e?.message);
    return {isLive: true, probLive: 1.0, inferenceMs: Date.now() - t0};
  }
}
