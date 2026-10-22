import postgres from 'postgres';

export type Db = postgres.Sql;
export type Tx = postgres.TransactionSql;

let gedeeld: Db | undefined;

export function maakSql(url: string, opties: { max?: number } = {}): Db {
  return postgres(url, {
    max: opties.max ?? 10,
    transform: postgres.camel,
    onnotice: () => {},
    // `date`-kolommen als 'YYYY-MM-DD'-string teruggeven in plaats van een JS Date.
    types: {
      datum: { to: 1082, from: [1082], serialize: (x: string) => x, parse: (x: string) => x },
    },
  }) as unknown as Db;
}

export function db(): Db {
  if (!gedeeld) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL ontbreekt');
    gedeeld = maakSql(url);
  }
  return gedeeld;
}

export async function sluitDb(): Promise<void> {
  if (gedeeld) {
    await gedeeld.end({ timeout: 5 });
    gedeeld = undefined;
  }
}

/** Voert fn uit in één databasetransactie. */
export async function transactie<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return (await db().begin((tx) => fn(tx))) as T;
}

/** Postgres-arrayliteral voor int[]-parameters, bijv. `${pgIntArray([1,2])}::int[]`. */
export function pgIntArray(getallen: number[]): string {
  return `{${getallen.map((g) => Math.trunc(g)).join(',')}}`;
}
