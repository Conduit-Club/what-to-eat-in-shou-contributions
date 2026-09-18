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

CREATE TABLE IF NOT EXISTS publication_jobs (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES submissions(id),
  operation TEXT NOT NULL CHECK (operation IN ('publish', 'revert')),
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'pr_open', 'merged', 'failed', 'revert_conflict', 'cancelled')),
  pull_request_number INTEGER,
  pull_request_url TEXT,
  branch TEXT,
  commit_sha TEXT,
  merge_commit_sha TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (submission_id, operation)
);
