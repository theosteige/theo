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
  customWords,
  normalizeSettings,
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
    elapsedMs: 15000,
    rawCharacters: 9,
    incorrectCharacters: 0,
    extraCharacters: 0,
    missedCharacters: 0,
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
    () => 0.05,
  );
  assert.ok(mixed.some((word) => /[0-9]/.test(word)));
  assert.ok(mixed.some((word) => /[.!?,]/.test(word)));
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

test("completed correct words are locked unless backtracking is enabled", () => {
  const game = createTest(settings, ["cat", "dog"]);
  type(game, "cat ");
  eraseCharacter(game, 1200);
  assert.equal(game.index, 1);
  game.settings.freedom = true;
  eraseCharacter(game, 1300);
  assert.equal(game.index, 0);
  assert.equal(game.entries[0], "cat");
});

test("word deletion clears the current word and can reopen an incorrect visible word", () => {
  const game = createTest(settings, ["cat", "dog"]);
  type(game, "bad dog");
  eraseCharacter(game, 1200, true);
  assert.equal(game.entries[1], "");
  eraseCharacter(game, 1300, true, 1);
  assert.equal(game.index, 1);
  eraseCharacter(game, 1400, true, 0);
  assert.equal(game.index, 0);
  assert.equal(game.entries[0], "");
});

test("word-count mode ends on the final correct letter and uses actual elapsed time", () => {
  const game = createTest({ ...settings, mode: "words", wordCount: 2 }, [
    "cat",
    "dog",
  ]);
  type(game, "cat ", 1000);
  type(game, "dog", 4000);
  assert.equal(game.status, "finished");
  const result = resultForTest(game, 99999);
  assert.equal(result.elapsedMs, 3000);
  assert.equal(result.correctCharacters, 7);
  assert.equal(result.wpm, 28);
  assert.equal(result.rawWpm, 28);
});

test("Raw WPM counts retained text, while accuracy remembers corrected mistakes", () => {
  const game = createTest(settings, ["cat"]);
  type(game, "cxxxx");
  for (let i = 0; i < 4; i++) eraseCharacter(game, 1100);
  type(game, "at", 1200);
  expireTest(game, 16000);
  const result = resultForTest(game, 16000);
  assert.equal(result.rawCharacters, 3);
  assert.equal(result.totalKeystrokes, 7);
  assert.equal(result.rawWpm, result.wpm);
  assert.equal(result.accuracy, 42.9);
  assert.deepEqual([...game.mistakes], ["cat"]);
});

test("stop-on-error word and letter modes require correction before advancing", () => {
  const word = createTest({ ...settings, stopOnError: "word" }, ["cat", "dog"]);
  type(word, "bad ");
  assert.equal(word.index, 0);
  assert.equal(word.entries[0], "bad");
  const letter = createTest({ ...settings, stopOnError: "letter" }, [
    "cat",
    "dog",
  ]);
  type(letter, "xcat ");
  assert.equal(letter.index, 1);
  assert.equal(letter.totalKeystrokes, 5);
  assert.equal(letter.correctKeystrokes, 4);
});

test("custom vocabulary preserves case, punctuation, Unicode, and entered order", () => {
  const custom = {
    ...settings,
    source: "custom",
    order: "ordered",
    customText: "Hello,\ncafé 世界!",
    punctuation: true,
    numbers: true,
  };
  assert.deepEqual(customWords(custom.customText), ["Hello,", "café", "世界!"]);
  assert.deepEqual(generateWords(custom, 5), [
    "Hello,",
    "café",
    "世界!",
    "Hello,",
    "café",
  ]);
  assert.deepEqual(generateWords(custom, 2, Math.random, ["Hello,", "café"]), [
    "世界!",
    "Hello,",
  ]);
  const game = createTest({ ...custom, mode: "words", wordCount: 3 });
  type(game, "Hello, café 世界!", 1000);
  assert.equal(game.status, "finished");
  assert.equal(resultForTest(game, 2000).accuracy, 100);
  assert.ok(resultForTest(game, 2000).elapsedMs >= 1);
});

test("custom shuffle visits each word, random generation avoids the last two words", () => {
  const custom = {
    ...settings,
    source: "custom",
    order: "shuffle",
    customText: "alpha beta gamma",
  };
  const words = generateWords(custom, 6, () => 0.2);
  assert.deepEqual([...words.slice(0, 3)].sort(), ["alpha", "beta", "gamma"]);
  assert.deepEqual([...words.slice(3, 6)].sort(), ["alpha", "beta", "gamma"]);
  const random = generateWords(settings, 100, () => 0.5);
  for (let i = 2; i < random.length; i++) {
    assert.notEqual(random[i], random[i - 1]);
    assert.notEqual(random[i], random[i - 2]);
  }
  assert.throws(() => customWords("   "));
  assert.throws(() => customWords("x".repeat(41)));
  assert.throws(() => customWords("hello\u0000world"));
  assert.equal(
    normalizeSettings({ mode: "invalid", duration: 0 }).duration,
    30,
  );
});

test("submitting an incomplete final word does not earn partial-word WPM", () => {
  const game = createTest({ ...settings, mode: "words", wordCount: 1 }, [
    "cat",
  ]);
  type(game, "c", 1000);
  type(game, " ", 2000);
  const result = resultForTest(game, 2000);
  assert.equal(game.status, "finished");
  assert.equal(result.wpm, 0);
  assert.equal(result.rawCharacters, 2);
  assert.equal(result.missedCharacters, 2);
});
