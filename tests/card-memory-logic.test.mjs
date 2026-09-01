import assert from "node:assert/strict";
import test from "node:test";

import {
  DECK_SIZE,
  STARTING_LIVES,
  answerCard,
  cardKey,
  createDeck,
  createGame,
  drawCard,
} from "../public/card-memory-logic.js";

function sequence(...values) {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
}

test("a deck holds 52 unique cards with the requested dot count", () => {
  const deck = createDeck(2);
  assert.equal(deck.length, DECK_SIZE);
  assert.equal(new Set(deck.map(cardKey)).size, DECK_SIZE);
  assert.ok(deck.every((card) => card.dots === 2));
});

test("a new game starts with full lives, no score, and one fresh deck", () => {
  const game = createGame();
  assert.equal(game.lives, STARTING_LIVES);
  assert.equal(game.score, 0);
  assert.equal(game.status, "playing");
  assert.equal(game.unseen.length, DECK_SIZE);
  assert.equal(game.seen.length, 0);
  assert.equal(game.current, null);
  assert.equal(game.decksUsed, 1);
});

test("the first draw always shows a new card", () => {
  const game = createGame();
  const next = drawCard(game, sequence(0.1, 0));
  assert.equal(next.currentIsNew, true);
  assert.ok(next.current);
  assert.equal(next.unseen.length, DECK_SIZE - 1);
  // drawing must not mutate the original state
  assert.equal(game.current, null);
  assert.equal(game.unseen.length, DECK_SIZE);
});

test("answering NEW on a new card scores and remembers the card", () => {
  const drawn = drawCard(createGame(), sequence(0.9, 0));
  const next = answerCard(drawn, "new");
  assert.equal(next.score, 1);
  assert.equal(next.lives, STARTING_LIVES);
  assert.ok(next.seen.some((card) => cardKey(card) === cardKey(drawn.current)));
  assert.equal(drawn.score, 0);
});

test("answering SEEN on a new card costs a life", () => {
  const drawn = drawCard(createGame(), sequence(0.9, 0));
  const next = answerCard(drawn, "seen");
  assert.equal(next.score, 0);
  assert.equal(next.lives, STARTING_LIVES - 1);
});

test("a repeated card is drawn from the seen pile and rewards SEEN", () => {
  let game = answerCard(drawCard(createGame(), sequence(0.9, 0)), "new");
  game = drawCard(game, sequence(0.1, 0));
  assert.equal(game.currentIsNew, false);
  const next = answerCard(game, "seen");
  assert.equal(next.score, 2);
});

test("losing the last life ends the game", () => {
  let game = { ...drawCard(createGame(), sequence(0.9, 0)), lives: 1 };
  const next = answerCard(game, "seen");
  assert.equal(next.lives, 0);
  assert.equal(next.status, "over");
});

test("an exhausted deck introduces a fresh deck with one more dot", () => {
  const exhausted = {
    ...createGame(),
    unseen: [],
    seen: createDeck(0),
  };
  const next = drawCard(exhausted, sequence(0.9, 0));
  assert.equal(next.decksUsed, 2);
  assert.equal(next.currentIsNew, true);
  assert.equal(next.current.dots, 1);
  assert.equal(next.unseen.length + 1, DECK_SIZE);
});
