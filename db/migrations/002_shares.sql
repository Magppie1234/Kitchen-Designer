-- 002_shares.sql — client share links (Stage 9.4/9.6): a link is pinned to ONE revision,
-- carries an expiry, and records whether the estimate is included (a setting, 9.5).
CREATE TABLE IF NOT EXISTS shares (
  id               TEXT PRIMARY KEY,
  token            TEXT UNIQUE NOT NULL,
  room_id          TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  revision_id      TEXT NOT NULL REFERENCES revisions(id),
  include_estimate INTEGER NOT NULL DEFAULT 1,
  expires_at       TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS shares_room_idx ON shares (room_id);
