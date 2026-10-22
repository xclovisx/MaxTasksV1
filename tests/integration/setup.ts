import { afterAll, inject } from 'vitest';
import { sluitDb } from '../../src/lib/db/client';

process.env.DATABASE_URL = inject('databaseUrl');
process.env.APP_URL = 'http://test.local';

afterAll(async () => {
  await sluitDb();
});
