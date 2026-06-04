import React, {useEffect, useState} from 'react';
import {View, Text, ActivityIndicator, StyleSheet} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';

import {initDB} from './db/database';
import {prepareOnnxModels} from './ml/OnnxSession';
import {SyncManager} from './sync/SyncManager';
import {HomeScreen} from './screens/HomeScreen';
import {EnrollScreen} from './screens/EnrollScreen';
import {VerifyScreen} from './screens/VerifyScreen';
import {ResultScreen} from './screens/ResultScreen';

export type RootStackParamList = {
  Home: undefined;
  Enroll: undefined;
  Verify: undefined;
  Result: {
    matched: boolean;
    reason: string;
    faceId: string | null;
    personName: string | null;
    similarity: number;
  };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function bootstrap() {
      try {
        initDB();
        await prepareOnnxModels();
        SyncManager.start();
        setReady(true);
      } catch (e: any) {
        setError(e?.message ?? 'Startup failed');
      }
    }
    bootstrap();
    return () => SyncManager.stop();
  }, []);

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Startup error:{'\n'}{error}</Text>
      </View>
    );
  }

  if (!ready) {
    return (
      <View style={styles.center}>
        <Text style={styles.splashTitle}>Pehchaan</Text>
        <Text style={styles.splashHindi}>पहचान</Text>
        <ActivityIndicator size="large" color="#3B82F6" style={{marginTop: 32}} />
        <Text style={styles.loadingText}>Loading models...</Text>
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerStyle: {backgroundColor: '#0F172A'},
          headerTintColor: '#F9FAFB',
          headerTitleStyle: {fontWeight: '700'},
          contentStyle: {backgroundColor: '#0F172A'},
        }}>
        <Stack.Screen name="Home" component={HomeScreen} options={{headerShown: false}} />
        <Stack.Screen name="Enroll" component={EnrollScreen} options={{title: 'Enroll Face'}} />
        <Stack.Screen name="Verify" component={VerifyScreen} options={{title: 'Verify Identity'}} />
        <Stack.Screen name="Result" component={ResultScreen} options={{title: 'Result', headerBackVisible: false}} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  center: {flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0F172A', gap: 8},
  splashTitle: {fontSize: 48, fontWeight: '800', color: '#F9FAFB', letterSpacing: -1},
  splashHindi: {fontSize: 20, color: '#64748B', letterSpacing: 3},
  loadingText: {color: '#94A3B8', fontSize: 14, marginTop: 8},
  errorText: {color: '#EF4444', fontSize: 14, textAlign: 'center', padding: 24},
});
