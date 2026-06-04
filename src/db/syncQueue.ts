import {getDB} from './database';
import type {SyncQueueRow, SyncOperation} from './schema';
import {SYNC_PURGE_AGE_MS} from '../constants';

export function enqueue(faceId: string, operation: SyncOperation, payload: object): void {
  getDB().execute(
    `INSERT INTO sync_queue (face_id, operation, payload, created_at, retries, status)
     VALUES (?, ?, ?, ?, 0, 'pending')`,
    [faceId, operation, JSON.stringify(payload), Date.now()],
  );
}

export function getPending(limit: number = 20): SyncQueueRow[] {
  const result = getDB().execute(
    `SELECT * FROM sync_queue WHERE status = 'pending' ORDER BY created_at ASC LIMIT ?`,
    [limit],
  );
  return (result.rows?._array ?? []) as SyncQueueRow[];
}

export function markSyncing(id: number): void {
  getDB().execute(`UPDATE sync_queue SET status = 'syncing' WHERE id = ?`, [id]);
}

export function markDone(id: number): void {
  getDB().execute(`UPDATE sync_queue SET status = 'done' WHERE id = ?`, [id]);
}

export function incrementRetry(id: number): void {
  getDB().execute(
    `UPDATE sync_queue SET retries = retries + 1, status = 'pending' WHERE id = ?`,
    [id],
  );
}

export function markFailed(id: number): void {
  getDB().execute(`UPDATE sync_queue SET status = 'failed' WHERE id = ?`, [id]);
}

export function getPendingCount(): number {
  const result = getDB().execute(
    `SELECT COUNT(*) as cnt FROM sync_queue WHERE status IN ('pending', 'syncing')`,
  );
  return result.rows?._array?.[0]?.cnt ?? 0;
}

export function purgeCompleted(): void {
  const cutoff = Date.now() - SYNC_PURGE_AGE_MS;
  getDB().execute(
    `DELETE FROM sync_queue WHERE status = 'done' AND created_at < ?`,
    [cutoff],
  );
}
