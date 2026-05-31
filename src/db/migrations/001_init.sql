CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  display_name TEXT,
  has_seen_profile_tips INTEGER DEFAULT 0
);
