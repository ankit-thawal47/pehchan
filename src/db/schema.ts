/**
 * SQLite schema — mirrors Zepiris Milvus schema exactly.
 *
 * Zepiris milvus_store.py fields: face_id, tenant, object_key, embedding[512]
 * Distance metric: COSINE (similarity >= 0.5 = accept)
 */

export const FACES_DDL = `
  CREATE TABLE IF NOT EXISTS faces (
    face_id    TEXT PRIMARY KEY,
    tenant     TEXT NOT NULL DEFAULT 'default',
    object_key TEXT NOT NULL DEFAULT '',
    embedding  TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    synced     INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_faces_tenant ON faces(tenant);
`;

export const SYNC_QUEUE_DDL = `
  CREATE TABLE IF NOT EXISTS sync_queue (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    face_id    TEXT NOT NULL,
    operation  TEXT NOT NULL,
    payload    TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    retries    INTEGER NOT NULL DEFAULT 0,
    status     TEXT NOT NULL DEFAULT 'pending'
  );
  CREATE INDEX IF NOT EXISTS idx_sync_status ON sync_queue(status);
`;

export type SyncOperation = 'INSERT' | 'UPSERT' | 'DELETE';
export type SyncStatus = 'pending' | 'syncing' | 'done' | 'failed';

export interface FaceRow {
  face_id: string;
  tenant: string;
  object_key: string;
  embedding: string; // JSON stringified number[]
  created_at: number;
  synced: number;
}

export interface SyncQueueRow {
  id: number;
  face_id: string;
  operation: SyncOperation;
  payload: string; // JSON stringified upload body
  created_at: number;
  retries: number;
  status: SyncStatus;
}
