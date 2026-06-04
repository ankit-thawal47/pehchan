/**
 * Face embedding service.
 *
 * Ports zepiris/ml_inference/face_embedding.py to on-device ONNX inference.
 * Model: MobileFaceNet w600k_mbf_int8.onnx (InsightFace buffalo_sc, INT8 quantized).
 * Input: (1, 3, 112, 112) normalized to [-1, 1] (CLAHE pre-applied).
 * Output: (1, 512) float32 -> L2-normalized 512-dim embedding.
 */

import {Tensor} from 'onnxruntime-react-native';
import {getSession} from './OnnxSession';
import {MODEL_FACENET, EMBEDDING_DIM} from '../constants';
import {preprocessForFaceNet, cropFace, type RGBFrame} from '../utils/imageUtils';
import {l2Normalize} from '../utils/mathUtils';

export interface EmbedResult {
  faceDetected: boolean;
  embedding: number[];
  inferenceMs: number;
}

export async function embedFace(
  frame: RGBFrame,
  bbox: [number, number, number, number],
): Promise<EmbedResult> {
  const t0 = Date.now();

  if (!bbox || bbox[2] <= bbox[0] || bbox[3] <= bbox[1]) {
    return {faceDetected: false, embedding: new Array(EMBEDDING_DIM).fill(0), inferenceMs: 0};
  }

  const cropped = cropFace(frame, bbox);
  const tensor = preprocessForFaceNet(cropped);
  const session = await getSession(MODEL_FACENET);

  const feeds = {
    [session.inputNames[0]]: new Tensor('float32', tensor, [1, 3, 112, 112]),
  };

  const results = await session.run(feeds);
  const rawEmbedding = results[session.outputNames[0]].data as Float32Array;
  const normalized = l2Normalize(rawEmbedding);

  return {
    faceDetected: true,
    embedding: Array.from(normalized),
    inferenceMs: Date.now() - t0,
  };
}
