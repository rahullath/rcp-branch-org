import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createSeedDb, type DevDb } from "./seed";

// Lives under `.next/cache` (not `.data` at the project root) because Next's
// own dev watcher — Turbopack or Webpack — never watches its own build/cache
// output. A watched file would trigger a Fast Refresh rebuild on every
// demo-mode write, which can stall an in-flight page load.
// On Vercel (the public demo) only /tmp is writable; it resets when the server does.
const DB_DIR = process.env.VERCEL ? join("/tmp", "branch-app-dev-store") : join(process.cwd(), ".next", "cache", "branch-app-dev-store");
const DB_FILE = join(DB_DIR, "db.json");

let seedKeys: (keyof DevDb)[] | undefined;

function load(): DevDb {
  if (!existsSync(DB_FILE)) {
    const db = createSeedDb();
    persist(db);
    return db;
  }
  try {
    const db = JSON.parse(readFileSync(DB_FILE, "utf-8")) as DevDb;
    // A store saved by an older build lacks newer tables — start those from
    // the seed instead of crashing on `undefined`.
    seedKeys ??= Object.keys(createSeedDb()) as (keyof DevDb)[];
    const missing = seedKeys.filter((key) => !Array.isArray(db[key]));
    if (missing.length > 0) {
      const seed = createSeedDb();
      for (const key of missing) (db as unknown as Record<string, unknown>)[key] = seed[key];
      persist(db);
    }
    return db;
  } catch {
    const db = createSeedDb();
    persist(db);
    return db;
  }
}

function persist(db: DevDb) {
  mkdirSync(DB_DIR, { recursive: true });
  writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf-8");
}

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function resetDevDb() {
  persist(createSeedDb());
}

export const devStore = {
  load,
  uid,
  get db() {
    return load();
  },
  save(db: DevDb) {
    persist(db);
  },
};

export type StoreTable = keyof DevDb;
export type Row = { id: string };

export function listRows<T extends Row>(table: StoreTable): T[] {
  return devStore.db[table] as unknown as T[];
}

export function findRow<T extends Row>(table: StoreTable, id: string): T | undefined {
  return (devStore.db[table] as unknown as T[]).find((r) => r.id === id);
}

export function insertRow<T extends Row>(table: StoreTable, data: Partial<T> & { id?: string }): T {
  const db = devStore.load();
  const rows = db[table] as unknown as Row[];
  const row = { ...data, id: data.id ?? uid(table) } as Row;
  rows.unshift(row as T);
  devStore.save(db);
  return row as T;
}

export function updateRow<T extends Row>(table: StoreTable, id: string, patch: Partial<T>): T | undefined {
  const db = devStore.load();
  const rows = db[table] as unknown as Row[];
  const idx = rows.findIndex((r) => r.id === id);
  if (idx === -1) return undefined;
  rows[idx] = { ...rows[idx], ...patch, id } as Row;
  devStore.save(db);
  return rows[idx] as T;
}

export function deleteRow(table: StoreTable, id: string): boolean {
  const db = devStore.load();
  const rows = db[table] as unknown as Row[];
  const idx = rows.findIndex((r) => r.id === id);
  if (idx === -1) return false;
  rows.splice(idx, 1);
  devStore.save(db);
  return true;
}
