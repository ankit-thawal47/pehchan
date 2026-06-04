import {open, type QuickSQLiteConnection} from 'react-native-quick-sqlite';
import {FACES_DDL, SYNC_QUEUE_DDL} from './schema';

let _db: QuickSQLiteConnection | null = null;

export function getDB(): QuickSQLiteConnection {
  if (!_db) {
    throw new Error('Database not initialized. Call initDB() first.');
  }
  return _db;
}

export function initDB(): void {
  _db = open({name: 'zepiris.db', location: 'default'});
  _db.execute(FACES_DDL);
  _db.execute(SYNC_QUEUE_DDL);
}
