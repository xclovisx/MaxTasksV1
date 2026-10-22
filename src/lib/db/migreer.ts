import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Db } from './client';

export async function migreer(sql: Db, map = path.join(process.cwd(), 'migrations')): Promise<string[]> {
  await sql`create table if not exists schema_migraties (naam text primary key, uitgevoerd_op timestamptz not null default now())`;
  const bestanden = (await readdir(map)).filter((f) => f.endsWith('.sql')).sort();
  const gedaan = new Set((await sql<{ naam: string }[]>`select naam from schema_migraties`).map((r) => r.naam));
  const nieuw: string[] = [];
  for (const bestand of bestanden) {
    if (gedaan.has(bestand)) continue;
    const inhoud = await readFile(path.join(map, bestand), 'utf8');
    await sql.begin(async (tx) => {
      await tx.unsafe(inhoud).simple();
      await tx`insert into schema_migraties (naam) values (${bestand})`;
    });
    nieuw.push(bestand);
  }
  return nieuw;
}
