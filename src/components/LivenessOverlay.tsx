import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import type {LivenessChallenge} from '../ml/LivenessChecker';

interface Props {
  challenge: LivenessChallenge;
  progress: number; // 0..3
  faceDetected: boolean;
}

const CHALLENGES: Record<LivenessChallenge, {emoji: string; label: string; color: string}> = {
  IDLE:      {emoji: '👤', label: 'Position your face', color: '#94A3B8'},
  BLINK:     {emoji: '😉', label: 'Blink your eyes',    color: '#60A5FA'},
  SMILE:     {emoji: '😊', label: 'Now smile',          color: '#34D399'},
  HEAD_TURN: {emoji: '↔️', label: 'Turn your head',     color: '#A78BFA'},
  COMPLETE:  {emoji: '✅', label: 'Liveness confirmed', color: '#10B981'},
  FAILED:    {emoji: '❌', label: 'Verification failed', color: '#EF4444'},
};

const STEPS: LivenessChallenge[] = ['BLINK', 'SMILE', 'HEAD_TURN'];

export function LivenessOverlay({challenge, progress, faceDetected}: Props) {
  const cfg = CHALLENGES[challenge];
  const isComplete = challenge === 'COMPLETE';
  const isActive = !isComplete && challenge !== 'IDLE' && challenge !== 'FAILED';

  const ovalColor = isComplete
    ? '#10B981'
    : !faceDetected && isActive
    ? '#F59E0B'
    : '#EF4444';

  return (
    <View style={styles.container} pointerEvents="none">

      {/* Oval + corner brackets — all in one relative container */}
      <View style={styles.ovalContainer}>
        <View style={[styles.oval, {borderColor: ovalColor}]} />
        <View style={[styles.corner, styles.tl, {borderColor: ovalColor}]} />
        <View style={[styles.corner, styles.tr, {borderColor: ovalColor}]} />
        <View style={[styles.corner, styles.bl, {borderColor: ovalColor}]} />
        <View style={[styles.corner, styles.br, {borderColor: ovalColor}]} />
      </View>

      {/* Step progress dots */}
      {isActive && (
        <View style={styles.dotsRow}>
          {STEPS.map((s, i) => (
            <View
              key={s}
              style={[
                styles.dot,
                i < progress && styles.dotDone,
                s === challenge && styles.dotActive,
              ]}
            />
          ))}
        </View>
      )}

      {/* Instruction card */}
      <View style={[styles.card, {borderColor: cfg.color + '55'}]}>
        <Text style={styles.cardEmoji}>{cfg.emoji}</Text>
        <Text style={[styles.cardLabel, {color: cfg.color}]}>{cfg.label}</Text>
        {!faceDetected && isActive && (
          <Text style={styles.noFaceText}>Move face into the oval</Text>
        )}
      </View>
    </View>
  );
}

const OVAL_W = 230;
const OVAL_H = 300;

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    paddingTop: '12%',
  },

  // Oval wrapper — corners are positioned relative to this
  ovalContainer: {
    width: OVAL_W,
    height: OVAL_H,
  },
  oval: {
    width: OVAL_W,
    height: OVAL_H,
    borderRadius: OVAL_W / 2,
    borderWidth: 2,
    backgroundColor: 'transparent',
  },

  // Corner brackets — positioned absolutely within ovalContainer
  corner: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderWidth: 3,
  },
  tl: {top: -2,  left: -2,  borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 6},
  tr: {top: -2,  right: -2, borderLeftWidth: 0,  borderBottomWidth: 0, borderTopRightRadius: 6},
  bl: {bottom: -2, left: -2,  borderRightWidth: 0, borderTopWidth: 0,    borderBottomLeftRadius: 6},
  br: {bottom: -2, right: -2, borderLeftWidth: 0,  borderTopWidth: 0,    borderBottomRightRadius: 6},

  // Progress dots
  dotsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
    marginBottom: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  dotDone: {backgroundColor: '#10B981'},
  dotActive: {backgroundColor: '#3B82F6', width: 20, borderRadius: 4},

  // Instruction card
  card: {
    backgroundColor: 'rgba(0,0,0,0.72)',
    borderRadius: 18,
    paddingHorizontal: 24,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    marginTop: 20,
  },
  cardEmoji: {fontSize: 28},
  cardLabel: {fontSize: 17, fontWeight: '700'},
  noFaceText: {color: '#F59E0B', fontSize: 12, marginTop: 2},
});
