import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../public/typing-logic.js", import.meta.url),
  "utf8",
);
const {
  createTest,
  typeCharacter,
  eraseCharacter,
  expireTest,
  resultForTest,
  generateWords,
} = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
);
const settings = { duration: 15, punctuation: false, numbers: false };
const type = (game, text, now = 1000) => {
  for (const letter of text) typeCharacter(game, letter, now);
};

test("the clock starts on the first character, not focus or an empty space", () => {
  const game = createTest(settings, ["hello", "world"]);
  type(game, " ", 1000);
  assert.equal(game.startedAt, null);
  assert.equal(expireTest(game, 100000), false);
  type(game, "h", 100000);
  assert.equal(game.startedAt, 100000);
  assert.equal(expireTest(game, 114999), false);
  assert.equal(expireTest(game, 115000), true);
});

test("correct words and a correct final partial word determine WPM", () => {
  const game = createTest(settings, ["hello", "world"]);
  type(game, "hello wor");
  expireTest(game, 16000);
  assert.deepEqual(resultForTest(game, 16000), {
    ...settings,
    correctCharacters: 9,
    correctKeystrokes: 9,
    totalKeystrokes: 9,
    wpm: 7,
    rawWpm: 7,
    accuracy: 100,
  });
});

test("incorrect words cannot inflate WPM, and corrections retain keystroke errors", () => {
  const game = createTest(settings, ["cat", "dog"]);
  type(game, "cxt ");
  type(game, "d");
  eraseCharacter(game, 1100);
  eraseCharacter(game, 1100);
  assert.equal(game.index, 0);
  assert.equal(game.entries[0], "cxt");
  eraseCharacter(game, 1100);
  eraseCharacter(game, 1100);
  type(game, "at dog", 1100);
  const result = resultForTest(game, 16000);
  assert.equal(result.correctCharacters, 7);
  assert.equal(result.totalKeystrokes, 11);
  assert.equal(result.correctKeystrokes, 9);
  assert.equal(result.accuracy, 81.8);
});

test("a skipped or incorrect word contributes no WPM", () => {
  const game = createTest(settings, ["hello", "world"]);
  type(game, "h world");
  assert.equal(resultForTest(game, 16000).correctCharacters, 5);
});

test("input after the deadline cannot alter the result, even before the timer callback", () => {
  const game = createTest(settings, ["hello", "world"]);
  type(game, "hello");
  type(game, " world", 16000);
  eraseCharacter(game, 18000);
  assert.equal(game.entries[0], "hello");
  assert.equal(game.totalKeystrokes, 5);
  assert.equal(game.status, "finished");
  assert.equal(resultForTest(game, 99000).wpm, 4);
});

test("word supply extends and punctuation/numbers settings produce distinct text", () => {
  const plain = generateWords(settings, 80, () => 0.5);
  assert.ok(plain.every((word) => /^[a-z]+$/.test(word)));
  const mixed = generateWords(
    { ...settings, punctuation: true, numbers: true },
    80,
    () => 0.5,
  );
  assert.match(mixed[0], /^[A-Z]/);
  assert.equal(mixed[4], "500");
  assert.match(mixed[7], /[.!?]$/);
  const game = createTest(settings, ["cat"]);
  type(game, "cat ");
  assert.ok(game.words.length > 40);
  assert.equal(game.entries[1], "");
});

test("restarting creates clean state without a savable completion", () => {
  const game = createTest(settings);
  type(game, "x");
  const restarted = createTest(settings);
  assert.equal(restarted.status, "ready");
  assert.equal(restarted.totalKeystrokes, 0);
  assert.equal(restarted.startedAt, null);
  assert.equal(expireTest(restarted, 999999), false);
});
