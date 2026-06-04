# Pehchaan — Offline Face Authentication for Android

> **पहचान** · *Recognition · Identity · Presence*

A fully offline React Native Android application for secure facial recognition and liveness detection. Built for **Hackathon 7.0** — field personnel authentication that works in zero-network zones.

**Developer:** Ankit Thawal · [linkedin.com/in/ankit-thawal](https://www.linkedin.com/in/ankit-thawal)

---

## Honest App Size Breakdown

The hackathon criterion specifies **~20 MB for the AI model bundle**. Here is the full honest breakdown:

### AI Model Bundle — 19.0 MB ✓ (within 20 MB spec)

| Model | Format | Size | Purpose |
|---|---|---|---|
| `spoof_fp16.onnx` | FP16 ONNX | 8.4 MB | Passive anti-spoofing (MobileNetV3-Large) |
| `w600k_mbf_fp16.onnx` | FP16 ONNX | 6.8 MB | Face embedding 512-dim (MobileFaceNet) |
| `face_landmarker.task` | MediaPipe Float16 | 3.8 MB | Active liveness + face detection |
| **Total** | | **19.0 MB** | |

**Compression achieved:** Original model sources totalled 348+ MB. FP16 ONNX export brings this to 19 MB — **95% reduction**.

### Total Installed App Size

| Build type | Installed size |
|---|---|
| Debug APK (all architectures) | ~180–220 MB |
| Release APK (arm64-v8a only) | ~60–80 MB |

The app includes React Native framework, ONNX Runtime, and MediaPipe as native libraries. When integrated into the existing **Datalake 3.0** (which already ships React Native), the net addition would be:

| Component | Addition to Datalake 3.0 |
|---|---|
| AI model bundle | +19 MB |
| ONNX Runtime native lib (new) | +8 MB |
| MediaPipe tasks-vision (new) | +8 MB |
| JS source code | < 1 MB |
| **Net addition to Datalake 3.0** | **~36 MB** |

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Pehchaan (React Native)               │
│                                                         │
│  ┌──────────┐   ┌──────────┐   ┌─────────────────────┐ │
│  │  Enroll  │   │  Verify  │   │    Sync Manager     │ │
│  │  Screen  │   │  Screen  │   │  NetInfo → AWS POST │ │
│  └────┬─────┘   └────┬─────┘   └─────────────────────┘ │
│       │              │                                   │
│  ┌────▼──────────────▼──────────────────────────────┐   │
│  │                 ML Pipeline                       │   │
│  │  Blur Check → Spoof → Face Detect → Embed → Match│   │
│  └──────┬───────────────────┬────────────────────────┘  │
│         │                   │                            │
│  ┌──────▼──────┐   ┌────────▼──────┐                   │
│  │ ONNX Runtime│   │   MediaPipe   │                   │
│  │  (CPU EP)   │   │ Face Landmarker│                  │
│  │ spoof_fp16  │   │ Liveness +    │                   │
│  │ mbf_fp16    │   │ Face Detection│                   │
│  └─────────────┘   └───────────────┘                   │
│                                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │  SQLite  ·  faces table  +  sync_queue table     │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## Open Source Attribution

All components are open source or cited for educational/hackathon use:

| Component | License | Source | Usage in Pehchaan |
|---|---|---|---|
| **ZepIris** | MIT | [github.com/zepto-labs/zepiris](https://github.com/zepto-labs/zepiris) | Spoof model architecture + trained weights, preprocessing pipeline (ported to TypeScript), SQLite schema mirrors Milvus schema, cosine threshold |
| **InsightFace MobileFaceNet** | Research / Educational | [deepinsight/insightface](https://github.com/deepinsight/insightface) | `w600k_mbf.onnx` from `buffalo_sc` — 512-dim face embeddings. Cited for hackathon use per InsightFace project guidelines |
| **MediaPipe Face Landmarker** | Apache 2.0 | [developers.google.com/mediapipe](https://developers.google.com/mediapipe) | Active liveness (blend shapes, euler angles) and face bounding box |
| **ONNX Runtime** | MIT | [microsoft/onnxruntime](https://github.com/microsoft/onnxruntime) | On-device model inference |
| **onnxconverter-common** | MIT | [microsoft/onnxconverter-common](https://github.com/microsoft/onnxconverter-common) | FP16 ONNX model conversion with safe BatchNorm handling |
| **React Native** | MIT | [facebook/react-native](https://github.com/facebook/react-native) | Cross-platform mobile framework |
| **react-native-vision-camera** | MIT | [mrousavy/react-native-vision-camera](https://github.com/mrousavy/react-native-vision-camera) | Camera capture and snapshot |
| **react-native-quick-sqlite** | MIT | [ospfranco/react-native-quick-sqlite](https://github.com/ospfranco/react-native-quick-sqlite) | Synchronous SQLite for React Native |
| **@react-native-community/netinfo** | MIT | [react-native-netinfo](https://github.com/react-native-community/react-native-netinfo) | Network connectivity monitoring for sync trigger |

### How ZepIris Is Used

Pehchaan extends ZepIris (MIT License) in the following specific ways:

1. **Spoof model weights** — `spoof_model.pth` (MobileNetV3-Large, trained by ZepIris) is exported to ONNX FP16 for mobile inference
2. **Preprocessing logic** — `preprocessForSpoof()` in `imageUtils.ts` is a TypeScript port of `zepiris/ml_inference/spoof_detection.py` (ImageNet mean/std normalisation, HWC→CHW)
3. **Data schema** — SQLite `faces` table mirrors ZepIris's Milvus collection: `face_id`, `tenant`, `object_key`, `embedding`, `synced`
4. **Cosine threshold** — `COSINE_ACCEPT_THRESHOLD = 0.5` mirrors `milvus_search_threshold = 0.5` in `zepiris/config.py`

---

## Liveness Detection

### Active Liveness — Primary Anti-Spoofing

A **3-challenge sequence** that a photograph, screen recording, or printed image cannot pass:

```
BLINK  →  SMILE  →  HEAD TURN  →  ✓ VERIFIED
```

| Challenge | Detection method | Threshold |
|---|---|---|
| **Blink** | MediaPipe `eyeBlinkLeft` + `eyeBlinkRight` blend shapes drop then recover | Close < 0.3, then open > 0.7 |
| **Smile** | `mouthSmileLeft + mouthSmileRight` sum | > 1.0 |
| **Head turn** | Euler yaw from facial transformation matrix | > 20° |

### Passive Spoof Detection — Secondary Check

MobileNetV3-Large binary classifier (`spoof_fp16.onnx`) trained on real vs. spoofed face images, run after active liveness passes. If FP16 inference produces NaN (known ARM NEON precision issue with BatchNorm epsilon values), the active liveness challenge remains as the sole protection — it is sufficient against photo/video replay attacks.

---

## Sync & Purge Mechanism

### Overview

Enrollment data is always stored locally first. When connectivity returns, data syncs to AWS and is purged locally after 24 hours.

```
[Enroll — offline]
       │
       ▼
  ┌────────────┐    ┌─────────────────────────────┐
  │ faces DB   │    │ sync_queue                  │
  │ face_id    │───▶│ status = 'pending'           │
  │ embedding  │    │ operation = 'INSERT'         │
  │ name       │    │ retries = 0                 │
  └────────────┘    └──────────────┬──────────────┘
                                   │
                    NetInfo: WiFi/5G connected
                                   │
                                   ▼
                      SyncManager.drainQueue()
                      POST to AWS API Gateway
                      { face_id, tenant, embedding,
                        name, operation, timestamp }
                                   │
                        ┌──────────┴──────────┐
                     Success              Failure (x3)
                        │                     │
                   markDone()           markFailed()
                   synced = 1
                        │
                   After 24h
                   purgeCompleted()
```

### Configuring Your AWS Endpoint

```typescript
// src/constants.ts
export const SYNC_ENDPOINT = 'https://YOUR_API_GATEWAY_URL/prod/faces';
```

The current value (`httpbin.org/post`) is a mock that echoes payloads back — replace with your AWS API Gateway before production use.

### Payload Format

```json
{
  "face_id": "a3f8c1d2-4b5e-6789-abcd-ef1234567890",
  "tenant": "default",
  "operation": "INSERT",
  "embedding": [0.023, -0.141, 0.089, ...],
  "name": "Ankit Thawal",
  "timestamp": 1749081234567
}
```

---

## Performance Benchmarks

Measured on Samsung Galaxy S25+ (Snapdragon 8 Elite, Android 16, CPU-only inference):

| Operation | Time |
|---|---|
| First launch — copy models from assets | ~3–5 s (one-time only) |
| Subsequent launches — cached sessions | ~300 ms |
| Active liveness challenge (blink + smile + turn) | ~5–8 s (user-paced) |
| Passive spoof inference (FP16 ONNX) | ~100–250 ms |
| Face embedding inference (FP16 ONNX) | ~100–200 ms |
| SQLite cosine search (100 enrolled faces) | < 10 ms |
| **Total enroll pipeline** | **< 1 s** ✓ |
| **Total verify pipeline (after liveness)** | **< 1 s** ✓ |

---

## Integration Guide — Adding to Datalake 3.0

### Step 1 — Copy source modules
```bash
cp -r ZepirisMobile/src/ml/    YourApp/src/ml/
cp -r ZepirisMobile/src/db/    YourApp/src/db/
cp -r ZepirisMobile/src/sync/  YourApp/src/sync/
cp -r ZepirisMobile/src/utils/ YourApp/src/utils/
```

### Step 2 — Copy native Android module
```bash
cp android/app/src/main/java/com/zeprismobile/MediaPipeModule.java \
   YourApp/android/app/src/main/java/com/yourpkg/
cp android/app/src/main/java/com/zeprismobile/MediaPipePackage.java \
   YourApp/android/app/src/main/java/com/yourpkg/
```
Update `package com.zeprismobile` → `package com.yourpkg` in both files.

### Step 3 — Register in MainApplication.kt
```kotlin
override fun getPackages(): List<ReactPackage> =
    PackageList(this).packages.apply {
        add(MediaPipePackage())
    }
```

### Step 4 — Copy model assets
```bash
cp -r ZepirisMobile/android/app/src/main/assets/models/ \
      YourApp/android/app/src/main/assets/models/
```

### Step 5 — Update android/app/build.gradle
```groovy
android {
    aaptOptions {
        noCompress "ort"    // ONNX Runtime requires mmap access — must not be compressed
        noCompress "task"   // MediaPipe task bundles also require mmap
    }
}
dependencies {
    implementation 'com.google.mediapipe:tasks-vision:0.10.14'
    implementation 'androidx.exifinterface:exifinterface:1.3.7'
}
```

### Step 6 — Install npm packages
```bash
npm install onnxruntime-react-native react-native-fs \
            react-native-quick-sqlite @react-native-community/netinfo \
            react-native-vision-camera
```

### Step 7 — Bootstrap on app startup
```typescript
import { initDB } from './db/database';
import { prepareOnnxModels } from './ml/OnnxSession';
import { SyncManager } from './sync/SyncManager';

useEffect(() => {
  initDB();
  prepareOnnxModels();
  SyncManager.start();
  return () => SyncManager.stop();
}, []);
```

### Step 8 — Enroll a face
```typescript
import { NativeModules } from 'react-native';
import { detectSpoof } from './ml/SpoofDetector';
import { embedFace } from './ml/FaceEmbedder';
import { insertFace } from './db/faceStore';
import { enqueue } from './db/syncQueue';
import { generateUUID } from './utils/mathUtils';

const photo = await camera.takeSnapshot({ quality: 90 });
const frame = await NativeModules.MediaPipeModule.decodeImageToRGB(photo.path);

const spoof = await detectSpoof(frame);
if (!spoof.isLive) throw new Error('Spoof detected');

const lm = await NativeModules.MediaPipeModule.detectFace(photo.path);
const embed = await embedFace(frame, [
  lm.bbox[0] * frame.width, lm.bbox[1] * frame.height,
  lm.bbox[2] * frame.width, lm.bbox[3] * frame.height,
]);

const faceId = generateUUID();
insertFace(faceId, embed.embedding, 'default', personName);
enqueue(faceId, 'INSERT', { face_id: faceId, embedding: embed.embedding,
                            name: personName, timestamp: Date.now() });
```

### Step 9 — Verify identity
```typescript
import { searchByCosine } from './db/faceStore';

const matches = searchByCosine(embed.embedding, 'default');
const authenticated = matches.length > 0 && matches[0].similarity >= 0.5;
// matches[0].object_key → enrolled person's name
```

### Step 10 — Set real AWS sync endpoint
```typescript
// src/constants.ts
export const SYNC_ENDPOINT = 'https://YOUR_API_GATEWAY_URL/prod/faces';
```

---

## Build Instructions

### Prerequisites
- macOS, Node.js 18+, Java 17 (Corretto)
- Android SDK API 34, NDK 26.1.10909125
- Python 3.12 (model export only)

### Android SDK setup (one-time)
```bash
brew install --cask android-commandlinetools
yes | sdkmanager --licenses
sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0" "ndk;26.1.10909125"

# Add to ~/.zshrc:
export ANDROID_HOME=/usr/local/share/android-commandlinetools
export PATH=$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH
```

### Export models (one-time)
```bash
/opt/homebrew/bin/python3.12 -m venv .venv && source .venv/bin/activate
pip install torch torchvision onnx onnxruntime onnxconverter-common huggingface_hub requests
python scripts/export_models.py
```

### Build debug APK
```bash
npm install

npx react-native bundle \
  --platform android --dev false --entry-file index.js \
  --bundle-output android/app/src/main/assets/index.android.bundle \
  --assets-dest android/app/src/main/res

cd android && ./gradlew assembleDebug
# APK: android/app/build/outputs/apk/debug/app-debug.apk
```

### Install via USB
```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

---

## Key Configuration

```typescript
// src/constants.ts — all tuneable thresholds
SPOOF_THRESHOLD          = 0.3    // sigmoid(logit) > 0.3 = genuine face
BLUR_LAPLACIAN_THRESHOLD = 15     // Laplacian variance < 15 = reject as blurry
COSINE_ACCEPT_THRESHOLD  = 0.5    // dot(embed_a, embed_b) >= 0.5 = match

BLINK_CLOSED_THRESHOLD   = 0.3    // eyeBlink blend shape: closed
BLINK_OPEN_THRESHOLD     = 0.7    // eyeBlink blend shape: open
SMILE_THRESHOLD          = 1.0    // mouthSmileLeft + mouthSmileRight
HEAD_TURN_YAW_DEG        = 20     // euler yaw degrees for head turn challenge

SYNC_MAX_RETRIES         = 3
SYNC_PURGE_AGE_MS        = 86400000   // purge synced queue entries after 24h
SYNC_ENDPOINT            = 'https://httpbin.org/post'  // replace for production
```