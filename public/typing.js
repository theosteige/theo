import {
  createTest,
  typeCharacter,
  eraseCharacter,
  expireTest,
  resultForTest,
  normalizeSettings,
  customWords,
  characters,
} from "/typing-logic.js?v=20260928-v2";
import { createTypingView } from "/typing-view.js?v=20260928-v2";

const $ = (selector) => document.querySelector(selector);
const page = $(".typing-page");
const input = $("#typing-input");
const api = page.dataset.scoreApi;
const view = createTypingView(
  $("#words"),
  $("#word-track"),
  $("#word-lines"),
  $("#typing-caret"),
);
const STORAGE_KEY = "theo.typing.settings.v2";
let preferences;
try {
  preferences = normalizeSettings(
    JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"),
  );
} catch {
  preferences = normalizeSettings();
}
let test,
  interval,
  run = 0,
  history = [],
  pendingResult = null,
  saving = false;
let corpusId = "english-v1",
  corpusPromise = Promise.resolve(corpusId);
let customCount = preferences.wordCount;

function readSettings() {
  return normalizeSettings({
    mode: $("[name=mode]:checked").value,
    duration: Number($("[name=duration]:checked").value),
    wordCount: Number($("[name=word-count]:checked")?.value ?? customCount),
    punctuation: $("#punctuation").checked,
    numbers: $("#numbers").checked,
    source: $("#word-source").value,
    customText: $("#custom-text").value,
    order: $("#word-order").value,
    freedom: $("#freedom").checked,
    stopOnError: $("#stop-on-error").value,
    smoothCaret: $("#smooth-caret").checked,
    smoothScroll: $("#smooth-scroll").checked,
  });
}

function applySettings(settings) {
  for (const name of ["mode", "duration", "word-count"]) {
    const value = name === "word-count" ? settings.wordCount : settings[name];
    document.querySelectorAll(`[name=${name}]`).forEach((node) => {
      node.checked = node.value === String(value);
    });
  }
  customCount = settings.wordCount;
  if (!$("[name=word-count]:checked")) {
    let label = $("#custom-count-option");
    if (!label) {
      label = document.createElement("label");
      label.id = "custom-count-option";
      $("#word-options").append(label);
    }
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "word-count";
    radio.value = settings.wordCount;
    radio.checked = true;
    const text = document.createElement("span");
    text.textContent = settings.wordCount;
    label.replaceChildren(radio, text);
  }
  for (const [id, key] of [
    ["punctuation", "punctuation"],
    ["numbers", "numbers"],
    ["freedom", "freedom"],
    ["smooth-caret", "smoothCaret"],
    ["smooth-scroll", "smoothScroll"],
  ])
    $("#" + id).checked = settings[key];
  $("#word-source").value = settings.source;
  $("#custom-text").value = settings.customText;
  $("#word-order").value = settings.order;
  $("#stop-on-error").value = settings.stopOnError;
}

function settingsUI() {
  $("#time-options").hidden = preferences.mode !== "time";
  $("#word-options").hidden = preferences.mode !== "words";
  $("#custom-settings").hidden = preferences.source !== "custom";
  $("#punctuation").disabled = $("#numbers").disabled =
    preferences.source === "custom";
  page.dataset.smoothCaret = preferences.smoothCaret;
  page.dataset.smoothScroll = preferences.smoothScroll;
}

async function hashSource(settings) {
  if (settings.source !== "custom") return "english-v1";
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(customWords(settings.customText).join(" ")),
  );
  return Array.from(new Uint8Array(bytes), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
}

function matchingSettings(entry) {
  const s = preferences;
  return (
    entry.metricsVersion === 2 &&
    entry.mode === s.mode &&
    (s.mode === "time"
      ? entry.duration === s.duration
      : entry.wordCount === s.wordCount) &&
    entry.punctuation === (s.source === "english" && s.punctuation) &&
    entry.numbers === (s.source === "english" && s.numbers) &&
    entry.corpusId === corpusId &&
    entry.order === (s.source === "custom" ? s.order : "random") &&
    entry.freedom === s.freedom &&
    entry.stopOnError === s.stopOnError
  );
}

function renderHistory() {
  const matching = history.filter(matchingSettings);
  $("#best-score").textContent =
    `Best: ${matching.length ? Math.max(...matching.map((e) => e.wpm)) + " wpm" : "–"}`;
  $("#history").hidden = !history.length;
  $("#history-rows").replaceChildren(
    ...history.slice(0, 20).map((entry) => {
      const row = document.createElement("tr");
      const description =
        [
          entry.source === "custom" && "custom",
          entry.punctuation && "punctuation",
          entry.numbers && "numbers",
          entry.metricsVersion !== 2 && "previous scoring",
        ]
          .filter(Boolean)
          .join(", ") || "English";
      for (const value of [
        new Date(entry.playedAt).toLocaleDateString(),
        entry.mode === "words"
          ? `${entry.wordCount} words`
          : `${entry.duration}s`,
        entry.wpm,
        `${entry.accuracy}%`,
        description,
      ]) {
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
      body: JSON.stringify(pendingResult),
    });
    if (!response.ok)
      throw new Error(
        response.status === 401
          ? "Journal key is incorrect."
          : "Could not save this result.",
      );
    const { result } = await response.json();
    history = [result, ...history.filter((e) => e.id !== result.id)].sort(
      (a, b) => b.playedAt.localeCompare(a.playedAt),
    );
    renderHistory();
    $("#history-status").textContent = "";
    if (run === currentRun) {
      $("#save-status").textContent = "Saved.";
      pendingResult = null;
    }
  } catch (error) {
    if (run === currentRun) {
      $("#save-status").textContent = error.message;
      $("#retry-save").hidden = false;
    }
  } finally {
    if (run === currentRun) saving = false;
  }
}

function renderResults(result) {
  $("#result-wpm").textContent = result.wpm;
  $("#result-raw").textContent = result.rawWpm;
  $("#result-accuracy").textContent = `${result.accuracy}%`;
  $("#result-duration").textContent =
    `${(result.elapsedMs / 1000).toFixed(1)}s`;
  $("#result-characters").textContent =
    `${result.correctCharacters} correct · ${result.incorrectCharacters} incorrect · ${result.extraCharacters} extra · ${result.missedCharacters} missed`;
  $("#review-words").replaceChildren(
    ...test.entries.map((entry, index) => {
      const word = document.createElement("span");
      word.textContent = test.words[index];
      word.className =
        entry === test.words[index] ? "review-correct" : "review-error";
      word.title = `Typed: ${entry || "(empty)"}`;
      word.tabIndex = 0;
      word.setAttribute(
        "aria-label",
        `${test.words[index]}. Typed ${entry || "nothing"}.`,
      );
      return word;
    }),
  );
  $("#word-review").open = false;
  const samples = [...test.samples, result];
  $("#result-chart").hidden = samples.length < 2;
  const max = Math.max(1, ...samples.map((s) => s.wpm));
  $("#result-chart figcaption").textContent =
    `WPM over time · 0–${max} wpm · ${(result.elapsedMs / 1000).toFixed(1)}s`;
  $("#chart-line").setAttribute(
    "d",
    samples
      .map(
        (s, i) =>
          `${i ? "L" : "M"}${10 + (580 * s.elapsedMs) / Math.max(1, result.elapsedMs)},${110 - (100 * s.wpm) / max}`,
      )
      .join(" "),
  );
  $("#practice-missed").hidden = !test.mistakes.size;
}

async function finish() {
  if (page.dataset.state === "finished") return;
  clearInterval(interval);
  page.dataset.state = "finished";
  input.disabled = true;
  $("#test").hidden = true;
  $("#results").hidden = false;
  const result = resultForTest(test, performance.now());
  renderResults(result);
  $("#results-heading").focus({ preventScroll: true });
  const currentRun = run,
    s = test.settings;
  const id = await corpusPromise;
  if (currentRun !== run) return;
  pendingResult = {
    id: crypto.randomUUID(),
    ...result,
    duration: s.duration,
    metricsVersion: 2,
    mode: s.mode,
    wordCount: s.wordCount,
    source: s.source,
    corpusId: id,
    order: s.source === "custom" ? s.order : "random",
    freedom: s.freedom,
    stopOnError: s.stopOnError,
    punctuation: s.source === "english" && s.punctuation,
    numbers: s.source === "english" && s.numbers,
  };
  saveResult();
}

function tick() {
  if (!test) return;
  const now = performance.now();
  if (expireTest(test, now)) {
    finish();
    return;
  }
  const result = resultForTest(test, now);
  $("#time-left").textContent =
    test.settings.mode === "words"
      ? `${test.index}/${test.words.length}`
      : test.startedAt === null
        ? test.settings.duration
        : Math.max(
            0,
            Math.ceil(test.settings.duration - result.elapsedMs / 1000),
          );
  $("#progress-unit").textContent =
    test.settings.mode === "time" ? "s" : " words";
  $("#live-wpm").textContent = result.wpm;
  $("#live-accuracy").textContent = result.accuracy;
  if (
    test.status === "running" &&
    Math.floor(result.elapsedMs / 1000) >
      Math.floor((test.samples.at(-1)?.elapsedMs ?? 0) / 1000)
  )
    test.samples.push(result);
}

function updateInput() {
  input.value = test.entries[test.index];
  input.setSelectionRange(input.value.length, input.value.length);
  if (test.status === "finished") {
    finish();
    return;
  }
  if (test.status === "running" && page.dataset.state !== "running") {
    page.dataset.state = "running";
    interval = setInterval(tick, 100);
  }
  view.render(test);
  $("#current-word").textContent =
    `Current word: ${test.words[test.index]}. Next: ${test.words.slice(test.index + 1, test.index + 6).join(" ")}`;
  tick();
}

function restart({ focus = true, repeat = false } = {}) {
  const previousWords = repeat && test ? test.words : undefined;
  clearInterval(interval);
  run++;
  saving = false;
  pendingResult = null;
  preferences = readSettings();
  settingsUI();
  if (focus) $("#typing-preferences").open = false;
  $("#settings-error").textContent = "";
  try {
    test = createTest(preferences, previousWords);
  } catch (error) {
    test = null;
    input.disabled = true;
    page.dataset.state = "invalid";
    $("#test").hidden = false;
    $("#results").hidden = true;
    $("#settings-error").textContent = error.message;
    $("#custom-text").setAttribute("aria-invalid", "true");
    return;
  }
  $("#custom-text").removeAttribute("aria-invalid");
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    /* Storage is optional. */
  }
  const currentRun = run;
  corpusPromise = hashSource(preferences);
  corpusPromise.then((id) => {
    if (run === currentRun) {
      corpusId = id;
      renderHistory();
    }
  });
  page.dataset.state = "ready";
  $("#test").hidden = false;
  $("#results").hidden = true;
  $("#save-status").textContent = "";
  $("#retry-save").hidden = true;
  $("#practice-missed").hidden = true;
  input.disabled = false;
  input.value = "";
  $("#typing-help").textContent =
    "Type to begin · Tab then Enter to restart · Esc for settings";
  view.render(test, { reset: true, instant: true });
  updateInput();
  renderHistory();
  if (focus) input.focus({ preventScroll: true });
}

function insert(text) {
  if (!test) return;
  const now = performance.now();
  if (expireTest(test, now)) {
    finish();
    return;
  }
  for (const character of characters(text.replace(/\s/gu, " "))) {
    if (view.canAppend(character)) typeCharacter(test, character, now);
    // Render between batched/IME characters so the boundary guard sees the latest width.
    if (test.status !== "finished") view.render(test);
  }
  updateInput();
}

input.addEventListener("beforeinput", (event) => {
  if (event.isComposing) return;
  if (event.inputType.startsWith("delete")) {
    event.preventDefault();
    eraseCharacter(
      test,
      performance.now(),
      /Word|SoftLine|HardLine/.test(event.inputType),
      view.firstVisibleIndex(),
    );
    updateInput();
  } else if (event.inputType === "insertText" && event.data !== null) {
    event.preventDefault();
    insert(event.data);
  } else if (
    [
      "insertFromPaste",
      "insertFromDrop",
      "historyUndo",
      "historyRedo",
      "insertLineBreak",
      "insertParagraph",
    ].includes(event.inputType)
  )
    event.preventDefault();
});
input.addEventListener("input", (event) => {
  if (event.isComposing || !test) return;
  const previous = test.entries[test.index];
  const value = input.value;
  const oldChars = characters(previous),
    newChars = characters(value);
  let common = 0;
  while (
    common < oldChars.length &&
    common < newChars.length &&
    oldChars[common] === newChars[common]
  )
    common++;
  for (let i = oldChars.length; i > common; i--)
    eraseCharacter(test, performance.now());
  view.render(test);
  insert(newChars.slice(common).join(""));
});
input.addEventListener("compositionend", () => {
  if (!test) return;
  const previous = test.entries[test.index];
  const composed = input.value.startsWith(previous)
    ? input.value.slice(previous.length)
    : input.value;
  input.value = previous;
  insert(composed);
});
input.addEventListener("keydown", (event) => {
  if (event.isComposing) return;
  if (event.key === "Backspace") {
    event.preventDefault();
    eraseCharacter(
      test,
      performance.now(),
      event.ctrlKey || event.altKey || event.metaKey,
      view.firstVisibleIndex(),
    );
    updateInput();
  } else if (
    [
      "ArrowLeft",
      "ArrowRight",
      "ArrowUp",
      "ArrowDown",
      "Home",
      "End",
      "Delete",
      "Enter",
    ].includes(event.key)
  )
    event.preventDefault();
});
for (const name of ["paste", "drop"])
  input.addEventListener(name, (event) => {
    event.preventDefault();
    $("#typing-help").textContent =
      "Paste practice text in Words & settings. Type here to take the test.";
  });
input.addEventListener("blur", () => {
  page.dataset.focused = "false";
  $("#typing-help").textContent =
    test?.status === "running"
      ? "Click the words to continue · the timer keeps running"
      : "Click the words or start typing to focus";
});
input.addEventListener("focus", () => {
  page.dataset.focused = "true";
  $("#typing-help").textContent =
    "Tab then Enter to restart · Esc for settings";
});
$("#typing-options").addEventListener("submit", (event) =>
  event.preventDefault(),
);
$("#typing-options").addEventListener("change", () =>
  restart({ focus: false }),
);
$("#restart").addEventListener("click", () => restart());
$("#repeat-test").addEventListener("click", () => restart({ repeat: true }));
$("#retry-save").addEventListener("click", saveResult);
$("#use-text-length").addEventListener("click", () => {
  try {
    const count = customWords($("#custom-text").value).length;
    if (count > 500)
      throw new Error("Use up to 500 words for a whole-text test.");
    applySettings({
      ...readSettings(),
      mode: "words",
      wordCount: count,
      order: "ordered",
    });
    restart();
  } catch (error) {
    $("#settings-error").textContent = error.message;
  }
});
$("#practice-missed").addEventListener("click", () => {
  if (!test?.mistakes.size) return;
  const missed = [...test.mistakes];
  applySettings({
    ...preferences,
    mode: "words",
    wordCount: Math.max(10, missed.length),
    source: "custom",
    customText: missed.join(" "),
    order: "shuffle",
  });
  restart();
});
document.addEventListener("keydown", (event) => {
  const editing = event.target.closest(
    "input,textarea,select,button,summary,a",
  );
  if (event.key === "Escape" && (event.target === input || !editing)) {
    event.preventDefault();
    $("#typing-preferences").open = true;
    $("#word-source").focus();
  } else if (
    !editing &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    characters(event.key).length === 1 &&
    test?.status !== "finished"
  ) {
    event.preventDefault();
    input.focus({ preventScroll: true });
    insert(event.key);
  }
});
document.addEventListener("visibilitychange", () => {
  if (test?.status === "running") tick();
});
window.addEventListener("resize", () => {
  if (test && test.status !== "finished") view.render(test, { instant: true });
});
applySettings(preferences);
restart({ focus: matchMedia("(pointer: fine)").matches });
loadHistory();
