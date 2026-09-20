CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  metadata TEXT NOT NULL,
  image_key TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
  public_fields TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions(status);

CREATE TABLE IF NOT EXISTS audits (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('approve', 'reject')),
  reviewer TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audits_submission ON audits(submission_id);
CREATE INDEX IF NOT EXISTS idx_audits_created_at ON audits(created_at);

CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_key ON rate_limits(key, created_at);
