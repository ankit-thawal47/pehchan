// Thresholds (mirror zepiris/config.py defaults)
export const SPOOF_THRESHOLD = 0.3;          // prob_live > 0.3 = genuine (FP16 model, calibrated for mobile)
export const BLUR_LAPLACIAN_THRESHOLD = 15;  // variance < 15 = blurry (phone JPEG snapshots score 20-80)
export const COSINE_ACCEPT_THRESHOLD = 0.5;  // similarity >= 0.5 = match

// Model filenames (must match android/app/src/main/assets/models/)
export const MODEL_SPOOF = 'spoof_fp16.onnx';
export const MODEL_FACENET = 'w600k_mbf_fp16.onnx';
export const MODEL_LANDMARKER = 'face_landmarker.task';

// Embedding
export const EMBEDDING_DIM = 512;

// ImageNet normalization constants (from zepiris/ml_inference/spoof_detection.py)
export const IMAGENET_MEAN = [0.485, 0.456, 0.406];
export const IMAGENET_STD = [0.229, 0.224, 0.225];

// Liveness challenge thresholds
export const BLINK_CLOSED_THRESHOLD = 0.3;   // eyeBlink blend shape < 0.3 = eyes closed
export const BLINK_OPEN_THRESHOLD = 0.7;     // eyeBlink blend shape > 0.7 = eyes open
export const SMILE_THRESHOLD = 1.0;          // mouthSmileLeft + mouthSmileRight
export const HEAD_TURN_YAW_DEG = 20;         // euler yaw > 20deg = head turned

// Sync
export const SYNC_ENDPOINT = 'https://httpbin.org/post'; // swap for real AWS endpoint
export const SYNC_MAX_RETRIES = 3;
export const SYNC_BATCH_SIZE = 20;
export const SYNC_PURGE_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

// Multi-tenancy
export const DEFAULT_TENANT = 'default';
