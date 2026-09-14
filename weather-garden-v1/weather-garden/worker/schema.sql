CREATE TABLE IF NOT EXISTS scans (
  id TEXT PRIMARY KEY,
  installation TEXT NOT NULL,
  tag TEXT NOT NULL,
  note INTEGER,
  velocity INTEGER NOT NULL,
  duration REAL NOT NULL,
  client_id TEXT NOT NULL,
  scale TEXT NOT NULL,
  temperature_c REAL,
  cloud_cover REAL,
  wind_kph REAL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_scans_installation_created
ON scans (installation, created_at DESC);

