/**
 * Math utilities for face embedding operations.
 * Uses Float32Array throughout for JIT-friendly typed array performance.
 */

/** Pure-JS UUID v4 — works in Hermes without crypto.getRandomValues(). */
export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function dotProduct(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}

export function l2Norm(v: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < v.length; i++) {
    sum += v[i] * v[i];
  }
  return Math.sqrt(sum);
}

export function l2Normalize(v: Float32Array): Float32Array {
  const norm = l2Norm(v);
  if (norm === 0) return v;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) {
    out[i] = v[i] / norm;
  }
  return out;
}

/**
 * Cosine similarity between two L2-normalized vectors.
 * Since both are normalized (norm=1), cosine similarity = dot product.
 * Range: [-1, 1] where 1 = identical.
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  return dotProduct(a, b);
}

/** Clamp x to [min, max]. */
export function clamp(x: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, x));
}

/** Convert a number[] to Float32Array. */
export function toFloat32(arr: number[]): Float32Array {
  return new Float32Array(arr);
}
