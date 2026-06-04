import React, {useEffect, useState} from 'react';
import {View, Text, StyleSheet, TouchableOpacity} from 'react-native';
import {SyncManager} from '../sync/SyncManager';

interface Props {
  onPress?: () => void;
}

export function SyncBadge({onPress}: Props) {
  const [count, setCount] = useState(SyncManager.getPendingCount());

  useEffect(() => {
    const unsub = SyncManager.addListener(setCount);
    return unsub;
  }, []);

  if (count === 0) return null;

  return (
    <TouchableOpacity style={styles.badge} onPress={onPress}>
      <Text style={styles.text}>{count} pending sync</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  badge: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  text: {
    color: '#1F2937',
    fontSize: 12,
    fontWeight: '600',
  },
});
