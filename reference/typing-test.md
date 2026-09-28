# Typing test

`/typing/` is linked from Side Quests. Descriptive copy is intentionally marked
with placeholders in `public/typing/index.html` and `public/side-quests/index.html`.
Control labels and instructions remain functional.

The timer starts on the first typed character. Tests run for 15, 30, 60, or 120
seconds, with optional punctuation and numbers. Leaving the input does not pause
the clock. Restart and Escape discard unfinished tests; Tab then Enter reaches
the restart control from the typing input.

WPM counts characters in correct completed words (including their spaces), plus
a correct final partial word, divided by five and by elapsed minutes. Raw WPM
counts inserted characters, including corrections. Accuracy includes mistakes
that were subsequently corrected. The server recomputes metrics from submitted
counts, rather than trusting submitted WPM values.

## Storage

The existing scores Worker exposes `GET /typing` for public history and
`POST /typing` for completed results. Writes use the existing `WRITE_KEY` secret
via a Bearer token, exactly like the other games. The journal key stays in the
input and is never written to local storage. Results live in the existing D1
database, in the additive `typing_results` table. Each test has a UUID so a retry
cannot create duplicate history entries. Best scores are calculated separately
for each duration/punctuation/numbers combination. The journal shows the most
recent 20 entries.

## Deploy order

Deploy the database and Worker before publishing the static site:

1. `wrangler d1 migrations apply mental-math --remote`
2. `wrangler deploy --config wrangler.jsonc`
3. Verify `https://api.theosteiger.com/typing` returns `{"results":[]}` (or saved results).
4. Push the static site changes to `main`.

The Pages workflow verifies the new endpoint and injects the same `SCORE_API_URL`
into the typing page that it uses for the existing games. Without this injected
URL, a static local preview is playable but explicitly reports the journal as
unavailable.

## Validation

`node --test tests/*.test.mjs` includes timer, scoring, correction, word-generation,
authentication, validation, idempotency, and real SQLite migration/storage tests.
The SQLite tests use Node's built-in `node:sqlite` module (Node 22.13+).
