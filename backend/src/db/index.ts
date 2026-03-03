import { createClient, Client } from '@libsql/client';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

let _client: Client | null = null;

export function getDb(): Client {
  if (!_client) {
    const url = process.env.TURSO_DATABASE_URL?.trim();
    const authToken = process.env.TURSO_AUTH_TOKEN?.trim();

    if (!url) {
      throw new Error('TURSO_DATABASE_URL environment variable is required');
    }

    _client = createClient({ url, authToken });
  }
  return _client;
}

export default getDb;
