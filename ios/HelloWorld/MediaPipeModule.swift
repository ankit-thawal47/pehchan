import Foundation
import MediaPipeTasksVision
import UIKit

@objc(MediaPipeModule)
class MediaPipeModule: RCTEventEmitter {

  private static let MAX_DIM: CGFloat = 480
  private static let MODEL_FILENAME = "face_landmarker"
  private static let MODEL_EXT = "task"
  private static let MODEL_DIR = "models"

  private var streamingLandmarker: FaceLandmarker?
  private var hasListeners = false

  // MARK: - RCTEventEmitter

  override func supportedEvents() -> [String]! {
    return ["onFaceLandmark"]
  }

  override func startObserving() { hasListeners = true }
  override func stopObserving() { hasListeners = false }

  override static func requiresMainQueueSetup() -> Bool { return false }

  // MARK: - Copy .task from bundle to documents (called once on startup)

  @objc func copyLandmarkerModel(_ resolve: @escaping RCTPromiseResolveBlock,
                                  rejecter reject: @escaping RCTPromiseRejectBlock) {
    let dest = modelDestinationURL()
    if FileManager.default.fileExists(atPath: dest.path) {
      resolve(dest.path)
      return
    }
    guard let src = Bundle.main.path(forResource: Self.MODEL_FILENAME,
                                     ofType: Self.MODEL_EXT,
                                     inDirectory: Self.MODEL_DIR) else {
      reject("COPY_ERROR", "face_landmarker.task not found in app bundle", nil)
      return
    }
    do {
      try FileManager.default.createDirectory(at: dest.deletingLastPathComponent(),
                                              withIntermediateDirectories: true)
      try FileManager.default.copyItem(atPath: src, toPath: dest.path)
      resolve(dest.path)
    } catch {
      reject("COPY_ERROR", error.localizedDescription, error)
    }
  }

  // MARK: - Streaming landmarker (active liveness)

  @objc func startLandmarking() {
    DispatchQueue.global(qos: .userInitiated).async {
      do {
        let modelPath = self.modelDestinationURL().path
        guard FileManager.default.fileExists(atPath: modelPath) else { return }

        let options = FaceLandmarkerOptions()
        options.baseOptions = BaseOptions(modelAssetPath: modelPath)
        options.runningMode = .liveStream
        options.numFaces = 1
        options.outputFaceBlendshapes = true
        options.outputFacialTransformationMatrixes = true
        options.faceLandmarkerLiveStreamDelegate = self

        self.streamingLandmarker = try FaceLandmarker(options: options)
      } catch {
        NSLog("[MediaPipeModule] startLandmarking error: \(error)")
      }
    }
  }

  @objc func stopLandmarking() {
    streamingLandmarker = nil
  }

  @objc func processFrame(_ imagePath: String,
                           resolver resolve: @escaping RCTPromiseResolveBlock,
                           rejecter reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.global(qos: .userInitiated).async {
      guard let landmarker = self.streamingLandmarker,
            let image = UIImage(contentsOfFile: imagePath),
            let mpImage = try? MPImage(uiImage: image) else {
        resolve(nil)
        return
      }
      do {
        let ts = Int(Date().timeIntervalSince1970 * 1000)
        try landmarker.detectAsync(image: mpImage, timestampInMilliseconds: ts)
        resolve(nil)
      } catch {
        resolve(nil)
      }
    }
  }

  // MARK: - One-shot face detection (for bbox + enroll)

  @objc func detectFace(_ imagePath: String,
                         resolver resolve: @escaping RCTPromiseResolveBlock,
                         rejecter reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.global(qos: .userInitiated).async {
      guard let image = UIImage(contentsOfFile: imagePath) else {
        reject("DECODE_FAILED", "Cannot load image: \(imagePath)", nil)
        return
      }
      let modelPath = self.modelDestinationURL().path
      guard FileManager.default.fileExists(atPath: modelPath) else {
        reject("MODEL_MISSING", "face_landmarker.task not found at \(modelPath)", nil)
        return
      }
      do {
        let options = FaceLandmarkerOptions()
        options.baseOptions = BaseOptions(modelAssetPath: modelPath)
        options.runningMode = .image
        options.numFaces = 1
        options.outputFaceBlendshapes = true
        options.outputFacialTransformationMatrixes = true

        let landmarker = try FaceLandmarker(options: options)
        guard let mpImage = try? MPImage(uiImage: image) else {
          reject("IMAGE_ERROR", "Cannot create MPImage", nil)
          return
        }
        let result = try landmarker.detect(image: mpImage)

        let out = NSMutableDictionary()
        guard !result.faceLandmarks.isEmpty else {
          out["faceDetected"] = false
          resolve(out)
          return
        }

        out["faceDetected"] = true

        // Bounding box from landmarks (normalised 0..1)
        let landmarks = result.faceLandmarks[0]
        let xs = landmarks.map { $0.x }
        let ys = landmarks.map { $0.y }
        out["bbox"] = [xs.min()!, ys.min()!, xs.max()!, ys.max()!]

        // Blend shapes
        if let shapes = result.faceBlendshapes, !shapes.isEmpty {
          let shapeMap = NSMutableDictionary()
          for cat in shapes[0] {
            shapeMap[cat.categoryName ?? ""] = cat.score
          }
          out["blendShapes"] = shapeMap
        }

        // Euler angles from transformation matrix
        if let matrices = result.facialTransformationMatrixes, !matrices.isEmpty {
          let m = matrices[0].data
          let yaw   = atan2(m[8], m[10]) * 180.0 / Float.pi
          let pitch = atan2(-m[9], sqrt(m[8]*m[8] + m[10]*m[10])) * 180.0 / Float.pi
          let roll  = atan2(m[1], m[5]) * 180.0 / Float.pi
          out["eulerAngles"] = ["yaw": yaw, "pitch": pitch, "roll": roll]
        }

        resolve(out)
      } catch {
        reject("DETECT_ERROR", error.localizedDescription, error)
      }
    }
  }

  // MARK: - Decode image to RGB array (for ONNX preprocessing)

  @objc func decodeImageToRGB(_ imagePath: String,
                               resolver resolve: @escaping RCTPromiseResolveBlock,
                               rejecter reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.global(qos: .userInitiated).async {
      // UIImage handles EXIF rotation automatically — no manual rotation needed
      guard var image = UIImage(contentsOfFile: imagePath) else {
        reject("DECODE_FAILED", "Cannot load image: \(imagePath)", nil)
        return
      }

      // Scale down to MAX_DIM
      let maxDim = Self.MAX_DIM
      let w = image.size.width, h = image.size.height
      if max(w, h) > maxDim {
        let scale = maxDim / max(w, h)
        let newSize = CGSize(width: w * scale, height: h * scale)
        UIGraphicsBeginImageContextWithOptions(newSize, true, 1.0)
        image.draw(in: CGRect(origin: .zero, size: newSize))
        image = UIGraphicsGetImageFromCurrentImageContext() ?? image
        UIGraphicsEndImageContext()
      }

      guard let cgImage = image.cgImage else {
        reject("DECODE_FAILED", "Cannot get CGImage", nil)
        return
      }

      let width  = cgImage.width
      let height = cgImage.height
      var rawPixels = [UInt8](repeating: 0, count: width * height * 4)

      guard let ctx = CGContext(
        data: &rawPixels,
        width: width, height: height,
        bitsPerComponent: 8,
        bytesPerRow: width * 4,
        space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
      ) else {
        reject("DECODE_FAILED", "Cannot create CGContext", nil)
        return
      }
      ctx.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))

      // Pack RGB (skip alpha)
      var rgbArray = [Int]()
      rgbArray.reserveCapacity(width * height * 3)
      for i in 0..<width * height {
        rgbArray.append(Int(rawPixels[i * 4]))
        rgbArray.append(Int(rawPixels[i * 4 + 1]))
        rgbArray.append(Int(rawPixels[i * 4 + 2]))
      }

      let out: [String: Any] = ["width": width, "height": height, "data": rgbArray]
      resolve(out)
    }
  }

  // MARK: - Helpers

  private func modelDestinationURL() -> URL {
    let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
    return docs
      .appendingPathComponent("models")
      .appendingPathComponent("\(Self.MODEL_FILENAME).\(Self.MODEL_EXT)")
  }
}

// MARK: - FaceLandmarkerLiveStreamDelegate

extension MediaPipeModule: FaceLandmarkerLiveStreamDelegate {
  func faceLandmarker(_ faceLandmarker: FaceLandmarker,
                      didFinishDetection result: FaceLandmarkerResult?,
                      timestampInMilliseconds: Int,
                      error: Error?) {
    guard hasListeners, let result = result else { return }

    let out = NSMutableDictionary()
    out["faceDetected"] = !result.faceLandmarks.isEmpty

    if !result.faceLandmarks.isEmpty {
      let landmarks = result.faceLandmarks[0]
      let xs = landmarks.map { $0.x }
      let ys = landmarks.map { $0.y }
      out["bbox"] = [xs.min()!, ys.min()!, xs.max()!, ys.max()!]

      if let shapes = result.faceBlendshapes, !shapes.isEmpty {
        let shapeMap = NSMutableDictionary()
        for cat in shapes[0] { shapeMap[cat.categoryName ?? ""] = cat.score }
        out["blendShapes"] = shapeMap
      }

      if let matrices = result.facialTransformationMatrixes, !matrices.isEmpty {
        let m = matrices[0].data
        out["eulerAngles"] = [
          "yaw":   atan2(m[8],  m[10]) * 180.0 / Float.pi,
          "pitch": atan2(-m[9], sqrt(m[8]*m[8] + m[10]*m[10])) * 180.0 / Float.pi,
          "roll":  atan2(m[1],  m[5])  * 180.0 / Float.pi,
        ]
      }
    }

    sendEvent(withName: "onFaceLandmark", body: out)
  }
}
