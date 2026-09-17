// lib/db.js — the design store's database: SQLite via node:sqlite (built into Node 22.13+,
// no dependency), one local file at db/design.sqlite (override with DESIGN_DB).
//
// Opened lazily on first use, never at import time, and migrations in db/migrations/*.sql
// are applied automatically on open (tracked in schema_migrations, and written to be
// idempotent besides) — so `npm run builder` just works with zero setup. WAL journaling
// keeps reads from blocking the single writer.
//
// Deployment note: this is a LOCAL file. On serverless hosts (Vercel) the filesystem is
// per-instance and wiped between deployments, so the design store effectively lives on the
// machine that runs the server. Swapping in a hosted database later means reimplementing
// lib/designStore.js's queries, not touching anything above it.
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS_DIR = join(ROOT, 'db', 'migrations');

let db = null;

export function hasDb() {
  try { getDb(); return true; } catch { return false; }
}

export function getDb() {
  if (db) return db;
  const path = process.env.DESIGN_DB || join(ROOT, 'db', 'design.sqlite');
  mkdirSync(dirname(path), { recursive: true });
  const d = new DatabaseSync(path);
  d.exec('PRAGMA journal_mode = WAL');
  d.exec('PRAGMA foreign_keys = ON');
  runMigrations(d);
  db = d;
  return db;
}

// Apply db/migrations/*.sql in filename order, once each. 001 creates the tracking table
// itself, so make sure it exists before querying it.
export function runMigrations(d) {
  d.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    filename TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))`);
  const done = new Set(d.prepare('SELECT filename FROM schema_migrations').all().map((r) => r.filename));
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  const applied = [];
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = readFileSync(join(MIGRATIONS_DIR, f), 'utf8');
    d.exec('BEGIN');
    try {
      d.exec(sql);
      d.prepare('INSERT OR IGNORE INTO schema_migrations (filename) VALUES (?)').run(f);
      d.exec('COMMIT');
      applied.push(f);
    } catch (e) {
      d.exec('ROLLBACK');
      throw new Error(`migration ${f} failed: ${e.message}`);
    }
  }
  return applied;
}
