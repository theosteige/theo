CREATE TABLE attempts(
  game_at TEXT NOT NULL,
  operation TEXT NOT NULL CHECK(operation IN('+','−','×','÷')),
  left_operand INTEGER NOT NULL CHECK(left_operand BETWEEN 0 AND 100000000),
  right_operand INTEGER NOT NULL CHECK(right_operand BETWEEN 0 AND 100000000),
  response_ms INTEGER NOT NULL CHECK(response_ms BETWEEN 1 AND 600000)
);
