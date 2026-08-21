CREATE TABLE scores(
  id INTEGER PRIMARY KEY,
  score INTEGER NOT NULL CHECK(score BETWEEN 0 AND 10000),
  played_at TEXT NOT NULL,
  duration INTEGER NOT NULL CHECK(duration IN(30,60,120,300,600)),
  settings TEXT NOT NULL
);
CREATE TABLE practice(
  id INTEGER PRIMARY KEY CHECK(id=1),
  total_seconds INTEGER NOT NULL CHECK(total_seconds>=0)
);
INSERT INTO practice VALUES(1,0);
