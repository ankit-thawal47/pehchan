package com.pehchan;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.Log;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import com.google.mediapipe.framework.image.BitmapImageBuilder;
import com.google.mediapipe.framework.image.MPImage;
import com.google.mediapipe.tasks.components.containers.NormalizedLandmark;
import com.google.mediapipe.tasks.core.BaseOptions;
import com.google.mediapipe.tasks.vision.core.RunningMode;
import com.google.mediapipe.tasks.vision.facelandmarker.FaceLandmarker;
import com.google.mediapipe.tasks.vision.facelandmarker.FaceLandmarkerResult;
import com.google.mediapipe.tasks.vision.facelandmarker.FaceLandmarker.FaceLandmarkerOptions;

import androidx.exifinterface.media.ExifInterface;
import android.graphics.Matrix;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.util.List;
import java.util.Map;

public class MediaPipeModule extends ReactContextBaseJavaModule {

    private static final String TAG = "MediaPipeModule";
    private static final String MODEL_FILENAME = "face_landmarker.task";
    private static final String EVENT_FACE_LANDMARK = "onFaceLandmark";

    private final ReactApplicationContext reactContext;
    private FaceLandmarker streamingLandmarker;
    private boolean isLandmarking = false;

    public MediaPipeModule(ReactApplicationContext context) {
        super(context);
        this.reactContext = context;
    }

    @NonNull
    @Override
    public String getName() {
        return "MediaPipeModule";
    }

    // -----------------------------------------------------------------------
    // Model path helper
    // -----------------------------------------------------------------------

    private String getModelPath() {
        // Models are copied from assets to DocumentDirectory on first launch (via OnnxSession.ts)
        // Face landmarker task file lives alongside ONNX models
        return reactContext.getFilesDir().getAbsolutePath() + "/models/" + MODEL_FILENAME;
    }

    // -----------------------------------------------------------------------
    // Streaming liveness: start / stop
    // -----------------------------------------------------------------------

    @ReactMethod
    public void startLandmarking() {
        if (isLandmarking) return;

        File modelFile = new File(getModelPath());
        if (!modelFile.exists()) {
            Log.e(TAG, "face_landmarker.task not found at " + modelFile.getAbsolutePath());
            return;
        }

        try {
            FaceLandmarkerOptions options = FaceLandmarkerOptions.builder()
                    .setBaseOptions(BaseOptions.builder()
                            .setModelAssetPath(modelFile.getAbsolutePath())
                            .build())
                    .setRunningMode(RunningMode.LIVE_STREAM)
                    .setNumFaces(1)
                    .setOutputFaceBlendshapes(true)
                    .setOutputFacialTransformationMatrixes(true)
                    .setResultListener(this::onLandmarkResult)
                    .setErrorListener((error) -> Log.e(TAG, "Landmarker error: " + error.getMessage()))
                    .build();

            streamingLandmarker = FaceLandmarker.createFromOptions(reactContext, options);
            isLandmarking = true;
            Log.d(TAG, "Streaming landmarker started.");
        } catch (Exception e) {
            Log.e(TAG, "Failed to create streaming landmarker: " + e.getMessage());
        }
    }

    @ReactMethod
    public void stopLandmarking() {
        isLandmarking = false;
        if (streamingLandmarker != null) {
            streamingLandmarker.close();
            streamingLandmarker = null;
        }
        Log.d(TAG, "Streaming landmarker stopped.");
    }

    // -----------------------------------------------------------------------
    // Process a camera frame for liveness (called from VisionCamera frame processor
    // or periodically from JS)
    // -----------------------------------------------------------------------

    @ReactMethod
    public void processFrame(String imagePath, Promise promise) {
        if (!isLandmarking || streamingLandmarker == null) {
            promise.reject("NOT_STARTED", "Call startLandmarking() first.");
            return;
        }
        try {
            Bitmap bitmap = BitmapFactory.decodeFile(imagePath);
            if (bitmap == null) {
                promise.reject("DECODE_FAILED", "Failed to decode image: " + imagePath);
                return;
            }
            MPImage mpImage = new BitmapImageBuilder(bitmap).build();
            streamingLandmarker.detectAsync(mpImage, System.currentTimeMillis());
            promise.resolve(null);
        } catch (Exception e) {
            promise.reject("PROCESS_ERROR", e.getMessage());
        }
    }

    private void onLandmarkResult(FaceLandmarkerResult result, MPImage image) {
        if (!reactContext.hasActiveCatalystInstance()) return;

        WritableMap event = Arguments.createMap();
        boolean faceDetected = result.faceLandmarks() != null && !result.faceLandmarks().isEmpty();
        event.putBoolean("faceDetected", faceDetected);
        event.putInt("frameWidth", image.getWidth());
        event.putInt("frameHeight", image.getHeight());

        if (faceDetected) {
            // Bounding box from landmarks (min/max of x,y)
            List<NormalizedLandmark> landmarks = result.faceLandmarks().get(0);
            float minX = 1f, minY = 1f, maxX = 0f, maxY = 0f;
            for (NormalizedLandmark lm : landmarks) {
                if (lm.x() < minX) minX = lm.x();
                if (lm.y() < minY) minY = lm.y();
                if (lm.x() > maxX) maxX = lm.x();
                if (lm.y() > maxY) maxY = lm.y();
            }
            WritableArray bbox = Arguments.createArray();
            bbox.pushDouble(minX);
            bbox.pushDouble(minY);
            bbox.pushDouble(maxX);
            bbox.pushDouble(maxY);
            event.putArray("bbox", bbox);

            // Blend shapes
            WritableMap blendShapes = Arguments.createMap();
            if (result.faceBlendshapes().isPresent() && !result.faceBlendshapes().get().isEmpty()) {
                for (com.google.mediapipe.tasks.components.containers.Category cat :
                        result.faceBlendshapes().get().get(0)) {
                    blendShapes.putDouble(cat.categoryName(), cat.score());
                }
            }
            event.putMap("blendShapes", blendShapes);

            // Euler angles from facial transformation matrix
            WritableMap eulerAngles = Arguments.createMap();
            if (result.facialTransformationMatrixes().isPresent()
                    && !result.facialTransformationMatrixes().get().isEmpty()) {
                float[] matrix = result.facialTransformationMatrixes().get().get(0);
                // Extract yaw (rotation around Y axis) from 4x4 transform matrix
                double yaw = Math.toDegrees(Math.atan2(matrix[2], matrix[10]));
                double pitch = Math.toDegrees(Math.asin(-matrix[6]));
                double roll = Math.toDegrees(Math.atan2(matrix[4], matrix[5]));
                eulerAngles.putDouble("yaw", yaw);
                eulerAngles.putDouble("pitch", pitch);
                eulerAngles.putDouble("roll", roll);
            } else {
                eulerAngles.putDouble("yaw", 0);
                eulerAngles.putDouble("pitch", 0);
                eulerAngles.putDouble("roll", 0);
            }
            event.putMap("eulerAngles", eulerAngles);
        } else {
            event.putNull("bbox");
            WritableMap blendShapes = Arguments.createMap();
            event.putMap("blendShapes", blendShapes);
            WritableMap eulerAngles = Arguments.createMap();
            eulerAngles.putDouble("yaw", 0);
            eulerAngles.putDouble("pitch", 0);
            eulerAngles.putDouble("roll", 0);
            event.putMap("eulerAngles", eulerAngles);
        }

        reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                .emit(EVENT_FACE_LANDMARK, event);
    }

    // -----------------------------------------------------------------------
    // One-shot face detection (for enrollment and post-liveness capture)
    // -----------------------------------------------------------------------

    @ReactMethod
    public void detectFace(String imagePath, Promise promise) {
        File modelFile = new File(getModelPath());
        if (!modelFile.exists()) {
            promise.reject("MODEL_NOT_FOUND", "face_landmarker.task not found");
            return;
        }

        try {
            FaceLandmarkerOptions options = FaceLandmarkerOptions.builder()
                    .setBaseOptions(BaseOptions.builder()
                            .setModelAssetPath(modelFile.getAbsolutePath())
                            .build())
                    .setRunningMode(RunningMode.IMAGE)
                    .setNumFaces(1)
                    .setOutputFaceBlendshapes(false)
                    .build();

            FaceLandmarker landmarker = FaceLandmarker.createFromOptions(reactContext, options);

            Bitmap bitmap = decodeBitmapFromPath(imagePath);
            if (bitmap == null) {
                promise.reject("DECODE_FAILED", "Failed to decode: " + imagePath);
                return;
            }

            MPImage mpImage = new BitmapImageBuilder(bitmap).build();
            FaceLandmarkerResult result = landmarker.detect(mpImage);
            landmarker.close();

            WritableMap out = Arguments.createMap();
            boolean faceDetected = result.faceLandmarks() != null && !result.faceLandmarks().isEmpty();
            out.putBoolean("faceDetected", faceDetected);
            out.putInt("frameWidth", bitmap.getWidth());
            out.putInt("frameHeight", bitmap.getHeight());

            if (faceDetected) {
                List<NormalizedLandmark> landmarks = result.faceLandmarks().get(0);
                float minX = 1f, minY = 1f, maxX = 0f, maxY = 0f;
                for (NormalizedLandmark lm : landmarks) {
                    if (lm.x() < minX) minX = lm.x();
                    if (lm.y() < minY) minY = lm.y();
                    if (lm.x() > maxX) maxX = lm.x();
                    if (lm.y() > maxY) maxY = lm.y();
                }
                WritableArray bbox = Arguments.createArray();
                bbox.pushDouble(minX);
                bbox.pushDouble(minY);
                bbox.pushDouble(maxX);
                bbox.pushDouble(maxY);
                out.putArray("bbox", bbox);
            } else {
                out.putNull("bbox");
            }

            promise.resolve(out);
        } catch (Exception e) {
            promise.reject("DETECT_ERROR", e.getMessage());
        }
    }

    // -----------------------------------------------------------------------
    // Decode image to RGB bytes (for ONNX preprocessing)
    // -----------------------------------------------------------------------

    private static final int MAX_DIM = 480;

    /** Decode a JPEG to a correctly-oriented, downscaled Bitmap. */
    private Bitmap decodeBitmapFromPath(String imagePath) throws IOException {
        // Read EXIF orientation so front-camera images appear upright
        ExifInterface exif = new ExifInterface(imagePath);
        int orientation = exif.getAttributeInt(
                ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);

        BitmapFactory.Options opts = new BitmapFactory.Options();
        opts.inJustDecodeBounds = true;
        BitmapFactory.decodeFile(imagePath, opts);

        int sampleSize = 1;
        int maxOrigDim = Math.max(opts.outWidth, opts.outHeight);
        while (maxOrigDim / (sampleSize * 2) >= MAX_DIM) sampleSize *= 2;

        opts.inJustDecodeBounds = false;
        opts.inSampleSize = sampleSize;
        opts.inPreferredConfig = Bitmap.Config.ARGB_8888;
        Bitmap bitmap = BitmapFactory.decodeFile(imagePath, opts);
        if (bitmap == null) return null;

        // Scale down if still larger than MAX_DIM
        int w = bitmap.getWidth(), h = bitmap.getHeight();
        if (Math.max(w, h) > MAX_DIM) {
            float scale = (float) MAX_DIM / Math.max(w, h);
            bitmap = Bitmap.createScaledBitmap(bitmap,
                    Math.round(w * scale), Math.round(h * scale), true);
        }

        // Apply EXIF rotation
        Matrix matrix = new Matrix();
        switch (orientation) {
            case ExifInterface.ORIENTATION_ROTATE_90:  matrix.postRotate(90);  break;
            case ExifInterface.ORIENTATION_ROTATE_180: matrix.postRotate(180); break;
            case ExifInterface.ORIENTATION_ROTATE_270: matrix.postRotate(270); break;
            case ExifInterface.ORIENTATION_FLIP_HORIZONTAL: matrix.postScale(-1, 1); break;
            default: break;
        }
        if (!matrix.isIdentity()) {
            bitmap = Bitmap.createBitmap(bitmap, 0, 0,
                    bitmap.getWidth(), bitmap.getHeight(), matrix, true);
        }
        return bitmap;
    }

    @ReactMethod
    public void decodeImageToRGB(String imagePath, Promise promise) {
        try {
            Bitmap bitmap = decodeBitmapFromPath(imagePath);

            if (bitmap == null) {
                promise.reject("DECODE_FAILED", "Cannot decode: " + imagePath);
                return;
            }

            int w = bitmap.getWidth(), h = bitmap.getHeight();

            int[] pixels = new int[w * h];
            bitmap.getPixels(pixels, 0, w, 0, 0, w, h);

            // Pack as RGB ints — at 480x480 max this is ~692K values, manageable
            WritableArray rgbArray = Arguments.createArray();
            for (int px : pixels) {
                rgbArray.pushInt((px >> 16) & 0xFF); // R
                rgbArray.pushInt((px >> 8) & 0xFF);  // G
                rgbArray.pushInt(px & 0xFF);          // B
            }

            WritableMap out = Arguments.createMap();
            out.putInt("width", w);
            out.putInt("height", h);
            out.putArray("data", rgbArray);

            promise.resolve(out);
        } catch (Exception e) {
            promise.reject("RGB_ERROR", e.getMessage());
        }
    }

    // -----------------------------------------------------------------------
    // Copy face_landmarker.task from assets to files dir (called once on startup)
    // -----------------------------------------------------------------------

    @ReactMethod
    public void copyLandmarkerModel(Promise promise) {
        File dest = new File(reactContext.getFilesDir(), "models/" + MODEL_FILENAME);
        if (dest.exists()) {
            promise.resolve(dest.getAbsolutePath());
            return;
        }
        dest.getParentFile().mkdirs();
        try {
            byte[] buf = new byte[65536];
            int read;
            java.io.InputStream in = reactContext.getAssets().open("models/" + MODEL_FILENAME);
            java.io.OutputStream out = new java.io.FileOutputStream(dest);
            while ((read = in.read(buf)) != -1) out.write(buf, 0, read);
            in.close();
            out.close();
            promise.resolve(dest.getAbsolutePath());
        } catch (IOException e) {
            promise.reject("COPY_ERROR", e.getMessage());
        }
    }
}
