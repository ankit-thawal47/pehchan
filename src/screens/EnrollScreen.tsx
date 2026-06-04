import React, {useRef, useState, useEffect} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  TextInput,
  StatusBar,
} from 'react-native';
import {Camera, useCameraDevice} from 'react-native-vision-camera';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {generateUUID} from '../utils/mathUtils';
import {NativeModules} from 'react-native';

import {detectSpoof} from '../ml/SpoofDetector';
import {detectBlur} from '../ml/BlurDetector';
import {embedFace} from '../ml/FaceEmbedder';
import {insertFace} from '../db/faceStore';
import {enqueue} from '../db/syncQueue';
import {DEFAULT_TENANT} from '../constants';
import type {RGBFrame} from '../utils/imageUtils';
import type {RootStackParamList} from '../App';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Enroll'>;
};

type Step = 'IDLE' | 'PROCESSING' | 'SUCCESS' | 'FAILED';
interface Timings { spoofMs: number; embedMs: number; totalMs: number; }

const STEPS = ['Quality', 'Liveness', 'Embedding', 'Saving'];

export function EnrollScreen({navigation}: Props) {
  const cameraRef = useRef<Camera>(null);
  const device = useCameraDevice('front');
  const [step, setStep] = useState<Step>('IDLE');
  const [statusMsg, setStatusMsg] = useState('Centre your face in the oval');
  const [processingStep, setProcessingStep] = useState(-1);
  const [personName, setPersonName] = useState('');
  const [hasCameraPermission, setHasCameraPermission] = useState(false);
  const [timings, setTimings] = useState<Timings | null>(null);
  const t0Ref = useRef<number>(0);

  useEffect(() => {
    Camera.requestCameraPermission().then(s =>
      setHasCameraPermission(s === 'granted'),
    );
  }, []);

  async function handleCapture() {
    if (!cameraRef.current || step === 'PROCESSING') return;
    if (!personName.trim()) {
      Alert.alert('Name required', 'Enter a name before capturing.');
      return;
    }

    setStep('PROCESSING');
    setProcessingStep(0);
    t0Ref.current = Date.now();
    try {
      const photo = await cameraRef.current.takeSnapshot({quality: 90});
      const frameData: RGBFrame = await NativeModules.MediaPipeModule.decodeImageToRGB(photo.path);

      // Step 0 — Quality
      setProcessingStep(0);
      const blurResult = detectBlur(frameData);
      if (!blurResult.isSharp) {
        setStep('FAILED');
        setStatusMsg('Image too blurry. Move to better light and try again.');
        return;
      }

      // Step 1 — Liveness
      setProcessingStep(1);
      const spoofResult = await detectSpoof(frameData);
      if (!spoofResult.isLive) {
        setStep('FAILED');
        setStatusMsg('Spoof detected. Use a real face in good lighting.');
        return;
      }

      // Step 2 — Embedding
      setProcessingStep(2);
      const landmarkResult = await NativeModules.MediaPipeModule.detectFace(photo.path);
      if (!landmarkResult.faceDetected || !landmarkResult.bbox) {
        setStep('FAILED');
        setStatusMsg('No face detected. Ensure your face is clearly visible.');
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
        setStep('FAILED');
        setStatusMsg('Could not generate face embedding. Try again.');
        return;
      }

      // Step 3 — Save
      setProcessingStep(3);
      const faceId = generateUUID();
      insertFace(faceId, embedResult.embedding, DEFAULT_TENANT, personName.trim());
      enqueue(faceId, 'INSERT', {
        face_id: faceId,
        tenant: DEFAULT_TENANT,
        operation: 'INSERT',
        embedding: embedResult.embedding,
        name: personName.trim(),
        timestamp: Date.now(),
      });

      setTimings({
        spoofMs: spoofResult.inferenceMs,
        embedMs: embedResult.inferenceMs,
        totalMs: Date.now() - t0Ref.current,
      });
      setStep('SUCCESS');
      setStatusMsg(personName.trim());
    } catch (err: any) {
      setStep('FAILED');
      const msg = err?.message ?? err?.toString() ?? 'Unknown error';
      setStatusMsg(msg.length > 120 ? msg.substring(0, 120) + '…' : msg);
    }
  }

  function reset() {
    setStep('IDLE');
    setProcessingStep(-1);
    setStatusMsg('Centre your face in the oval');
    setPersonName('');
  }

  if (!hasCameraPermission || !device) {
    return (
      <View style={styles.center}>
        <Text style={styles.centerText}>📷</Text>
        <Text style={styles.centerMsg}>Camera permission required</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={step !== 'SUCCESS'}
        photo
      />

      {/* Dark gradient top bar */}
      <View style={styles.topBar}>
        <TextInput
          style={styles.nameInput}
          placeholder="Enter person's name"
          placeholderTextColor="rgba(255,255,255,0.4)"
          value={personName}
          onChangeText={setPersonName}
          editable={step === 'IDLE'}
        />
      </View>

      {/* Oval face guide with corner brackets */}
      <View style={styles.ovalWrapper} pointerEvents="none">
        <View style={[styles.oval, step === 'SUCCESS' && styles.ovalSuccess]} />
        {/* Corner brackets */}
        <View style={[styles.corner, styles.tl]} />
        <View style={[styles.corner, styles.tr]} />
        <View style={[styles.corner, styles.bl]} />
        <View style={[styles.corner, styles.br]} />
      </View>

      {/* Bottom panel */}
      <View style={styles.bottomPanel}>
        {/* Processing steps */}
        {step === 'PROCESSING' && (
          <View style={styles.stepsRow}>
            {STEPS.map((s, i) => (
              <View key={s} style={styles.stepItem}>
                <View style={[
                  styles.stepDot,
                  i < processingStep && styles.stepDone,
                  i === processingStep && styles.stepActive,
                ]}>
                  {i < processingStep
                    ? <Text style={styles.stepTick}>✓</Text>
                    : i === processingStep
                    ? <ActivityIndicator size="small" color="#FFF" />
                    : null}
                </View>
                <Text style={[styles.stepLabel, i === processingStep && styles.stepLabelActive]}>{s}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Status message */}
        {step !== 'IDLE' && (
          <View style={[
            styles.statusBadge,
            step === 'SUCCESS' && styles.statusSuccess,
            step === 'FAILED' && styles.statusFailed,
          ]}>
            {step === 'SUCCESS' && <Text style={styles.statusIcon}>✓</Text>}
            {step === 'FAILED' && <Text style={styles.statusIcon}>✗</Text>}
            <Text style={styles.statusText}>
              {step === 'SUCCESS' ? `${statusMsg} enrolled!` : statusMsg}
            </Text>
          </View>
        )}

        {step === 'IDLE' && (
          <Text style={styles.hint}>Centre your face · Hold steady · Good lighting</Text>
        )}

        {/* CTA button */}
        <View style={styles.ctaRow}>
          {step === 'IDLE' && (
            <TouchableOpacity style={styles.captureBtn} onPress={handleCapture} activeOpacity={0.85}>
              <View style={styles.captureBtnInner} />
            </TouchableOpacity>
          )}
          {step === 'SUCCESS' && (
            <>
              {timings && (
                <View style={styles.timingsRow}>
                  {[
                    {label: 'Anti-Spoof', val: timings.spoofMs},
                    {label: 'Embedding', val: timings.embedMs},
                    {label: 'Total', val: timings.totalMs},
                  ].map(t => (
                    <View key={t.label} style={styles.timingChip}>
                      <Text style={styles.timingLabel}>{t.label}</Text>
                      <Text style={[styles.timingVal, t.label === 'Total' && t.val < 1000 ? {color:'#10B981'} : {}]}>
                        {t.val}ms
                      </Text>
                    </View>
                  ))}
                </View>
              )}
              <TouchableOpacity style={styles.doneBtn} onPress={() => navigation.goBack()} activeOpacity={0.85}>
                <Text style={styles.doneBtnText}>Done  ✓</Text>
              </TouchableOpacity>
            </>
          )}
          {step === 'FAILED' && (
            <TouchableOpacity style={styles.retryBtn} onPress={reset} activeOpacity={0.85}>
              <Text style={styles.retryBtnText}>Try Again</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

const OVAL_W = 230;
const OVAL_H = 300;

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#000'},
  center: {flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0F172A', gap: 12},
  centerText: {fontSize: 48},
  centerMsg: {color: '#94A3B8', fontSize: 16},

  topBar: {
    position: 'absolute',
    top: 52,
    left: 20,
    right: 20,
    zIndex: 10,
  },
  nameInput: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    color: '#FFF',
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },

  ovalWrapper: {
    position: 'absolute',
    top: '18%',
    alignSelf: 'center',
    width: OVAL_W,
    height: OVAL_H,
  },
  oval: {
    width: OVAL_W,
    height: OVAL_H,
    borderRadius: OVAL_W / 2,
    borderWidth: 2,
    borderColor: 'rgba(59,130,246,0.6)',
    backgroundColor: 'transparent',
  },
  ovalSuccess: {borderColor: '#10B981'},

  // Corner bracket decorations
  corner: {position: 'absolute', width: 20, height: 20, borderColor: '#3B82F6', borderWidth: 3},
  tl: {top: -2, left: -2, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 6},
  tr: {top: -2, right: -2, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 6},
  bl: {bottom: -2, left: -2, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 6},
  br: {bottom: -2, right: -2, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 6},

  bottomPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 40,
    gap: 14,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },

  stepsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  stepItem: {alignItems: 'center', gap: 6},
  stepDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  stepDone: {backgroundColor: '#059669', borderColor: '#059669'},
  stepActive: {backgroundColor: '#2563EB', borderColor: '#3B82F6'},
  stepTick: {color: '#FFF', fontSize: 14, fontWeight: '700'},
  stepLabel: {color: '#64748B', fontSize: 10, fontWeight: '500'},
  stepLabelActive: {color: '#93C5FD'},

  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  statusSuccess: {backgroundColor: 'rgba(16,185,129,0.15)'},
  statusFailed: {backgroundColor: 'rgba(239,68,68,0.12)'},
  statusIcon: {fontSize: 16, fontWeight: '700', color: '#FFF'},
  statusText: {color: '#E2E8F0', fontSize: 14, textAlign: 'center', flex: 1},

  hint: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 12,
    textAlign: 'center',
    letterSpacing: 0.5,
  },

  ctaRow: {alignItems: 'center', paddingTop: 4},
  captureBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureBtnInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#FFF',
  },
  doneBtn: {
    backgroundColor: '#059669',
    paddingHorizontal: 52,
    paddingVertical: 16,
    borderRadius: 40,
  },
  doneBtnText: {color: '#FFF', fontSize: 17, fontWeight: '700'},
  retryBtn: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 52,
    paddingVertical: 16,
    borderRadius: 40,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  retryBtnText: {color: '#F1F5F9', fontSize: 17, fontWeight: '600'},
  timingsRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    paddingBottom: 4,
  },
  timingChip: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
    gap: 2,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  timingLabel: {color: '#64748B', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5},
  timingVal: {color: '#F1F5F9', fontSize: 14, fontWeight: '700'},
});
