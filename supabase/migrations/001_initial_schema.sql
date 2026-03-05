-- ============================================================
-- RACE TIMER — Full Schema
-- Run this in your Supabase SQL editor (Dashboard → SQL Editor)
-- ============================================================

-- Teams table (pre-entered days before the race)
CREATE TABLE IF NOT EXISTS teams (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL UNIQUE,
  age_group    TEXT NOT NULL CHECK (age_group IN ('under_12', '12_to_14', 'over_14')),
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- Runs table (one row per team per run — max 2 runs per team)
CREATE TABLE IF NOT EXISTS runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id         UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  run_number      INT NOT NULL CHECK (run_number IN (1, 2)),  -- 1 = morning, 2 = afternoon
  member_count    INT NOT NULL CHECK (member_count BETWEEN 3 AND 10),
  colour          TEXT NOT NULL,
  started_at      TIMESTAMPTZ,
  finished_at     TIMESTAMPTZ,
  elapsed_ms      BIGINT,   -- milliseconds, set when run completes
  status          TEXT NOT NULL DEFAULT 'queued'
                  CHECK (status IN ('queued','running','finishing','done')),
  finishers       INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE (team_id, run_number)
);

-- Colour state table (10 rows, one per colour — seeded below)
CREATE TABLE IF NOT EXISTS colour_slots (
  colour       TEXT PRIMARY KEY,
  status       TEXT NOT NULL DEFAULT 'free'
               CHECK (status IN ('free','warning','running')),
  run_id       UUID REFERENCES runs(id) ON DELETE SET NULL,
  updated_at   TIMESTAMPTZ DEFAULT now()
);

-- Seed the 10 colours
INSERT INTO colour_slots (colour) VALUES
  ('Red'),('Blue'),('Green'),('Yellow'),('Orange'),
  ('Purple'),('Pink'),('White'),('Black'),('Teal')
ON CONFLICT DO NOTHING;

-- ============================================================
-- Enable Row Level Security (open policies for this app)
-- ============================================================
ALTER TABLE teams         ENABLE ROW LEVEL SECURITY;
ALTER TABLE runs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE colour_slots  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_teams"        ON teams        FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_runs"         ON runs         FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_colour_slots" ON colour_slots FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- Enable Realtime on all tables
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE teams;
ALTER PUBLICATION supabase_realtime ADD TABLE runs;
ALTER PUBLICATION supabase_realtime ADD TABLE colour_slots;
