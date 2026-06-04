import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet, SafeAreaView, StatusBar} from 'react-native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import type {RouteProp} from '@react-navigation/native';
import type {RootStackParamList} from '../App';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Result'>;
  route: RouteProp<RootStackParamList, 'Result'>;
};

const CONFIG: Record<string, {emoji: string; headline: string; sub: string; bg: string; accent: string}> = {
  ok:       {emoji: '✅', headline: 'Identity Verified', sub: '', bg: '#052E16', accent: '#10B981'},
  no_match: {emoji: '❌', headline: 'No Match Found', sub: 'Face not found in the database.', bg: '#1C1917', accent: '#F59E0B'},
  spoof:    {emoji: '🚫', headline: 'Spoof Detected', sub: 'Please use a real face in good lighting.', bg: '#1C0A00', accent: '#EF4444'},
  blurry:   {emoji: '🌫️', headline: 'Image Too Blurry', sub: 'Ensure good lighting and hold still.', bg: '#1C1917', accent: '#F59E0B'},
  no_face:  {emoji: '👁️', headline: 'No Face Detected', sub: 'Position your face in the oval and try again.', bg: '#1C1917', accent: '#F59E0B'},
  error:    {emoji: '⚠️', headline: 'Error', sub: '', bg: '#1C1917', accent: '#EF4444'},
};

export function ResultScreen({navigation, route}: Props) {
  const {matched, reason, faceId, personName, similarity} = route.params;
  const cfg = CONFIG[matched ? 'ok' : reason] ?? CONFIG.error;
  const confidencePct = Math.round(similarity * 100);

  return (
    <SafeAreaView style={[styles.container, {backgroundColor: cfg.bg}]}>
      <StatusBar barStyle="light-content" backgroundColor={cfg.bg} />

      {/* Main result card */}
      <View style={styles.card}>
        <Text style={styles.emoji}>{cfg.emoji}</Text>
        <Text style={[styles.headline, {color: cfg.accent}]}>{cfg.headline}</Text>

        {matched && faceId ? (
          <View style={styles.matchDetails}>
            {/* Person name */}
            {personName && (
              <Text style={styles.personName}>{personName}</Text>
            )}

            {/* Confidence bar */}
            <View style={styles.confRow}>
              <Text style={styles.confLabel}>Confidence</Text>
              <Text style={[styles.confValue, {color: cfg.accent}]}>{confidencePct}%</Text>
            </View>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, {width: `${confidencePct}%` as any, backgroundColor: cfg.accent}]} />
            </View>
          </View>
        ) : (
          <Text style={styles.subText}>
            {reason === 'error' && faceId ? faceId : (cfg.sub || 'Please try again.')}
          </Text>
        )}
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.btnPrimary, {borderColor: cfg.accent}]}
          onPress={() => navigation.navigate('Verify')}
          activeOpacity={0.85}>
          <Text style={[styles.btnPrimaryText, {color: cfg.accent}]}>Try Again</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.btnSecondary}
          onPress={() => navigation.navigate('Home')}
          activeOpacity={0.85}>
          <Text style={styles.btnSecondaryText}>← Home</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, justifyContent: 'center', padding: 24},
  card: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 28,
    padding: 32,
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 28,
  },
  emoji: {fontSize: 72, marginBottom: 4},
  headline: {fontSize: 26, fontWeight: '800', textAlign: 'center'},
  subText: {fontSize: 15, color: '#94A3B8', textAlign: 'center', marginTop: 4, lineHeight: 22},

  matchDetails: {width: '100%', gap: 12, marginTop: 8},
  personName: {fontSize: 28, fontWeight: '800', color: '#F1F5F9', textAlign: 'center', marginBottom: 4},
  confRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  confLabel: {color: '#94A3B8', fontSize: 13, fontWeight: '500'},
  confValue: {fontSize: 22, fontWeight: '800'},
  barTrack: {
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {height: 8, borderRadius: 4},
  idBox: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 10,
    padding: 12,
    gap: 4,
    marginTop: 4,
  },
  idLabel: {color: '#475569', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1},
  idValue: {color: '#CBD5E1', fontSize: 13, fontFamily: 'monospace'},

  actions: {gap: 12},
  btnPrimary: {
    borderWidth: 1.5,
    paddingVertical: 15,
    borderRadius: 16,
    alignItems: 'center',
  },
  btnPrimaryText: {fontSize: 17, fontWeight: '700'},
  btnSecondary: {paddingVertical: 14, alignItems: 'center'},
  btnSecondaryText: {color: '#475569', fontSize: 16, fontWeight: '500'},
});
