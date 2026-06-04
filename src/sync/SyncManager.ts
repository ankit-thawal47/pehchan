/**
 * Sync & Purge Manager.
 *
 * Watches network connectivity via NetInfo. When internet is reachable,
 * drains the sync_queue: uploads each pending item to AWS, marks it done,
 * marks the face record as synced, then purges old completed items.
 */

import NetInfo from '@react-native-community/netinfo';
import * as syncQueue from '../db/syncQueue';
import * as faceStore from '../db/faceStore';
import {upload} from './awsUploader';
import {SYNC_MAX_RETRIES, SYNC_BATCH_SIZE} from '../constants';

type SyncStatusListener = (pendingCount: number) => void;

class SyncManagerClass {
  private unsubscribe: (() => void) | null = null;
  private isDraining = false;
  private listeners: SyncStatusListener[] = [];

  start(): void {
    this.unsubscribe = NetInfo.addEventListener(state => {
      if (state.isConnected && state.isInternetReachable) {
        this.drainQueue();
      }
    });
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  addListener(fn: SyncStatusListener): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter(l => l !== fn);
    };
  }

  private notifyListeners(): void {
    const count = syncQueue.getPendingCount();
    this.listeners.forEach(fn => fn(count));
  }

  async drainQueue(): Promise<void> {
    if (this.isDraining) return;
    this.isDraining = true;

    try {
      const items = syncQueue.getPending(SYNC_BATCH_SIZE);
      for (const item of items) {
        syncQueue.markSyncing(item.id);
        try {
          await upload(item);
          syncQueue.markDone(item.id);
          faceStore.markSynced(item.face_id);
        } catch {
          syncQueue.incrementRetry(item.id);
          if (item.retries + 1 >= SYNC_MAX_RETRIES) {
            syncQueue.markFailed(item.id);
          }
        }
      }
      syncQueue.purgeCompleted();
      this.notifyListeners();
    } finally {
      this.isDraining = false;
    }
  }

  /** Force a manual sync attempt. */
  triggerSync(): void {
    this.drainQueue();
  }

  getPendingCount(): number {
    return syncQueue.getPendingCount();
  }
}

export const SyncManager = new SyncManagerClass();
