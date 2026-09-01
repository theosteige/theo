CREATE TABLE card_memory (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  best INTEGER NOT NULL DEFAULT 0
);
INSERT INTO card_memory (id, best) VALUES (1, 0);
