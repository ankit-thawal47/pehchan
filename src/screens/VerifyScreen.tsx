/**
 * Verify Screen — active liveness → capture → passive checks → embed → cosine search.
 *
 * Flow:
 *   1. LivenessChecker runs challenge state machine (blink → smile → head turn)
 *   2. On COMPLETE, auto-capture a snapshot
 *   3. Run blur + spoof checks on the snapshot
 *   4. Generate face embedding from snapshot + MediaPipe bbox
 *   5. Search SQLite with cosine similarity
 *   6. Navigate to ResultScreen
 */

import React, {useRef, useState, useEffect, useCallback} from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Text,
  SafeAreaView,
  NativeModules,
} from 'react-native';
import {Camera, useCameraDevice} from 'react-native-vision-camera';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';

import {LivenessChecker, type LivenessState} from '../ml/LivenessChecker';
import {LivenessOverlay} from '../components/LivenessOverlay';
import {detectSpoof} from '../ml/SpoofDetector';
import {detectBlur} from '../ml/BlurDetector';
import {embedFace} from '../ml/FaceEmbedder';
import {searchByCosine} from '../db/faceStore';
import {DEFAULT_TENANT} from '../constants';
import type {RGBFrame} from '../utils/imageUtils';
import type {RootStackParamList} from '../App';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Verify'>;
};

export function VerifyScreen({navigation}: Props) {
  const cameraRef = useRef<Camera>(null);
  const device = useCameraDevice('front');
  const checkerRef = useRef<LivenessChecker | null>(null);
  const [livenessState, setLivenessState] = useState<LivenessState>({
    challenge: 'IDLE',
    progress: 0,
    lastLandmark: null,
  });
  const [processing, setProcessing] = useState(false);
  const [hasCameraPermission, setHasCameraPermission] = useState(false);
  const capturedRef = useRef(false);

  useEffect(() => {
    Camera.requestCameraPermission().then(s =>
      setHasCameraPermission(s === 'granted'),
    );
  }, []);

  const handleStateChange = useCallback(
    async (state: LivenessState) => {
      setLivenessState(state);

      if (state.challenge === 'COMPLETE' && !capturedRef.current) {
        capturedRef.current = true;
        await runPassiveAndSearch();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    if (!hasCameraPermission) return;

    const checker = new LivenessChecker(handleStateChange);
    checkerRef.current = checker;

    let frameInterval: ReturnType<typeof setInterval> | null = null;

    const t = setTimeout(() => {
      checker.start();

      // Feed camera snapshots to MediaPipe every 500ms for face detection
      frameInterval = setInterval(async () => {
        if (!cameraRef.current || capturedRef.current) return;
        try {
          const photo = await cameraRef.current.takeSnapshot({quality: 50});
          await NativeModules.MediaPipeModule?.processFrame?.(photo.path);
        } catch {
          // ignore snapshot errors during liveness
        }
      }, 500);
    }, 800);

    return () => {
      clearTimeout(t);
      if (frameInterval) clearInterval(frameInterval);
      checker.stop();
    };
  }, [hasCameraPermission, handleStateChange]);

  async function runPassiveAndSearch() {
    if (!cameraRef.current) return;
    setProcessing(true);

    try {
      const photo = await cameraRef.current.takeSnapshot({quality: 90});
      const frameData: RGBFrame = await NativeModules.MediaPipeModule.decodeImageToRGB(
        photo.path,
      );

      // Blur check
      const blurResult = detectBlur(frameData);
      if (!blurResult.isSharp) {
        navigation.replace('Result', {
          matched: false,
          reason: 'blurry',
          faceId: null, personName: null,
          similarity: 0,
        });
        return;
      }

      // Spoof check
      const spoofResult = await detectSpoof(frameData);
      if (!spoofResult.isLive) {
        navigation.replace('Result', {
          matched: false,
          reason: 'spoof',
          faceId: null, personName: null,
          similarity: 0,
        });
        return;
      }

      // Get face bbox
      const landmarkResult = await NativeModules.MediaPipeModule.detectFace(
        photo.path,
      );
      if (!landmarkResult.faceDetected || !landmarkResult.bbox) {
        navigation.replace('Result', {
          matched: false,
          reason: 'no_face',
          faceId: null, personName: null,
          similarity: 0,
        });
        return;
      }

      const bboxPixels: [number, number, number, number] = [
        landmarkResult.bbox[0] * frameData.width,
        landmarkResult.bbox[1] * frameData.height,
        landmarkResult.bbox[2] * frameData.width,
        landmarkResult.bbox[3] * frameData.height,
      ];

      const embedResult = await embedFace(frameData, bboxPixels);
      if (!embedResult.faceDetected) {
        navigation.replace('Result', {
          matched: false,
          reason: 'no_face',
          faceId: null, personName: null,
          similarity: 0,
        });
        return;
      }

      // Cosine search
      const matches = searchByCosine(embedResult.embedding, DEFAULT_TENANT);
      if (matches.length > 0) {
        const top = matches[0];
        navigation.replace('Result', {
          matched: true,
          reason: 'ok',
          faceId: top.face_id,
          personName: top.object_key || null,
          similarity: top.similarity,
        });
      } else {
        navigation.replace('Result', {
          matched: false,
          reason: 'no_match',
          faceId: null, personName: null,
          similarity: 0,
        });
      }
    } catch (err: any) {
      const msg = err?.message ?? err?.toString() ?? 'Unknown error';
      navigation.replace('Result', {
        matched: false,
        reason: 'error',
        faceId: msg.substring(0, 100),  // show actual error as faceId field temporarily
        similarity: 0,
      });
    } finally {
      setProcessing(false);
    }
  }

  if (!hasCameraPermission || !device) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.text}>Camera permission required.</Text>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={!processing}
        photo
      />

      <LivenessOverlay
        challenge={livenessState.challenge}
        progress={livenessState.progress}
        faceDetected={livenessState.lastLandmark?.faceDetected ?? false}
      />

      {processing && (
        <View style={styles.processingOverlay}>
          <ActivityIndicator size="large" color="#FFF" />
          <Text style={styles.processingText}>Verifying...</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#000'},
  center: {flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0F172A'},
  text: {color: '#F9FAFB', fontSize: 16},
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  processingText: {color: '#F9FAFB', fontSize: 18, fontWeight: '600'},
});
