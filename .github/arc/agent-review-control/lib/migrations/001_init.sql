CREATE TABLE IF NOT EXISTS review_items (
  id TEXT PRIMARY KEY,
  raw_input TEXT NOT NULL,
  raw_json TEXT NOT NULL,
  raw_data_json TEXT NOT NULL,
  contract_json TEXT NOT NULL,
  validation_json TEXT NOT NULL,
  ingest_metadata_json TEXT NOT NULL DEFAULT '{}',
  approval_json TEXT NOT NULL DEFAULT '{}',
  completion_evidence_json TEXT NOT NULL DEFAULT '{}',
  reviewer_concerns_json TEXT NOT NULL DEFAULT '{}',
  review_status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_review_items_created_at ON review_items(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_review_items_review_status ON review_items(review_status);

CREATE TABLE IF NOT EXISTS arc_events (
  id TEXT PRIMARY KEY,
  review_item_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (review_item_id) REFERENCES review_items(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_arc_events_review_item_id ON arc_events(review_item_id);
CREATE INDEX IF NOT EXISTS idx_arc_events_created_at ON arc_events(created_at DESC);
