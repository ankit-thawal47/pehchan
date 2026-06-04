import {SYNC_ENDPOINT} from '../constants';
import type {SyncQueueRow} from '../db/schema';

export interface UploadPayload {
  face_id: string;
  tenant: string;
  operation: string;
  embedding: number[];
  timestamp: number;
}

/**
 * Upload a sync queue item to AWS (or mock endpoint).
 * Throws on failure so SyncManager can handle retry logic.
 */
export async function upload(item: SyncQueueRow): Promise<void> {
  const payload: UploadPayload = JSON.parse(item.payload);

  const response = await fetch(SYNC_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Replace with real auth header for production:
      // 'x-api-key': process.env.AWS_API_KEY,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Upload failed: HTTP ${response.status}`);
  }
}
