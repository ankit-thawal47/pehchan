/**
 * ONNX Runtime session manager.
 *
 * On first launch, copies model files from Android assets to the app's
 * private files directory (ONNX Runtime requires a real file path, not
 * an asset URI). Sessions are cached as singletons after creation to
 * avoid the 200-400ms init cost on every inference call.
 */

import {InferenceSession} from 'onnxruntime-react-native';
import RNFS from 'react-native-fs';
import {NativeModules} from 'react-native';
import {MODEL_SPOOF, MODEL_FACENET} from '../constants';

const MODEL_DIR = `${RNFS.DocumentDirectoryPath}/models`;
const SESSION_CACHE: Record<string, InferenceSession> = {};

/** Copy all model files from assets to the files directory on first launch. */
export async function prepareOnnxModels(): Promise<void> {
  await RNFS.mkdir(MODEL_DIR);

  // Copy ONNX models
  for (const modelFile of [MODEL_SPOOF, MODEL_FACENET]) {
    const destPath = `${MODEL_DIR}/${modelFile}`;
    const exists = await RNFS.exists(destPath);
    if (!exists) {
      console.log(`[OnnxSession] Copying ${modelFile} from assets...`);
      await RNFS.copyFileAssets(`models/${modelFile}`, destPath);
      console.log(`[OnnxSession] ${modelFile} ready.`);
    }
  }

  // Copy MediaPipe face landmarker task via native module (handles binary correctly)
  await NativeModules.MediaPipeModule?.copyLandmarkerModel?.();
}

/** Get or create a cached InferenceSession for the given model filename. */
export async function getSession(modelFile: string): Promise<InferenceSession> {
  if (SESSION_CACHE[modelFile]) {
    return SESSION_CACHE[modelFile];
  }

  const modelPath = `${MODEL_DIR}/${modelFile}`;
  console.log(`[OnnxSession] Creating session for ${modelFile}...`);

  const session = await InferenceSession.create(modelPath, {
    executionProviders: ['cpu'],
    graphOptimizationLevel: 'all',
  });

  SESSION_CACHE[modelFile] = session;
  console.log(`[OnnxSession] Session ready: ${modelFile}`);
  return session;
}
