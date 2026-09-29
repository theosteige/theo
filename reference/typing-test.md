# Typing test

`/typing/` is linked from Side Quests. Descriptive copy remains as placeholders.
Controls use the existing site's fonts, spacing, white background, and blue links.

## Behavior comparison

Reviewed Monkeytype's live v26.32.0 UI and public source on September 28, 2026.
The comparison covers the timed, word-count, and custom-text typing flows. The
implementation is independent; it retains this site's journal rather than
Monkeytype's accounts, rankings, themes, or social features.

| Area | Previous behavior | Updated behavior |
| --- | --- | --- |
| Text rendering | Replaced active word/letter nodes on every key; fractional line positions | Persistent letter nodes, whole-pixel rows sized to the font; ordinary typing changes only letter state |
| Extra letters at line edge | Active word could jump down a full line | Reject extra letters that would wrap the active word, matching Monkeytype's boundary guard |
| Scrolling | Recomputed animated transform each key | Scroll only when the active row changes; optional 125ms line scroll |
| Cursor | Transform-based motion coupled to the text track | Independent persistent cursor with optional 85ms position transitions; reduced motion respected |
| Backspace | Could reopen any previous word | Correct submitted words lock by default; incorrect visible words remain editable; optional backtracking |
| Word deletion | Browser-dependent | Ctrl/Option/Command + Backspace deletes the current word |
| Restart and focus | Escape discarded the test | Tab then Enter restarts; Escape opens settings; body typing focuses the test; repeat preserves the word sequence |
| Modes | Time only | 15/30/60/120 seconds, 10/25/50/100 words, or the length of custom text (up to 500 words) |
| Custom vocabulary | None | Paste a word pool or text; random, shuffled, or as-written order; whole-text test |
| Random words | Immediate repeats possible | English generation avoids the previous two words; punctuation and numbers are randomized |
| Stop on error | None | Off, word, and letter settings |
| Raw WPM | Counted deleted characters | Counts retained typed characters, including incorrect/extra characters; corrections still affect accuracy |
| Results | WPM, raw WPM, accuracy | Also shows correct/incorrect/extra/missed counts, elapsed time, speed trace, word review, and missed-word practice |
| Preferences | Reset each visit | Browser-local settings and custom text; journal key is never stored |
| Personal best | Duration and punctuation/numbers only | Also separates mode/count, vocabulary fingerprint, custom ordering, correction rules, and scoring version |

Reference evidence:

- [Monkeytype live UI](https://monkeytype.com/): modes, presets, focus/restart cues, custom words.
- [Input boundary guard](https://github.com/monkeytypegame/monkeytype/blob/master/frontend/src/ts/input/handlers/before-insert-text.ts): rejects overtyping that moves or wraps the active word.
- [Deletion rules](https://github.com/monkeytypegame/monkeytype/blob/master/frontend/src/ts/input/handlers/before-delete.ts): correct-word locking and freedom mode.
- [Cursor](https://github.com/monkeytypegame/monkeytype/blob/master/frontend/src/ts/elements/caret.ts) and [line scrolling](https://github.com/monkeytypegame/monkeytype/blob/master/frontend/src/ts/test/test-ui.ts): cursor speed and 125ms line movement.
- [Results](https://github.com/monkeytypegame/monkeytype/blob/master/frontend/src/ts/test/test-logic.ts): WPM from correct words, Raw WPM from retained characters, accuracy and result breakdown.
- [Word generator](https://github.com/monkeytypegame/monkeytype/blob/master/frontend/src/ts/test/words-generator.ts): repeat avoidance and custom order modes.

## Reproduced defect

With seeded words at an 850px viewport, overtyping the last word on a line moved
it down 43.1875px. The new browser regression types excess characters at a line
edge and asserts the active word stays on the same row. It also asserts that
ordinary keystrokes never move the text and that letter nodes remain connected.
The fixed version measures zero movement in that reproduction.

## Scoring and words

The timer starts on the first typed character and continues when focus is lost.
Only completed tests are saved. Word tests finish on the last correct character;
a final incorrect word can be submitted with Space when stop-on-error is off.

WPM counts characters in correct submitted words, including their spaces, plus
a correct final partial word. Raw WPM counts retained characters, not deleted
attempts. Both divide character counts by five and elapsed minutes. Accuracy
counts correct insertions against all attempted insertions, including errors
that were later corrected. The server recalculates all three metrics.

The bundled English list contains roughly 350 common words. Custom text preserves
case and punctuation, normalizes whitespace and Unicode, and accepts words up to
40 characters long. As-written text cycles in timed tests; the whole-text button
runs it exactly once. Custom punctuation/numbers are used as entered.

## Storage and compatibility

`GET /typing` returns public journal history. `POST /typing` uses the existing
`WRITE_KEY` secret as a Bearer token, the same as the other games. Data lives in
the existing D1 database's `typing_results` table. UUIDs make retries idempotent.

Migration 0006 adds elapsed time, retained-character counts, and validated settings
metadata. Existing rows and requests from already-open older pages remain valid.
Older scoring is labeled in history and excluded from the new personal-best
comparison. Custom text stays in browser-local preferences; only its SHA-256
fingerprint and settings are sent with the result. Journal keys are never persisted.

## Deployment

Apply database migrations, deploy the scores Worker, then push the static site:

1. `wrangler d1 migrations apply mental-math --remote`
2. `wrangler deploy --config wrangler.jsonc`
3. Verify all four game endpoints, including `/typing`.
4. Push to `main`; the Pages workflow verifies endpoints and injects `SCORE_API_URL`.

Use an HTTP preview server for local review, such as
`python3 -m http.server 4321 --directory public`. Opening HTML directly with
`file://` cannot load the site's root-relative JavaScript modules.

## Validation

- `node --test tests/*.test.mjs`: game logic, scoring, modes, custom words,
  authentication, validation, idempotency, and actual SQLite migration/storage.
- `node tests/typing-caret.browser.mjs`: per-keystroke stability, extra-character
  boundary guard, cursor alignment, line wraps, long words, desktop/mobile,
  reduced motion, and 200% text sizing.
- `node tests/typing-flow.browser.mjs`: custom/whole-text/Unicode tests, settings
  persistence, deletion, shortcuts, result history, and journal saves against a
  temporary database. No production test results are written.

Browser checks require a preview server on port 4321, Playwright, and Chrome.
`PLAYWRIGHT_MODULE` can point to an externally installed Playwright module.
SQLite tests require Node 22.13+ with its built-in `node:sqlite` module.
