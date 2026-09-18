CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  metadata TEXT NOT NULL,
  image_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
  public_fields TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS moderation_audits (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES submissions(id),
  action TEXT NOT NULL,
  reviewer TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL
);
