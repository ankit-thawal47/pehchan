/**
 * Face record CRUD + cosine similarity search.
 *
 * Mirrors zepiris/services/milvus_store.py operations:
 *   insert, upsert, delete, get_by_id, exists, search
 *
 * Search threshold: similarity >= 0.5 = accept
 * (mirrors zepiris/config.py milvus_search_threshold = 0.5)
 *
 * Since embeddings are L2-normalized at insert time,
 * cosine similarity = dot product (both norms = 1).
 */

import {getDB} from './database';
import {DEFAULT_TENANT, COSINE_ACCEPT_THRESHOLD} from '../constants';
import {cosineSimilarity, toFloat32} from '../utils/mathUtils';
import type {FaceRow} from './schema';

export interface VectorMatch {
  face_id: string;
  tenant: string;
  object_key: string;
  similarity: number; // [0,1] where 1 = identical
}

export function insertFace(
  faceId: string,
  embedding: number[],
  tenant: string = DEFAULT_TENANT,
  objectKey: string = '',
): void {
  getDB().execute(
    `INSERT INTO faces (face_id, tenant, object_key, embedding, created_at, synced)
     VALUES (?, ?, ?, ?, ?, 0)`,
    [faceId, tenant, objectKey, JSON.stringify(embedding), Date.now()],
  );
}

export function upsertFace(
  faceId: string,
  embedding: number[],
  tenant: string = DEFAULT_TENANT,
  objectKey: string = '',
): void {
  // Atomic delete + insert, mirrors milvus_store.py upsert()
  getDB().execute('DELETE FROM faces WHERE face_id = ?', [faceId]);
  insertFace(faceId, embedding, tenant, objectKey);
}

export function deleteFace(faceId: string): void {
  getDB().execute('DELETE FROM faces WHERE face_id = ?', [faceId]);
}

export function getFace(faceId: string): FaceRow | null {
  const result = getDB().execute(
    'SELECT * FROM faces WHERE face_id = ?',
    [faceId],
  );
  return (result.rows?._array?.[0] as FaceRow) ?? null;
}

export function faceExists(faceId: string): boolean {
  const result = getDB().execute(
    'SELECT 1 FROM faces WHERE face_id = ?',
    [faceId],
  );
  return (result.rows?.length ?? 0) > 0;
}

export function markSynced(faceId: string): void {
  getDB().execute('UPDATE faces SET synced = 1 WHERE face_id = ?', [faceId]);
}

export function getUnsyncedCount(): number {
  const result = getDB().execute(
    'SELECT COUNT(*) as cnt FROM faces WHERE synced = 0',
  );
  return result.rows?._array?.[0]?.cnt ?? 0;
}

/**
 * 1-to-N cosine similarity search.
 *
 * Loads all embeddings for the tenant, computes cosine similarity
 * (= dot product since embeddings are L2-normalized), returns top-K
 * matches above the threshold.
 *
 * Mirrors milvus_store.py search() — accepts hits with similarity >= threshold.
 */
export function searchByCosine(
  queryEmbedding: number[],
  tenant: string = DEFAULT_TENANT,
  topK: number = 5,
  threshold: number = COSINE_ACCEPT_THRESHOLD,
): VectorMatch[] {
  const result = getDB().execute(
    'SELECT face_id, tenant, object_key, embedding FROM faces WHERE tenant = ?',
    [tenant],
  );

  const rows: FaceRow[] = result.rows?._array ?? [];
  const query = toFloat32(queryEmbedding);

  const scored: VectorMatch[] = rows
    .map(row => {
      const emb = toFloat32(JSON.parse(row.embedding) as number[]);
      const similarity = cosineSimilarity(query, emb);
      return {
        face_id: row.face_id,
        tenant: row.tenant,
        object_key: row.object_key,
        similarity,
      };
    })
    .filter(m => m.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);

  return scored;
}
