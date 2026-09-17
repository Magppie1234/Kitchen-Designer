-- 001_init.sql — Kitchen Design App data model: users / projects / rooms / revisions / audit.
--
-- SQLite (node:sqlite, built into Node — no dependency). The whole store is one local file,
-- db/design.sqlite, created on first use; permission checks are the app server's job.
-- Every statement is idempotent (IF NOT EXISTS / OR IGNORE) so re-applying is harmless.
--
-- Conventions: ids are UUID strings minted in JS (crypto.randomUUID); timestamps are ISO-8601
-- UTC strings (what the UI feeds new Date()); JSON columns are TEXT, stringified in lib/designStore.js.

CREATE TABLE IF NOT EXISTS schema_migrations (
  filename   TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS users (
  id         TEXT PRIMARY KEY,
  email      TEXT UNIQUE NOT NULL,
  name       TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'designer',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS projects (
  id         TEXT PRIMARY KEY,
  owner_id   TEXT NOT NULL REFERENCES users(id),
  name       TEXT NOT NULL,
  -- client, architect, budget, city, timeline, type — mirrors the app's S.project shape
  details    TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS rooms (
  id         TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  -- room category id, matches the app's ROOM_TYPES ids (rk-show, rk-utility, ...)
  category   TEXT NOT NULL DEFAULT 'rk-show',
  -- series id from data/series.json (gold | signature | elite); NULL until Stage 2 is done
  series_id  TEXT,
  -- the live per-room design state (the app's ROOM_STATE_KEYS snapshot); autosave target,
  -- overwritten in place — recovery only, never a revision
  state      TEXT NOT NULL DEFAULT '{}',
  sort       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS revisions (
  id         TEXT PRIMARY KEY,
  room_id    TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  number     INTEGER NOT NULL,
  -- save | generate | redesign | quote | share | closure | restore | room-delete
  reason     TEXT NOT NULL,
  -- immutable full room-state snapshot; never updated after insert
  state      TEXT NOT NULL,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (room_id, number)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT,
  room_id    TEXT,
  actor      TEXT,
  action     TEXT NOT NULL,
  detail     TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS rooms_project_idx   ON rooms (project_id);
CREATE INDEX IF NOT EXISTS revisions_room_idx  ON revisions (room_id);
CREATE INDEX IF NOT EXISTS audit_project_idx   ON audit_log (project_id);
CREATE INDEX IF NOT EXISTS audit_room_idx      ON audit_log (room_id);

-- Seed the single known user (fixed uuid so the seed is deterministic and idempotent);
-- real auth is a flagged, still-open decision.
INSERT OR IGNORE INTO users (id, email, name, role)
VALUES ('00000000-0000-4000-8000-000000000001', 'info@mymagppie.com', 'Magppie Designer', 'designer');
