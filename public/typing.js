import {
  createTest,
  typeCharacter,
  eraseCharacter,
  expireTest,
  resultForTest,
} from "/typing-logic.js?v=20260928";

const $ = (selector) => document.querySelector(selector);
const page = $(".typing-page");
const api = page.dataset.scoreApi;
const input = $("#typing-input");
const words = $("#words");
let test;
let interval;
let run = 0;
let history = [];
let pendingResult = null;
let saving = false;

function settings() {
  return {
    duration: Number($("[name=duration]:checked").value),
    punctuation: $("#punctuation").checked,
    numbers: $("#numbers").checked,
  };
}

let renderedIndex = 0;

function renderWord(index) {
  const word = test.words[index];
  const entry = test.entries[index] ?? "";
  const element = document.createElement("span");
  element.className = "typing-word";
  if (index < test.index && entry !== word) element.classList.add("missed");
  if (index === test.index) element.id = "active-word";
  for (
    let position = 0;
    position < Math.max(word.length, entry.length);
    position++
  ) {
    const letter = document.createElement("span");
    letter.className = "typing-letter";
    letter.textContent = word[position] ?? entry[position];
    if (position < entry.length)
      letter.classList.add(
        entry[position] === word[position] ? "correct" : "incorrect",
      );
    if (index === test.index && position === entry.length)
      letter.classList.add("caret");
    element.append(letter);
  }
  if (index === test.index && entry.length >= word.length) {
    const caret = document.createElement("span");
    caret.className = "typing-letter end caret";
    element.append(caret);
  }
  return element;
}

function renderWords() {
  const end = Math.min(test.words.length, test.index + 45);
  const fragment = document.createDocumentFragment();
  for (let index = words.children.length; index < end; index++)
    fragment.append(renderWord(index));
  words.append(fragment);
  // Keep earlier words in place so line breaks never jump as a word is submitted.
  for (
    let index = Math.min(renderedIndex, test.index);
    index <= Math.max(renderedIndex, test.index);
    index++
  ) {
    words.children[index].replaceWith(renderWord(index));
  }
  renderedIndex = test.index;
  const active = $("#active-word");
  const lineHeight = parseFloat(getComputedStyle(words).lineHeight);
  words.scrollTop = Math.max(0, active.offsetTop - lineHeight);
  $("#current-word").textContent =
    `Current word: ${test.words[test.index]}. Next: ${test.words.slice(test.index + 1, test.index + 6).join(" ")}`;
}

function renderHistory() {
  const current = settings();
  const matching = history.filter(
    (entry) =>
      entry.duration === current.duration &&
      entry.punctuation === current.punctuation &&
      entry.numbers === current.numbers,
  );
  $("#best-score").textContent =
    `Best: ${matching.length ? Math.max(...matching.map((entry) => entry.wpm)) + " wpm" : "–"}`;
  $("#history").hidden = !history.length;
  $("#history-rows").replaceChildren(
    ...history.slice(0, 20).map((entry) => {
      const row = document.createElement("tr");
      const values = [
        new Date(entry.playedAt).toLocaleDateString(),
        `${entry.duration}s`,
        entry.wpm,
        `${entry.accuracy}%`,
        [entry.punctuation && "punctuation", entry.numbers && "numbers"]
          .filter(Boolean)
          .join(", ") || "words",
      ];
      for (const value of values) {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.append(cell);
      }
      return row;
    }),
  );
}

async function loadHistory() {
  if (!api) {
    $("#history-status").textContent = "Journal unavailable in this preview.";
    return;
  }
  $("#history-status").textContent = "Loading…";
  try {
    const response = await fetch(`${api}/typing`);
    if (!response.ok) throw new Error();
    const loaded = (await response.json()).results;
    history = [
      ...new Map(
        [...loaded, ...history].map((entry) => [entry.id, entry]),
      ).values(),
    ].sort((a, b) => b.playedAt.localeCompare(a.playedAt));
    renderHistory();
    $("#history-status").textContent = history.length
      ? ""
      : "No saved tests yet.";
  } catch {
    $("#history-status").textContent = "Could not load typing history.";
  }
}

async function saveResult() {
  if (!pendingResult || saving) return;
  if (!api) {
    $("#save-status").textContent = "Journal unavailable in this preview.";
    return;
  }
  const key = $("#journal-key").value;
  if (!key) {
    $("#save-status").textContent =
      "Enter the journal key to save this result.";
    $("#retry-save").hidden = false;
    return;
  }
  const currentRun = run;
  const result = pendingResult;
  saving = true;
  $("#retry-save").hidden = true;
  $("#save-status").textContent = "Saving…";
  try {
    const response = await fetch(`${api}/typing`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(result),
    });
    if (!response.ok)
      throw new Error(
        response.status === 401
          ? "Journal key is incorrect."
          : "Could not save this result.",
      );
    const body = await response.json();
    history = [
      body.result,
      ...history.filter((entry) => entry.id !== body.result.id),
    ].sort((a, b) => b.playedAt.localeCompare(a.playedAt));
    renderHistory();
    $("#history-status").textContent = "";
    if (run === currentRun) {
      $("#save-status").textContent = "Saved.";
      pendingResult = null;
    }
  } catch (error) {
    if (run === currentRun) {
      $("#save-status").textContent =
        error.message || "Could not save this result.";
      $("#retry-save").hidden = false;
    }
  } finally {
    if (run === currentRun) saving = false;
  }
}

function finish() {
  if (page.dataset.state === "finished") return;
  clearInterval(interval);
  page.dataset.state = "finished";
  input.disabled = true;
  $("#settings").disabled = false;
  $("#test").hidden = true;
  $("#results").hidden = false;
  const result = resultForTest(test, performance.now());
  $("#result-wpm").textContent = result.wpm;
  $("#result-raw").textContent = result.rawWpm;
  $("#result-accuracy").textContent = `${result.accuracy}%`;
  $("#result-duration").textContent = `${result.duration}s`;
  $("#result-characters").textContent =
    `${result.correctCharacters} correct characters · ${result.totalKeystrokes - result.correctKeystrokes} incorrect keystrokes`;
  pendingResult = { id: crypto.randomUUID(), ...result };
  $("#results-heading").focus({ preventScroll: true });
  saveResult();
}

function tick() {
  const now = performance.now();
  if (expireTest(test, now)) {
    finish();
    return;
  }
  $("#time-left").textContent =
    test.startedAt === null
      ? test.settings.duration
      : Math.max(
          0,
          Math.ceil(test.settings.duration - (now - test.startedAt) / 1000),
        );
  $("#live-wpm").textContent = resultForTest(test, now).wpm;
}

function restart(focus = true) {
  clearInterval(interval);
  run++;
  saving = false;
  pendingResult = null;
  test = createTest(settings());
  words.replaceChildren();
  renderedIndex = 0;
  page.dataset.state = "ready";
  $("#settings").disabled = false;
  $("#test").hidden = false;
  $("#results").hidden = true;
  $("#save-status").textContent = "";
  $("#retry-save").hidden = true;
  input.disabled = false;
  input.value = "";
  $("#typing-help").textContent =
    "Type to begin. Space for the next word. Esc to restart.";
  renderWords();
  tick();
  renderHistory();
  if (focus) input.focus({ preventScroll: true });
}

input.addEventListener("input", (event) => {
  if (event.isComposing) return;
  const now = performance.now();
  if (expireTest(test, now)) {
    finish();
    return;
  }
  const previous = test.entries[test.index];
  const value = input.value.replace(/\n/g, " ");
  let common = 0;
  while (
    common < previous.length &&
    common < value.length &&
    previous[common] === value[common]
  )
    common++;
  for (let index = previous.length; index > common; index--)
    eraseCharacter(test, now);
  for (const character of value.slice(common))
    typeCharacter(test, character, now);
  input.value = test.entries[test.index];
  if (test.status === "running" && page.dataset.state !== "running") {
    page.dataset.state = "running";
    $("#settings").disabled = true;
    $("#typing-help").textContent =
      "Esc to restart. The timer continues if you leave this page.";
    interval = setInterval(tick, 100);
  }
  renderWords();
  tick();
});

input.addEventListener("keydown", (event) => {
  if (event.key === "Backspace" && !input.value) {
    event.preventDefault();
    eraseCharacter(test, performance.now());
    input.value = test.entries[test.index];
    renderWords();
    tick();
  }
});
// Paste and drop are valid in the journal key field, but not measured typing input.
for (const eventName of ["paste", "drop"])
  input.addEventListener(eventName, (event) => {
    event.preventDefault();
    $("#typing-help").textContent =
      "Type the words to take the test; pasted text does not count.";
  });
input.addEventListener("blur", () => {
  if (test.status !== "finished")
    $("#typing-help").textContent =
      "Click the words or tab back to continue. The timer keeps running.";
});
input.addEventListener("focus", () => {
  $("#typing-help").textContent =
    test.status === "ready"
      ? "Type to begin. Space for the next word. Esc to restart."
      : "Esc to restart. The timer continues if you leave this page.";
});
$("#typing-options").addEventListener("submit", (event) =>
  event.preventDefault(),
);
$("#typing-options").addEventListener("change", () => restart(false));
$("#restart").addEventListener("click", () => restart());
$("#retry-save").addEventListener("click", saveResult);
page.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && event.target !== $("#journal-key")) {
    event.preventDefault();
    restart();
  }
});
document.addEventListener("visibilitychange", () => {
  if (test.status === "running") tick();
});
window.addEventListener("resize", () => {
  if (test.status !== "finished") renderWords();
});
restart(false);
loadHistory();
