import {
  RANKS,
  SUITS,
  answerCard,
  cardImagePath,
  createGame,
  drawCard,
} from "/card-memory-logic.js?v=20260901-goodall";

const page = document.querySelector(".card-memory-page");
const scoreApi = page.dataset.scoreApi;
const journalKeyInput = document.querySelector("#journal-key");
const bestScore = document.querySelector("#best-score");
const livesOutput = document.querySelector("#lives");
const scoreOutput = document.querySelector("#score");
const cardElement = document.querySelector("#card");
const finalScore = document.querySelector("#final-score");
const finalBest = document.querySelector("#final-best");
const saveStatus = document.querySelector("#save-status");

const CARD_IMAGE_VERSION = "20260901-goodall";
const SUIT_NAMES = {
  "♠": "spades",
  "♥": "hearts",
  "♦": "diamonds",
  "♣": "clubs",
};
let game = null;
let knownBest = null;

function setPageState(state) {
  page.dataset.state = state;
  document.querySelector("#welcome").hidden = state !== "welcome";
  document.querySelector("#game").hidden = state !== "playing";
  document.querySelector("#finished").hidden = state !== "over";
}

function renderCard(card) {
  cardElement.setAttribute(
    "aria-label",
    `${card.rank} of ${SUIT_NAMES[card.suit]}, ${card.dots} ${card.dots === 1 ? "dot" : "dots"}`,
  );
  const face = document.createElement("img");
  face.className = "card-face";
  face.src = `${cardImagePath(card)}?v=${CARD_IMAGE_VERSION}`;
  face.alt = "";
  face.width = 180;
  face.height = 252;
  face.decoding = "async";
  face.fetchPriority = "high";
  face.draggable = false;
  const dots = document.createElement("div");
  dots.className = "card-dots";
  dots.setAttribute("aria-hidden", "true");
  dots.textContent = "•".repeat(card.dots);
  cardElement.replaceChildren(face, dots);
}

function renderGame() {
  livesOutput.textContent = game.lives;
  scoreOutput.textContent = game.score;
  if (game.current) renderCard(game.current);
}

async function loadBest() {
  if (!scoreApi) return;
  try {
    const response = await fetch(`${scoreApi}/card-memory`);
    if (!response.ok) throw new Error(`Status ${response.status}`);
    knownBest = (await response.json()).best;
    bestScore.textContent = knownBest;
  } catch {
    bestScore.textContent = "unavailable";
  }
}

async function saveBest(score) {
  if (!scoreApi || !journalKeyInput.value) {
    saveStatus.textContent =
      "Enter the journal key before the game to save a new best.";
    return;
  }
  try {
    const response = await fetch(`${scoreApi}/card-memory`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${journalKeyInput.value}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ score }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || `Status ${response.status}`);
    knownBest = body.best;
    saveStatus.textContent =
      body.updated ? "New best score saved." : "Best score unchanged.";
  } catch (error) {
    saveStatus.textContent = `Could not save: ${error.message}`;
  } finally {
    finalBest.textContent = knownBest ?? "–";
    bestScore.textContent = knownBest ?? "–";
  }
}

function finishGame() {
  finalScore.textContent = game.score;
  finalBest.textContent = knownBest ?? "–";
  saveStatus.textContent = "";
  setPageState("over");
  if (game.score > 0) saveBest(game.score);
}

function answer(choice) {
  if (!game || game.status !== "playing") return;
  game = answerCard(game, choice);
  if (game.status === "over") {
    renderGame();
    finishGame();
    return;
  }
  game = drawCard(game);
  renderGame();
}

document.querySelector("#game-options").addEventListener("submit", (event) => {
  event.preventDefault();
  game = drawCard(createGame());
  setPageState("playing");
  renderGame();
});

document.querySelector("#play-again").addEventListener("click", () => {
  setPageState("welcome");
});

document
  .querySelector("#answer-seen")
  .addEventListener("click", () => answer("seen"));
document
  .querySelector("#answer-new")
  .addEventListener("click", () => answer("new"));

if (RANKS.length * SUITS.length !== 52)
  throw new Error("The deck definition is incomplete.");

setPageState("welcome");
loadBest();
