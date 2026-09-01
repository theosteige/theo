import assert from "node:assert/strict";
import test from "node:test";

import {
  GAME_END_REASONS,
  saveTargetForGameEnd,
} from "../public/mental-math-save-policy.js";

test("a timed score is saved only when its timer expires", () => {
  assert.equal(
    saveTargetForGameEnd(120, GAME_END_REASONS.TIMER_EXPIRED),
    "score",
  );
  assert.equal(
    saveTargetForGameEnd(120, GAME_END_REASONS.ABANDONED),
    null,
  );
  assert.equal(
    saveTargetForGameEnd(120, GAME_END_REASONS.PRACTICE_EXITED),
    null,
  );
});

test("practice time is saved only through the explicit exit button", () => {
  assert.equal(
    saveTargetForGameEnd(null, GAME_END_REASONS.PRACTICE_EXITED),
    "practice",
  );
  assert.equal(
    saveTargetForGameEnd(null, GAME_END_REASONS.ABANDONED),
    null,
  );
  assert.equal(
    saveTargetForGameEnd(null, GAME_END_REASONS.TIMER_EXPIRED),
    null,
  );
});
