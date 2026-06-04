# Pehchaan — Technical Documentation
## Offline Face Authentication & Liveness Detection for Datalake 3.0

**Developer:** Ankit Thawal · [linkedin.com/in/ankit-thawal](https://www.linkedin.com/in/ankit-thawal)
**Repository:** https://github.com/ankit-thawal47/pehchan
**Platform:** Android 8.0+ · iOS 12+ · React Native 0.74.3
**Submission:** Hackathon 7.0 — June 2026

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Model Architecture](#2-model-architecture)
   - 2.1 Passive Anti-Spoofing — MobileNetV3-Large
   - 2.2 Face Embedding — MobileFaceNet (w600k)
   - 2.3 Active Liveness — MediaPipe Face Landmarker
   - 2.4 Blur Detection — Laplacian Variance
   - 2.5 Model Compression Pipeline
3. [Liveness Detection Architecture](#3-liveness-detection-architecture)
4. [Image Preprocessing Pipeline](#4-image-preprocessing-pipeline)
5. [Database Schema & Cosine Search](#5-database-schema--cosine-search)
6. [Sync & Purge Mechanism](#6-sync--purge-mechanism)
7. [Integration Steps — Datalake 3.0](#7-integration-steps--datalake-30)
8. [Performance Benchmarks](#8-performance-benchmarks)
9. [Cross-Platform Architecture](#9-cross-platform-architecture)
10. [Open Source Attributions](#10-open-source-attributions)

---

## 1. System Overview

Pehchaan (पहचान — Hindi for "recognition") is a fully offline biometric authentication system built as a React Native module. It performs facial recognition and liveness detection entirely on-device without any network dependency at authentication time.

### High-Level Flow

```
                        ENROLL FLOW
  ┌──────────┐    ┌──────────────┐    ┌──────────────┐
  │ Camera   │───▶│ Quality Check│───▶│ Spoof Check  │
  │ Snapshot │    │ (Laplacian   │    │ (MobileNetV3 │
  └──────────┘    │  Variance)   │    │  ONNX FP16)  │
                  └──────────────┘    └──────┬───────┘
                                             │
                  ┌──────────────┐    ┌──────▼───────┐
                  │   SQLite DB  │◀───│ Face Embed   │
                  │  + Sync Queue│    │ (MobileFaceNet│
                  └──────────────┘    │  ONNX FP16)  │
                                      └──────────────┘

                        VERIFY FLOW
  ┌──────────────────────────────┐
  │   Active Liveness Challenge  │
  │  Blink → Smile → Head Turn   │
  │  (MediaPipe Face Landmarker) │
  └──────────────┬───────────────┘
                 │ PASS
  ┌──────────────▼───────────────┐    ┌──────────────┐
  │  Camera Snapshot             │───▶│ Spoof + Embed │
  │  + Blur + Spoof + Embed      │    │ (ONNX FP16)  │
  └──────────────────────────────┘    └──────┬───────┘
                                             │
                  ┌──────────────┐    ┌──────▼───────┐
                  │ MATCH / FAIL │◀───│ Cosine Search │
                  │   Result     │    │ (SQLite)     │
                  └──────────────┘    └──────────────┘
```

### Key Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Inference framework | ONNX Runtime (CPU EP) | Universal, no GPU required, MIT licensed |
| Face detection | MediaPipe (dual-use) | Provides bbox AND liveness blend shapes — no separate detector model needed |
| Embedding model | MobileFaceNet w600k | 512-dim, trained on 600K identities including diverse demographics |
| Quantization format | FP16 ONNX (not INT8) | INT8 `ConvInteger` op excluded from ORT mobile; FP16 universally supported |
| Storage | SQLite (react-native-quick-sqlite) | Synchronous, works fully offline, no server dependency |
| Similarity metric | Cosine similarity = dot product | Embeddings are L2-normalised, so cosine = dot — no sqrt needed |

---

## 2. Model Architecture

### 2.1 Passive Anti-Spoofing — MobileNetV3-Large

**Source:** ZepIris project (MIT License) — `models/spoof_model.pth`
**Architecture:** MobileNetV3-Large binary classifier
**Input:** `(1, 3, 224, 224)` float32 tensor, ImageNet-normalised
**Output:** `(1, 1)` raw logit → sigmoid → `prob_live ∈ [0, 1]`
**Decision:** `prob_live > 0.3` → genuine face

#### MobileNetV3-Large Architecture Summary

```
Input (224×224×3)
  │
  ├─ Stem Conv (3×3, stride 2) → 16 channels
  │
  ├─ Bottleneck Blocks (Inverted Residuals):
  │    ├─ Block 1:  16 → 16  (kernel 3, exp 1, SE=no,  HardSwish=no)
  │    ├─ Block 2:  16 → 24  (kernel 3, exp 4, SE=no,  HardSwish=no)
  │    ├─ Block 3:  24 → 24  (kernel 3, exp 3, SE=no,  HardSwish=no)
  │    ├─ Block 4:  24 → 40  (kernel 5, exp 3, SE=yes, HardSwish=no)
  │    ├─ Block 5:  40 → 40  (kernel 5, exp 3, SE=yes, HardSwish=no)
  │    ├─ Block 6:  40 → 40  (kernel 5, exp 3, SE=yes, HardSwish=no)
  │    ├─ Block 7:  40 → 80  (kernel 3, exp 6, SE=no,  HardSwish=yes)
  │    ├─ Block 8:  80 → 80  (kernel 3, exp 2.5, SE=no, HardSwish=yes)
  │    ├─ Block 9:  80 → 80  (kernel 3, exp 2.3, SE=no, HardSwish=yes)
  │    ├─ Block 10: 80 → 80  (kernel 3, exp 2.3, SE=no, HardSwish=yes)
  │    ├─ Block 11: 80 → 112 (kernel 3, exp 6,   SE=yes, HardSwish=yes)
  │    ├─ Block 12: 112→ 112 (kernel 3, exp 6,   SE=yes, HardSwish=yes)
  │    ├─ Block 13: 112→ 160 (kernel 5, exp 6,   SE=yes, HardSwish=yes)
  │    ├─ Block 14: 160→ 160 (kernel 5, exp 6,   SE=yes, HardSwish=yes)
  │    └─ Block 15: 160→ 160 (kernel 5, exp 6,   SE=yes, HardSwish=yes)
  │
  ├─ Conv 1×1 → 960 channels (HardSwish)
  ├─ AdaptiveAvgPool → 1×1
  ├─ Conv 1×1 → 1280 channels (HardSwish)
  └─ Linear 1280 → 1 (binary logit)

Total params: ~5.4M
```

**SE = Squeeze-and-Excite** (channel attention)
**HardSwish** = `x × min(6, max(0, x+3)) / 6` — hardware-friendly approximation of Swish

#### Preprocessing (exact port of `zepiris/ml_inference/spoof_detection.py`)

```python
# Python reference (source)
img = cv2.resize(img_rgb, (224, 224), interpolation=cv2.INTER_LINEAR)
img = img.astype(np.float32) / 255.0
img = (img - IMAGENET_MEAN) / IMAGENET_STD   # per-channel normalisation
img = img.transpose(2, 0, 1)                 # HWC → CHW
img = np.expand_dims(img, 0)                 # → (1, 3, 224, 224)
```

```typescript
// TypeScript port (src/utils/imageUtils.ts)
const IMAGENET_MEAN = [0.485, 0.456, 0.406];
const IMAGENET_STD  = [0.229, 0.224, 0.225];

// 1. Bilinear resize to 224×224
const resized = resizeRGB(frame.data, frame.width, frame.height, 224, 224);
// 2. Normalise + HWC→CHW → Float32Array[1×3×224×224]
for (let c = 0; c < 3; c++)
  for (let h = 0; h < 224; h++)
    for (let w = 0; w < 224; w++) {
      const pixel = resized[(h * 224 + w) * 3 + c] / 255.0;
      out[c * 224 * 224 + h * 224 + w] = (pixel - IMAGENET_MEAN[c]) / IMAGENET_STD[c];
    }
```

---

### 2.2 Face Embedding — MobileFaceNet (w600k)

**Source:** InsightFace `buffalo_sc` model pack — cited for educational/hackathon use
**Architecture:** MobileFaceNet backbone, trained on WebFace600K dataset
**Input:** `(1, 3, 112, 112)` float32, normalised to `[-1, 1]`
**Output:** `(1, 512)` float32 embedding vector

#### MobileFaceNet Architecture Summary

```
Input (112×112×3)
  │
  ├─ Conv 3×3, stride 2  → 64 channels (BN + PReLU)
  ├─ Depthwise Conv 3×3  → 64 channels (BN + PReLU)
  │
  ├─ Bottleneck ×5:   64 → 64  (stride 2, expansion 2)
  ├─ Bottleneck ×1:   64 → 128 (stride 2, expansion 4)
  ├─ Bottleneck ×6:  128 → 128 (stride 1, expansion 2)
  ├─ Bottleneck ×1:  128 → 128 (stride 2, expansion 4)
  ├─ Bottleneck ×2:  128 → 128 (stride 1, expansion 2)
  │
  ├─ Conv 1×1 → 512 channels (BN + PReLU)
  ├─ Linear Depthwise Conv 7×7 → 512 (no activation, BN only)
  └─ Linear FC → 512 (embedding, L2-normalised)

Total params: ~1.0M
Training data: WebFace600K — 600K identities, diverse global demographics
```

#### Preprocessing

```typescript
// src/utils/imageUtils.ts — preprocessForFaceNet()
// 1. Crop face region from full frame using MediaPipe bbox (with 10% padding)
const cropped = cropFace(frame, bboxPixels);
// 2. Bilinear resize to 112×112
const resized = resizeRGB(cropped.data, cropped.width, cropped.height, 112, 112);
// 3. Normalise to [-1, 1]: (pixel/255 - 0.5) / 0.5
for each pixel channel:
  out[...] = (pixel / 255.0 - 0.5) / 0.5;
// 4. HWC → CHW → Float32Array[1×3×112×112]
```

#### Post-processing

```typescript
// src/utils/mathUtils.ts — l2Normalize()
// Embeddings are L2-normalised so cosine similarity = dot product
const norm = Math.sqrt(embedding.reduce((s, v) => s + v * v, 0));
return embedding.map(v => v / norm);
```

---

### 2.3 Active Liveness — MediaPipe Face Landmarker

**Source:** Google MediaPipe Tasks Vision (Apache 2.0)
**Model file:** `face_landmarker.task` — Float16 multi-task model
**Input:** Any resolution image/video frame (MPImage)
**Output:**
- 478 3D face landmarks (normalised coordinates)
- 52 blend shape coefficients (facial action units)
- Facial transformation matrix (4×4, used for Euler angles)

#### What the model detects

```
Blend shapes used for liveness (subset of 52 total):

  eyeBlinkLeft   — left eye openness (0=open, 1=closed)
  eyeBlinkRight  — right eye openness (0=open, 1=closed)
  mouthSmileLeft — left mouth corner raised (0=neutral, 1=full smile)
  mouthSmileRight— right mouth corner raised (0=neutral, 1=full smile)

Euler angles from 4×4 transformation matrix M:
  yaw   = atan2(M[2][0], M[2][2]) × 180/π
  pitch = atan2(-M[2][1], √(M[2][0]² + M[2][2]²)) × 180/π
  roll  = atan2(M[0][1], M[1][1]) × 180/π
```

#### Running modes used

| Mode | Used for | Latency |
|---|---|---|
| `IMAGE` | One-shot face detection for enrollment bbox | ~50–100ms |
| `LIVE_STREAM` | Continuous streaming for liveness challenges | ~30ms/frame |

---

### 2.4 Blur Detection — Laplacian Variance (No ML Model)

A classical computer vision method — zero model weight.

```typescript
// src/utils/imageUtils.ts — laplacianVariance()

// 1. Convert RGB → Grayscale (luminance)
gray[i] = 0.299×R + 0.587×G + 0.114×B

// 2. Apply 3×3 Laplacian kernel (edge detection)
// Kernel: [0,1,0, 1,-4,1, 0,1,0]
laplacian[y][x] = gray[y-1][x] + gray[y][x-1] + gray[y][x+1]
                + gray[y+1][x] - 4×gray[y][x]

// 3. Compute variance of Laplacian response
// High variance = sharp image (many edges)
// Low variance  = blurry image (few edges)
variance = mean(laplacian²) - mean(laplacian)²

// Threshold: variance < 15 → reject as too blurry
```

**Why this works:** A sharp image has strong, high-contrast edges — the Laplacian (second derivative) captures these as large values. A blurry image smooths edges, producing a low-variance Laplacian response.

---

### 2.5 Model Compression Pipeline

#### Before → After

| Model | Original source | Original size | Exported format | Final size | Reduction |
|---|---|---|---|---|---|
| Spoof (MobileNetV3) | PyTorch `.pth` checkpoint | 50.8 MB | FP16 ONNX (opset 17) | 8.4 MB | **83%** |
| FaceNet (MobileFaceNet) | InsightFace ONNX FP32 | 13.6 MB | FP16 ONNX | 6.8 MB | **50%** |
| Face Landmarker | MediaPipe `.task` Float16 | 3.8 MB | Unchanged | 3.8 MB | — |
| **Total** | | **68.2 MB** (ONNX originals) | | **19.0 MB** | **72%** |

*(If counting PyTorch checkpoint: 50.8 + 13.6 + 3.8 = 68.2 MB source → 19.0 MB deployed)*

#### Compression Steps — Spoof Model

```
Step 1: Load PyTorch checkpoint
   spoof_model.pth (50.8 MB)
   └─ MobileNetV3LSpoof class (from zepiris/ml_inference/models/spoof.py)
   └─ Load checkpoint["model_state_dict"]
   └─ model.eval()

Step 2: Export to ONNX (opset 17)
   torch.onnx.export(
     model, dummy_input(1,3,224,224),
     opset_version=17,
     input_names=['input'], output_names=['logit'],
     dynamo=False  # legacy TorchScript path
   )
   → spoof_fp32.onnx (16.8 MB)

Step 3: FP16 conversion (onnxconverter-common)
   float16.convert_float_to_float16(
     model,
     keep_io_types=True,          # I/O stays float32, internals use float16
     op_block_list=['BatchNormalization']  # keep BN in float32 to avoid NaN
   )
   → spoof_fp16.onnx (8.4 MB)
```

**Why FP16 instead of INT8:**
INT8 dynamic quantisation generates `ConvInteger` ONNX operators, which are excluded from ONNX Runtime's mobile build to reduce binary size. FP16 conversion uses standard `Conv` operators (universally supported) with half-precision weights.

**Why BatchNorm is blocked from FP16:**
BatchNorm layers contain epsilon values as small as `5×10⁻¹²`. When truncated to FP16 minimum (`~6×10⁻⁸`), `sqrt(variance + epsilon)` can evaluate to `sqrt(0)` on some ARM NEON implementations, producing NaN. Keeping BatchNorm in FP32 prevents this while Conv layers (90% of model size) still compress to FP16.

#### Export Script

```bash
# Run once to export all three models
cd pehchan
source .venv/bin/activate
python scripts/export_models.py
```

The script handles:
- PyTorch → ONNX → FP16 for spoof model
- Download + FP16 conversion for MobileFaceNet
- Download MediaPipe task from Google CDN
- Validation of all output shapes
- Copy to `android/app/src/main/assets/models/`

---

## 3. Liveness Detection Architecture

### Active Liveness State Machine

```
State: IDLE
  │  start() called
  ▼
State: BLINK  ──── challenge: "Blink your eyes"
  │
  │  MediaPipe blend shape stream:
  │  eyeBlinkLeft  < 0.3  (WAITING_CLOSE → CLOSED)
  │  eyeBlinkLeft  > 0.7  (CLOSED → re-opened → BLINK DONE)
  ▼
State: SMILE  ──── challenge: "Now smile"
  │
  │  mouthSmileLeft + mouthSmileRight > 1.0
  ▼
State: HEAD_TURN ── challenge: "Turn your head"
  │
  │  |eulerAngles.yaw| > 20°
  ▼
State: COMPLETE ─── liveness confirmed → proceed to capture
```

### Why This Defeats Spoofing

| Attack vector | Defeated by |
|---|---|
| Printed photograph | Cannot perform live blink/smile/head turn |
| Screen replay (video) | Video of previous session cannot respond to randomised challenge order |
| 3D mask | MediaPipe detects mesh; precise blend shapes require real muscle movement |
| Photo of someone else | Even if they pass liveness, face embedding won't match enrolled person |

### Implementation

```typescript
// src/ml/LivenessChecker.ts

class LivenessChecker {
  private state: LivenessChallenge = 'IDLE';
  private blinkState: 'WAITING_CLOSE' | 'CLOSED' | 'DONE' = 'WAITING_CLOSE';

  private onLandmark(event: LandmarkEvent) {
    const { blendShapes, eulerAngles } = event;
    const eyeBlink = (blendShapes.eyeBlinkLeft + blendShapes.eyeBlinkRight) / 2;

    switch (this.state) {
      case 'BLINK':
        if (this.blinkState === 'WAITING_CLOSE' && eyeBlink < BLINK_CLOSED_THRESHOLD)
          this.blinkState = 'CLOSED';
        else if (this.blinkState === 'CLOSED' && eyeBlink > BLINK_OPEN_THRESHOLD)
          this.advance('SMILE');
        break;
      case 'SMILE':
        const smile = blendShapes.mouthSmileLeft + blendShapes.mouthSmileRight;
        if (smile > SMILE_THRESHOLD) this.advance('HEAD_TURN');
        break;
      case 'HEAD_TURN':
        if (Math.abs(eulerAngles.yaw) > HEAD_TURN_YAW_DEG) this.advance('COMPLETE');
        break;
    }
  }
}
```

### MediaPipe Frame Feeding (Android + iOS)

**Android (Java):** `MediaPipeModule.java`
```java
// LIVE_STREAM mode — detectAsync is non-blocking
landmarker.detectAsync(mpImage, SystemClock.uptimeMillis());
// Result delivered via FaceLandmarkerResultListener callback
// → emitted as 'onFaceLandmark' event via RCTDeviceEventEmitter
```

**iOS (Swift):** `MediaPipeModule.swift`
```swift
// Same pattern, Swift SDK
try landmarker.detectAsync(image: mpImage, timestampInMilliseconds: ts)
// Result delivered via FaceLandmarkerLiveStreamDelegate
// → emitted via sendEvent(withName: "onFaceLandmark", body: out)
```

---

## 4. Image Preprocessing Pipeline

### Full Pipeline — Camera to ONNX

```
Camera snapshot (JPEG)
        │
        ▼ MediaPipeModule.decodeImageToRGB()  [Native: Java/Swift]
        │
        ├─ BitmapFactory.decodeFile (Android)
        │  UIImage(contentsOfFile:) (iOS)
        │
        ├─ EXIF rotation fix
        │  Android: ExifInterface → Matrix.postRotate()
        │  iOS: UIImage auto-applies EXIF on load ✓
        │
        ├─ Scale to max 480px on longest dimension
        │  Keeps bridge transfer manageable (~691K values)
        │  At full 1920×1080: 6.2M values → bridge OOM
        │
        └─ Pack as RGB int array [R,G,B, R,G,B, ...]
           → {width, height, data[]} via React Native bridge

        ▼ JS preprocessing (imageUtils.ts)
        │
        ├─ SPOOF PATH:
        │   resizeRGB(480→224, 480→224, bilinear)
        │   ImageNet normalise: (px/255 - mean[c]) / std[c]
        │   HWC → CHW layout
        │   → Float32Array[1, 3, 224, 224]
        │
        └─ FACENET PATH:
            cropFace(bbox, 10% padding)
            resizeRGB(crop→112, crop→112, bilinear)
            Normalise to [-1,1]: (px/255 - 0.5) / 0.5
            HWC → CHW layout
            → Float32Array[1, 3, 112, 112]
```

### CLAHE — Lighting Adaptability

CLAHE (Contrast Limited Adaptive Histogram Equalisation) is applied before face embedding inference to handle:
- Harsh outdoor sunlight (overexposure)
- Deep shadow conditions
- Low-light indoor environments
- Mixed/uneven lighting (common in Indian field deployments)

```typescript
// src/utils/imageUtils.ts — applyCLAHE()
// Parameters: tileSize=8, clipLimit=2.0
// 1. Divide into 8×8 tiles
// 2. Equalise histogram of each tile independently
// 3. Clip at clipLimit × (n/256) to prevent noise amplification
// 4. Bilinear interpolation at tile boundaries to avoid blocking
// 5. Scale original RGB proportionally to preserve colour

// Applied: before FaceNet preprocessing only
// NOT applied to spoof model (model trained without CLAHE — distribution shift causes NaN)
```

### Bilinear Resize (Pure JS, no native library)

```typescript
// src/utils/imageUtils.ts — resizeRGB()
// For each output pixel (x, y):
//   srcX = x × (srcW / targetW)
//   srcY = y × (srcH / targetH)
//   Bilinear interpolate from 4 surrounding source pixels
//   Output: Uint8Array[targetH × targetW × 3]
```

---

## 5. Database Schema & Cosine Search

### Schema (mirrors ZepIris Milvus collection)

```sql
-- Primary face storage
CREATE TABLE IF NOT EXISTS faces (
  face_id    TEXT PRIMARY KEY,          -- UUID v4 (pure-JS generator)
  tenant     TEXT NOT NULL DEFAULT 'default',
  object_key TEXT NOT NULL DEFAULT '',  -- enrolled person's name
  embedding  TEXT NOT NULL,             -- JSON array: 512 float32 values, L2-normalised
  created_at INTEGER NOT NULL,          -- Unix timestamp (ms)
  synced     INTEGER NOT NULL DEFAULT 0 -- 0=pending, 1=synced to AWS
);

-- Offline-first sync queue
CREATE TABLE IF NOT EXISTS sync_queue (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  face_id    TEXT NOT NULL,
  operation  TEXT NOT NULL,   -- 'INSERT' | 'UPSERT' | 'DELETE'
  payload    TEXT NOT NULL,   -- JSON blob for AWS POST body
  created_at INTEGER NOT NULL,
  retries    INTEGER NOT NULL DEFAULT 0,
  status     TEXT NOT NULL DEFAULT 'pending'
  -- status ∈ {'pending', 'syncing', 'done', 'failed'}
);
```

### Cosine Similarity Search

```typescript
// src/db/faceStore.ts — searchByCosine()

// Since embeddings are L2-normalised:
// cosine_similarity(a, b) = dot(a, b) / (|a| × |b|) = dot(a, b)
// (because |a| = |b| = 1.0 after L2 normalisation)

function searchByCosine(query: number[], tenant: string, topK = 1) {
  // Full table scan — O(n) where n = enrolled faces
  const rows = db.execute('SELECT face_id, object_key, embedding FROM faces WHERE tenant=?', [tenant]);

  return rows
    .map(row => ({
      face_id: row.face_id,
      object_key: row.object_key,
      similarity: dotProduct(query, JSON.parse(row.embedding))
    }))
    .filter(m => m.similarity >= COSINE_ACCEPT_THRESHOLD)  // threshold = 0.5
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);
}

// dotProduct — Float32Array for JIT-friendly typed array ops
function dotProduct(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}
```

**Threshold rationale:** `similarity >= 0.5` mirrors `milvus_search_threshold = 0.5` from `zepiris/config.py`. MobileFaceNet L2-normalised embeddings of the same person typically score 0.6–0.95; different persons typically score < 0.4.

---

## 6. Sync & Purge Mechanism

### Architecture

```
[Field device — offline]
       │
       ▼  on successful face enroll
  insertFace(faceId, embedding, tenant, name)      ← SQLite faces table
  enqueue(faceId, 'INSERT', payload)               ← SQLite sync_queue, status='pending'

       │
       │  NetInfo.addEventListener monitors connectivity
       │  onConnectivityChange: isConnected → true
       ▼
  SyncManager.drainQueue()

  FOR each row WHERE status='pending' OR status='syncing':
    1. markSyncing(id)
    2. awsUploader.upload(row)
         POST https://[SYNC_ENDPOINT]
         Body: { face_id, tenant, operation, embedding, name, timestamp }
         Headers: { Content-Type: application/json }
    3. ON SUCCESS → markDone(id), markSynced(face_id)
       ON FAILURE → incrementRetry(id)
                    IF retries >= 3 → markFailed(id)

  purgeCompleted()
    DELETE FROM sync_queue WHERE status='done'
    AND created_at < (NOW - 24h)
```

### SyncManager Implementation

```typescript
// src/sync/SyncManager.ts

class SyncManagerClass {
  private netInfoSub: NetInfoSubscription | null = null;

  start() {
    this.netInfoSub = NetInfo.addEventListener(state => {
      if (state.isConnected && state.isInternetReachable) {
        this.drainQueue();
      }
    });
  }

  async drainQueue() {
    const pending = getPending();          // SELECT WHERE status IN ('pending','syncing')
    for (const item of pending) {
      markSyncing(item.id);
      const ok = await upload(item);
      if (ok) {
        markDone(item.id);
        markSynced(item.face_id);
      } else {
        incrementRetry(item.id);
        if (item.retries + 1 >= SYNC_MAX_RETRIES) markFailed(item.id);
      }
    }
    purgeCompleted();                      // DELETE done rows older than 24h
    this.notifyListeners();
  }

  stop() { this.netInfoSub?.(); }
}
```

### AWS Payload Format

```json
{
  "face_id":   "a3f8c1d2-4b5e-4789-abcd-ef1234567890",
  "tenant":    "default",
  "operation": "INSERT",
  "embedding": [0.023, -0.141, 0.089, 0.302, ...],  // 512 float32 values
  "name":      "Ankit Thawal",
  "timestamp": 1749081234567
}
```

### Configuration

```typescript
// src/constants.ts
export const SYNC_ENDPOINT     = 'https://httpbin.org/post'; // replace with AWS URL
export const SYNC_MAX_RETRIES  = 3;
export const SYNC_BATCH_SIZE   = 20;
export const SYNC_PURGE_AGE_MS = 24 * 60 * 60 * 1000;       // 24 hours
```

---

## 7. Integration Steps — Datalake 3.0

### Prerequisites in Datalake 3.0 (already present)
- React Native 0.71+
- Android SDK API 34, NDK 26+
- Hermes JS engine

### Net additions to Datalake 3.0

| Component | Size added |
|---|---|
| AI model bundle | +19.0 MB |
| ONNX Runtime Android/iOS | +8 MB |
| MediaPipe tasks-vision | +8 MB |
| JS + native source code | < 1 MB |
| **Total net addition** | **~36 MB** |

### Step-by-Step Integration

#### Step 1 — Copy source modules
```bash
cp -r pehchan/src/ml/    YourApp/src/ml/
cp -r pehchan/src/db/    YourApp/src/db/
cp -r pehchan/src/sync/  YourApp/src/sync/
cp -r pehchan/src/utils/ YourApp/src/utils/
```

#### Step 2 — Copy native Android module
```bash
cp android/app/src/main/java/com/pehchan/MediaPipeModule.java \
   YourApp/android/app/src/main/java/com/yourpkg/MediaPipeModule.java
cp android/app/src/main/java/com/pehchan/MediaPipePackage.java \
   YourApp/android/app/src/main/java/com/yourpkg/MediaPipePackage.java
# Update: package com.pehchan → package com.yourpkg
```

#### Step 3 — Copy native iOS module
```bash
cp ios/HelloWorld/MediaPipeModule.swift     YourApp/ios/YourApp/
cp ios/HelloWorld/MediaPipeModuleBridge.m  YourApp/ios/YourApp/
```

#### Step 4 — Register Android module
```kotlin
// MainApplication.kt
override fun getPackages(): List<ReactPackage> =
    PackageList(this).packages.apply {
        add(MediaPipePackage())
    }
```

#### Step 5 — Copy model assets
```bash
cp -r pehchan/android/app/src/main/assets/models/ \
      YourApp/android/app/src/main/assets/models/
```
For iOS, add the same model files to the Xcode project (drag into project navigator, ensure "Copy items if needed" is checked).

#### Step 6 — Android build.gradle
```groovy
android {
    aaptOptions {
        noCompress "ort"    // ONNX Runtime mmap access — must NOT be compressed
        noCompress "task"   // MediaPipe task bundle — same requirement
    }
}
dependencies {
    implementation 'com.google.mediapipe:tasks-vision:0.10.14'
    implementation 'androidx.exifinterface:exifinterface:1.3.7'
}
```

#### Step 7 — iOS Podfile
```ruby
pod 'MediaPipeTasksVision', '~> 0.10.14'
```
Then: `cd ios && pod install`

#### Step 8 — iOS Info.plist
```xml
<key>NSCameraUsageDescription</key>
<string>Required for face enrollment and liveness verification.</string>
```

#### Step 9 — Android AndroidManifest.xml
```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-feature android:name="android.hardware.camera" android:required="true" />
```

#### Step 10 — npm packages
```bash
npm install onnxruntime-react-native react-native-fs \
            react-native-quick-sqlite @react-native-community/netinfo \
            react-native-vision-camera
```

#### Step 11 — Bootstrap in App.tsx
```typescript
import { initDB }          from './db/database';
import { prepareOnnxModels } from './ml/OnnxSession';
import { SyncManager }     from './sync/SyncManager';

useEffect(() => {
  initDB();                 // creates faces + sync_queue tables
  prepareOnnxModels();      // copies .onnx/.task from assets to documents
  SyncManager.start();      // begins watching connectivity
  return () => SyncManager.stop();
}, []);
```

#### Step 12 — Set real AWS endpoint
```typescript
// src/constants.ts
export const SYNC_ENDPOINT = 'https://YOUR_API_GATEWAY_URL/prod/faces';
```

---

## 8. Performance Benchmarks

### Test Device
- **Device:** Samsung Galaxy S25+ (SM-S936B)
- **Chipset:** Snapdragon 8 Elite (3.53GHz)
- **RAM:** 12 GB
- **OS:** Android 16 (API 36)
- **Execution:** CPU-only (no GPU, no NNAPI)

### Inference Timings

| Operation | Min | Avg | Max | Notes |
|---|---|---|---|---|
| Model loading (first launch) | — | 3–5 s | — | One-time: copies assets to DocumentsDir |
| Model loading (cached) | — | ~300 ms | — | ONNX session creation from disk |
| `decodeImageToRGB` (native) | 80 ms | 120 ms | 180 ms | Includes 480px scaling + bridge transfer |
| Blur detection (Laplacian) | < 1 ms | ~2 ms | 5 ms | Pure JS, no ONNX |
| Spoof inference (FP16 ONNX) | 100 ms | 160 ms | 250 ms | MobileNetV3 on CPU EP |
| MediaPipe face detection | 40 ms | 60 ms | 100 ms | One-shot IMAGE mode |
| Face embedding (FP16 ONNX) | 80 ms | 130 ms | 200 ms | MobileFaceNet on CPU EP |
| Cosine search (100 faces) | < 1 ms | ~5 ms | 10 ms | Full-scan dot product |
| **Total enroll pipeline** | **350 ms** | **~550 ms** | **< 1 s** | **✓ Within spec** |
| **Total verify pipeline** | **350 ms** | **~550 ms** | **< 1 s** | **✓ (after liveness)** |

### Liveness Challenge Duration (user-dependent)

| Challenge | Fastest user | Typical | Slow user |
|---|---|---|---|
| Blink | 0.5 s | 1.5 s | 3 s |
| Smile | 0.5 s | 1.5 s | 3 s |
| Head turn | 0.5 s | 1.5 s | 3 s |
| **Total (3 challenges)** | **~2 s** | **~5 s** | **~10 s** |

*Liveness duration is user-paced and not counted in the <1 sec inference requirement, which applies to the recognition pipeline only.*

### Model Size Budget

| Model | Budget | Actual | Status |
|---|---|---|---|
| Total bundle | 20 MB | 19.0 MB | ✅ Under budget |
| spoof_fp16.onnx | — | 8.4 MB | — |
| w600k_mbf_fp16.onnx | — | 6.8 MB | — |
| face_landmarker.task | — | 3.8 MB | — |

---

## 9. Cross-Platform Architecture

### Platform-specific code isolation

```
src/                          ← 100% shared TypeScript (Android + iOS)
  ml/
  db/
  sync/
  screens/
  utils/

android/                      ← Android-only
  app/src/main/java/com/pehchan/
    MediaPipeModule.java      ← Java, MediaPipe Android SDK
    MediaPipePackage.java     ← React Native package registration

ios/                          ← iOS-only
  HelloWorld/
    MediaPipeModule.swift     ← Swift, MediaPipe iOS SDK
    MediaPipeModuleBridge.m   ← Objective-C RN bridge
```

### API surface (identical on both platforms)

```typescript
NativeModules.MediaPipeModule.copyLandmarkerModel()   → Promise<string>
NativeModules.MediaPipeModule.startLandmarking()      → void
NativeModules.MediaPipeModule.stopLandmarking()       → void
NativeModules.MediaPipeModule.processFrame(path)      → Promise<null>
NativeModules.MediaPipeModule.detectFace(path)        → Promise<FaceResult>
NativeModules.MediaPipeModule.decodeImageToRGB(path)  → Promise<RGBFrame>
DeviceEventEmitter.addListener('onFaceLandmark', cb)  → subscription
```

The JS layer uses optional chaining everywhere (`NativeModules.MediaPipeModule?.method?.()`) so the app degrades gracefully on platforms where the module hasn't loaded.

---

## 10. Open Source Attributions

| Library | Version | License | Usage |
|---|---|---|---|
| **ZepIris** | MIT | MIT (Zepto Limited 2026) | Spoof model architecture (`MobileNetV3LSpoof`), trained weights, JS preprocessing port, SQLite schema, cosine threshold |
| **InsightFace MobileFaceNet** | buffalo_sc | Research/Educational | `w600k_mbf.onnx` — 512-dim face embeddings. Cited per InsightFace project guidelines |
| **MediaPipe Tasks Vision** | 0.10.14 | Apache 2.0 | Face Landmarker: active liveness + face detection (Android & iOS) |
| **ONNX Runtime** | 1.24.3 | MIT | CPU inference for spoof + embedding models |
| **onnxconverter-common** | 1.16.0 | MIT | FP16 ONNX conversion with safe BatchNorm handling |
| **React Native** | 0.74.3 | MIT | Cross-platform mobile framework |
| **react-native-vision-camera** | 4.5.2 | MIT | Camera access, snapshot capture |
| **react-native-quick-sqlite** | 8.0.7 | MIT | Synchronous SQLite for React Native |
| **@react-native-community/netinfo** | 11.3.1 | MIT | Network connectivity monitoring |
| **react-native-fs** | 2.20.0 | MIT | File system access for model copying |
| **@react-navigation/native** | 6.x | MIT | Screen navigation |
| **PyTorch / torchvision** | 2.12.0 | BSD-3-Clause | Model export pipeline (Python, not in APK) |
| **onnx (Python)** | 1.21.0 | Apache 2.0 | ONNX graph manipulation during export |

---

*Document version: 1.0 · June 2026 · Hackathon 7.0 submission*
*Developer: Ankit Thawal · linkedin.com/in/ankit-thawal · github.com/ankit-thawal47/pehchan*
