import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Linking,
  StatusBar,
} from 'react-native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {SyncBadge} from '../components/SyncBadge';
import {SyncManager} from '../sync/SyncManager';
import type {RootStackParamList} from '../App';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Home'>;
};

export function HomeScreen({navigation}: Props) {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />

      {/* Sync badge top right */}
      <View style={styles.topBar}>
        <SyncBadge onPress={() => SyncManager.triggerSync()} />
      </View>

      {/* Hero section */}
      <View style={styles.hero}>
        <View style={styles.iconRing}>
          <View style={styles.iconRingInner}>
            <Text style={styles.heroEmoji}>👤</Text>
          </View>
        </View>
        <Text style={styles.title}>Pehchaan</Text>
        <Text style={styles.titleHindi}>पहचान</Text>
        <Text style={styles.subtitle}>Secure · Offline · Instant</Text>

        {/* Feature pills */}
        <View style={styles.pills}>
          {['No Internet', 'Anti-Spoof', 'Liveness Check'].map(tag => (
            <View key={tag} style={styles.pill}>
              <Text style={styles.pillText}>{tag}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Action buttons */}
      <View style={styles.buttonGroup}>
        <TouchableOpacity
          style={styles.enrollButton}
          activeOpacity={0.85}
          onPress={() => navigation.navigate('Enroll')}>
          <View style={styles.btnLeft}>
            <Text style={styles.btnEmoji}>👤</Text>
            <View>
              <Text style={styles.btnTitle}>Enroll Face</Text>
              <Text style={styles.btnDesc}>Register a new person</Text>
            </View>
          </View>
          <Text style={styles.btnArrow}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.verifyButton}
          activeOpacity={0.85}
          onPress={() => navigation.navigate('Verify')}>
          <View style={styles.btnLeft}>
            <Text style={styles.btnEmoji}>🔍</Text>
            <View>
              <Text style={styles.btnTitle}>Verify Identity</Text>
              <Text style={styles.btnDesc}>Authenticate with liveness check</Text>
            </View>
          </View>
          <Text style={styles.btnArrow}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Developer card */}
      <TouchableOpacity
        style={styles.devCard}
        activeOpacity={0.7}
        onPress={() => Linking.openURL('https://www.linkedin.com/in/ankit-thawal')}>
        <Text style={styles.devBy}>Developed by</Text>
        <Text style={styles.devName}>Ankit Thawal</Text>
        <Text style={styles.devLink}>🔗 linkedin.com/in/ankit-thawal</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#0F172A'},
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    paddingTop: 12,
    minHeight: 36,
  },

  // Hero
  hero: {alignItems: 'center', paddingTop: 24, paddingBottom: 32},
  iconRing: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    borderColor: '#1D4ED8',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    backgroundColor: 'rgba(29,78,216,0.1)',
  },
  iconRingInner: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: 'rgba(59,130,246,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroEmoji: {fontSize: 36},
  title: {
    fontSize: 38,
    fontWeight: '800',
    color: '#F1F5F9',
    letterSpacing: -0.5,
  },
  titleHindi: {
    fontSize: 16,
    color: '#475569',
    letterSpacing: 3,
    marginTop: 2,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    color: '#64748B',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 16,
  },
  pills: {flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center'},
  pill: {
    backgroundColor: 'rgba(59,130,246,0.12)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.25)',
  },
  pillText: {color: '#60A5FA', fontSize: 12, fontWeight: '500'},

  // Buttons
  buttonGroup: {paddingHorizontal: 20, gap: 14, flex: 1, justifyContent: 'center'},
  enrollButton: {
    backgroundColor: '#1E3A5F',
    borderRadius: 18,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#2563EB',
  },
  verifyButton: {
    backgroundColor: '#14302A',
    borderRadius: 18,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#059669',
  },
  btnLeft: {flexDirection: 'row', alignItems: 'center', gap: 16},
  btnEmoji: {fontSize: 32},
  btnTitle: {fontSize: 18, fontWeight: '700', color: '#F1F5F9', marginBottom: 2},
  btnDesc: {fontSize: 13, color: '#94A3B8'},
  btnArrow: {fontSize: 28, color: '#475569', fontWeight: '300'},

  // Dev card
  devCard: {
    alignItems: 'center',
    paddingVertical: 16,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    gap: 3,
    marginHorizontal: 20,
  },
  devBy: {fontSize: 11, color: '#374151', textTransform: 'uppercase', letterSpacing: 1.5},
  devName: {fontSize: 14, color: '#94A3B8', fontWeight: '700'},
  devLink: {fontSize: 12, color: '#3B82F6'},
});
