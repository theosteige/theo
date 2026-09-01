export const DECK_SIZE = 52;
export const STARTING_LIVES = 3;
export const SUITS = ["♠", "♥", "♦", "♣"];
export const RANKS = [
  "A",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
];

const SEEN_DRAW_CHANCE = 0.5;

export function createDeck(dots) {
  return SUITS.flatMap((suit) => RANKS.map((rank) => ({ rank, suit, dots })));
}

export function cardKey(card) {
  return `${card.rank}${card.suit}:${card.dots}`;
}

export function createGame() {
  return {
    lives: STARTING_LIVES,
    score: 0,
    status: "playing",
    decksUsed: 1,
    unseen: createDeck(0),
    seen: [],
    current: null,
    currentIsNew: false,
  };
}

function pick(pool, random) {
  return Math.floor(random() * pool.length);
}

export function drawCard(state, random = Math.random) {
  const needsFreshDeck = state.unseen.length === 0;
  const unseen = needsFreshDeck ? createDeck(state.decksUsed) : state.unseen;
  const decksUsed = needsFreshDeck ? state.decksUsed + 1 : state.decksUsed;

  const drawFromSeen =
    state.seen.length > 0 && random() < SEEN_DRAW_CHANCE && !needsFreshDeck;
  if (drawFromSeen) {
    return {
      ...state,
      current: state.seen[pick(state.seen, random)],
      currentIsNew: false,
    };
  }

  const index = pick(unseen, random);
  return {
    ...state,
    decksUsed,
    unseen: [...unseen.slice(0, index), ...unseen.slice(index + 1)],
    current: unseen[index],
    currentIsNew: true,
  };
}

export function answerCard(state, answer) {
  const correct = state.currentIsNew ? answer === "new" : answer === "seen";
  const lives = correct ? state.lives : state.lives - 1;
  return {
    ...state,
    score: correct ? state.score + 1 : state.score,
    lives,
    status: lives > 0 ? "playing" : "over",
    seen: state.currentIsNew ? [...state.seen, state.current] : state.seen,
  };
}
