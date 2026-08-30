CREATE TABLE practice_sessions(
  id INTEGER PRIMARY KEY,
  played_at TEXT NOT NULL,
  seconds INTEGER NOT NULL CHECK(seconds BETWEEN 1 AND 604800)
);
