CREATE TABLE typing_results (
  id TEXT PRIMARY KEY,
  played_at TEXT NOT NULL,
  duration INTEGER NOT NULL CHECK(duration IN (15,30,60,120)),
  punctuation INTEGER NOT NULL CHECK(punctuation IN (0,1)),
  numbers INTEGER NOT NULL CHECK(numbers IN (0,1)),
  correct_characters INTEGER NOT NULL CHECK(correct_characters >= 0),
  total_keystrokes INTEGER NOT NULL CHECK(total_keystrokes BETWEEN 1 AND 100000),
  correct_keystrokes INTEGER NOT NULL CHECK(correct_keystrokes BETWEEN correct_characters AND total_keystrokes)
);
CREATE INDEX typing_results_played_at ON typing_results(played_at DESC);
