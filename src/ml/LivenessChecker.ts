/**
 * Active liveness checker.
 *
 * Subscribes to face landmark events emitted by the native MediaPipeModule
 * and drives a challenge state machine: Blink → Smile → Head Turn.
 *
 * Liveness is confirmed only when all three challenges pass in sequence,
 * preventing spoofing via printed photos or screen replay.
 */

import {NativeEventEmitter, NativeModules} from 'react-native';
import {
  BLINK_CLOSED_THRESHOLD,
  BLINK_OPEN_THRESHOLD,
  SMILE_THRESHOLD,
  HEAD_TURN_YAW_DEG,
} from '../constants';

export type LivenessChallenge =
  | 'IDLE'
  | 'BLINK'
  | 'SMILE'
  | 'HEAD_TURN'
  | 'COMPLETE'
  | 'FAILED';

export interface FaceLandmarkResult {
  faceDetected: boolean;
  blendShapes: Record<string, number>; // e.g. eyeBlinkLeft, mouthSmileLeft
  eulerAngles: {yaw: number; pitch: number; roll: number};
  bbox: [number, number, number, number] | null; // [x1,y1,x2,y2] normalized [0,1]
  frameWidth: number;
  frameHeight: number;
}

export interface LivenessState {
  challenge: LivenessChallenge;
  progress: number; // 0..3 challenges completed
  lastLandmark: FaceLandmarkResult | null;
}

type StateChangeCallback = (state: LivenessState) => void;

// Blink detection requires: eyes open -> closed -> open (one full blink)
type BlinkPhase = 'WAITING_CLOSE' | 'CLOSED' | 'DONE';

export class LivenessChecker {
  private emitter: NativeEventEmitter;
  private subscription: ReturnType<NativeEventEmitter['addListener']> | null = null;
  private challenge: LivenessChallenge = 'IDLE';
  private progress = 0;
  private blinkPhase: BlinkPhase = 'WAITING_CLOSE';
  private lastLandmark: FaceLandmarkResult | null = null;
  private onStateChange: StateChangeCallback;

  constructor(onStateChange: StateChangeCallback) {
    this.onStateChange = onStateChange;
    this.emitter = new NativeEventEmitter(NativeModules.MediaPipeModule);
  }

  start(): void {
    this.challenge = 'BLINK';
    this.progress = 0;
    this.blinkPhase = 'WAITING_CLOSE';
    this.lastLandmark = null;

    NativeModules.MediaPipeModule?.startLandmarking?.();

    this.subscription = this.emitter.addListener(
      'onFaceLandmark',
      this.handleLandmark.bind(this),
    );

    this.emit();
  }

  stop(): void {
    this.subscription?.remove();
    NativeModules.MediaPipeModule?.stopLandmarking?.();
    this.challenge = 'IDLE';
  }

  private handleLandmark(result: FaceLandmarkResult): void {
    this.lastLandmark = result;

    if (!result.faceDetected) {
      return;
    }

    switch (this.challenge) {
      case 'BLINK':
        this.checkBlink(result);
        break;
      case 'SMILE':
        this.checkSmile(result);
        break;
      case 'HEAD_TURN':
        this.checkHeadTurn(result);
        break;
    }
  }

  private checkBlink(result: FaceLandmarkResult): void {
    const leftBlink = result.blendShapes['eyeBlinkLeft'] ?? 0;
    const rightBlink = result.blendShapes['eyeBlinkRight'] ?? 0;
    const avgBlink = (leftBlink + rightBlink) / 2;

    // avgBlink value: 0 = fully open, 1 = fully closed
    // We use inverse: high value = closed
    switch (this.blinkPhase) {
      case 'WAITING_CLOSE':
        if (avgBlink > BLINK_CLOSED_THRESHOLD) {
          this.blinkPhase = 'CLOSED';
        }
        break;
      case 'CLOSED':
        if (avgBlink < BLINK_OPEN_THRESHOLD) {
          // Re-opened after closing = blink complete
          this.blinkPhase = 'DONE';
          this.advanceTo('SMILE');
        }
        break;
    }
  }

  private checkSmile(result: FaceLandmarkResult): void {
    const smileL = result.blendShapes['mouthSmileLeft'] ?? 0;
    const smileR = result.blendShapes['mouthSmileRight'] ?? 0;
    if (smileL + smileR >= SMILE_THRESHOLD) {
      this.advanceTo('HEAD_TURN');
    }
  }

  private checkHeadTurn(result: FaceLandmarkResult): void {
    const yaw = Math.abs(result.eulerAngles.yaw);
    if (yaw >= HEAD_TURN_YAW_DEG) {
      this.advanceTo('COMPLETE');
    }
  }

  private advanceTo(next: LivenessChallenge): void {
    this.challenge = next;
    this.progress += 1;
    this.emit();

    if (next === 'COMPLETE') {
      NativeModules.MediaPipeModule?.stopLandmarking?.();
    }
  }

  private emit(): void {
    this.onStateChange({
      challenge: this.challenge,
      progress: this.progress,
      lastLandmark: this.lastLandmark,
    });
  }

  /** Get the pixel-coordinate bbox from the last landmark result. */
  getBbox(): [number, number, number, number] | null {
    const lm = this.lastLandmark;
    if (!lm?.bbox || !lm.faceDetected) return null;
    const [nx1, ny1, nx2, ny2] = lm.bbox;
    return [
      nx1 * lm.frameWidth,
      ny1 * lm.frameHeight,
      nx2 * lm.frameWidth,
      ny2 * lm.frameHeight,
    ];
  }

  isComplete(): boolean {
    return this.challenge === 'COMPLETE';
  }
}
