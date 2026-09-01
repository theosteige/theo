import {
  GAME_END_REASONS,
  saveTargetForGameEnd,
} from "/mental-math-save-policy.js";

(() => {
  const DEFAULT_SETTINGS = {
    operations: ["addition", "subtraction", "multiplication", "division"],
    additionLeft: { min: 2, max: 100 },
    additionRight: { min: 2, max: 100 },
    multiplicationLeft: { min: 2, max: 12 },
    multiplicationRight: { min: 2, max: 100 },
  };

  const page = document.querySelector(".mental-math-page");
  const scoreApi = (page.dataset.scoreApi ?? "").replace(/\/$/, "");
  const activitySummary = document.querySelector("#activity-summary");
  const activityMonths = document.querySelector("#activity-months");
  const activityDays = document.querySelector("#activity-days");
  const activityTooltip = document.querySelector("#activity-tooltip");
  const optionsForm = document.querySelector("#game-options");
  const settingsError = document.querySelector("#settings-error");
  const durationSelect = document.querySelector("#duration");
  const journalKeyInput = document.querySelector("#journal-key");
  const answerForm = document.querySelector("#answer-form");
  const answerInput = document.querySelector("#answer");
  const equation = document.querySelector("#equation");
  const timeLabel = document.querySelector("#time-label");
  const timeLeft = document.querySelector("#time-left");
  const exitPracticeButton = document.querySelector("#exit-practice");
  const currentScore = document.querySelector("#current-score");
  const finalScore = document.querySelector("#final-score");
  const saveStatus = document.querySelector("#save-status");
  const emptyProgress = document.querySelector("#empty-progress");
  const progressStatus = document.querySelector("#progress-status");
  const progressData = document.querySelector("#progress-data");
  const progressSummary = document.querySelector("#progress-summary");
  const progressChart = document.querySelector("#progress-chart");
  const emptyHistory = document.querySelector("#empty-history");
  const historyStatus = document.querySelector("#history-status");
  const historyData = document.querySelector("#history-data");
  const scoreHistory = document.querySelector("#score-history");
  const activityScroll = document.querySelector(".activity-scroll");

  const pacificDate = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const readableUtcDate = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  let currentProblem;
  let settings = DEFAULT_SETTINGS;
  let score = 0;
  let durationSeconds = 120;
  let endTime = 0;
  let countdownTimer;
  let isPlaying = false;
  let practiceStartedAt;
  let totalPracticeSeconds = 0;
  let scores = [];
  let practiceSessions = [];
  let legacyPracticeSeconds = 0;
  let legacyPracticeYear = 0;
  let scoresLoadState = 0;
  let practiceLoadState = 0;
  let attempts = [];
  let problemStartedAt = 0;

  function randomInteger(minimum, maximum, random) {
    return Math.floor(random() * (maximum - minimum + 1)) + minimum;
  }

  function createProblem(
    random = Math.random,
    problemSettings = DEFAULT_SETTINGS,
  ) {
    const operation =
      problemSettings.operations[
        randomInteger(0, problemSettings.operations.length - 1, random)
      ];

    if (operation === "addition") {
      const left = randomInteger(
        problemSettings.additionLeft.min,
        problemSettings.additionLeft.max,
        random,
      );
      const right = randomInteger(
        problemSettings.additionRight.min,
        problemSettings.additionRight.max,
        random,
      );
      return { left, operator: "+", right, answer: left + right };
    }

    if (operation === "subtraction") {
      const difference = randomInteger(
        problemSettings.additionLeft.min,
        problemSettings.additionLeft.max,
        random,
      );
      const subtrahend = randomInteger(
        problemSettings.additionRight.min,
        problemSettings.additionRight.max,
        random,
      );
      return {
        left: difference + subtrahend,
        operator: "−",
        right: difference,
        answer: subtrahend,
      };
    }

    if (operation === "multiplication") {
      const left = randomInteger(
        problemSettings.multiplicationLeft.min,
        problemSettings.multiplicationLeft.max,
        random,
      );
      const right = randomInteger(
        problemSettings.multiplicationRight.min,
        problemSettings.multiplicationRight.max,
        random,
      );
      return { left, operator: "×", right, answer: left * right };
    }

    const divisor = randomInteger(
      problemSettings.multiplicationLeft.min,
      problemSettings.multiplicationLeft.max,
      random,
    );
    const quotient = randomInteger(
      problemSettings.multiplicationRight.min,
      problemSettings.multiplicationRight.max,
      random,
    );
    return {
      left: divisor * quotient,
      operator: "÷",
      right: divisor,
      answer: quotient,
    };
  }

  function isCorrectAnswer(problem, value) {
    const answer = value.trim();
    return /^-?\d+$/.test(answer) && Number(answer) === problem.answer;
  }

  function pacificDateKey(value) {
    const parts = Object.fromEntries(
      pacificDate
        .formatToParts(new Date(value))
        .map((part) => [part.type, part.value]),
    );
    return `${parts.year}-${parts.month}-${parts.day}`;
  }

  function formatMinutes(seconds) {
    const minutes = seconds ? Math.max(1, Math.floor(seconds / 60)) : 0;
    return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  }

  function activityLevel(seconds) {
    if (seconds === 0) return 0;
    if (seconds < 300) return 1;
    if (seconds < 900) return 2;
    if (seconds < 1800) return 3;
    return 4;
  }

  function renderActivity() {
    if (page.dataset.state !== "history") return;
    if (scoresLoadState < 0 || practiceLoadState < 0) {
      activitySummary.textContent = "Activity could not be loaded.";
      return;
    }
    if (!scoresLoadState || !practiceLoadState) return;

    const year = Number(pacificDateKey(new Date()).slice(0, 4));
    const yearStart = new Date(Date.UTC(year, 0, 1));
    const leadingDays = yearStart.getUTCDay();
    const daysInYear = (Date.UTC(year + 1, 0, 1) - yearStart) / 86_400_000;
    const secondsByDate = new Map();
    const addSeconds = (playedAt, seconds) => {
      const date = pacificDateKey(playedAt);
      if (date.startsWith(`${year}-`)) {
        secondsByDate.set(date, (secondsByDate.get(date) ?? 0) + seconds);
      }
    };

    scores.forEach((entry) => addSeconds(entry.playedAt, entry.duration));
    practiceSessions.forEach((session) =>
      addSeconds(session.playedAt, session.seconds),
    );

    const yearTotal =
      [...secondsByDate.values()].reduce((sum, value) => sum + value, 0) +
      (legacyPracticeYear === year ? legacyPracticeSeconds : 0);
    const weeks = Math.ceil((leadingDays + daysInYear) / 7);
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];

    activitySummary.textContent = `${formatMinutes(yearTotal)} in ${year}`;
    activityMonths.style.setProperty("--activity-weeks", weeks);
    activityMonths.replaceChildren(
      ...monthNames.map((name, month) => {
        const label = document.createElement("span");
        const daysSinceYearStart =
          (Date.UTC(year, month, 1) - yearStart) / 86_400_000;
        label.textContent = name;
        label.style.gridColumn = String(
          Math.floor((leadingDays + daysSinceYearStart) / 7) + 1,
        );
        return label;
      }),
    );

    const dayElements = Array.from({ length: leadingDays }, () =>
      document.createElement("span"),
    );
    for (let offset = 0; offset < daysInYear; offset += 1) {
      const date = new Date(yearStart.getTime() + offset * 86_400_000);
      const dateKey = date.toISOString().slice(0, 10);
      const seconds = secondsByDate.get(dateKey) ?? 0;
      const day = document.createElement("span");
      const tooltip = seconds
        ? `${formatMinutes(seconds)} on ${readableUtcDate.format(date)}`
        : `No activity on ${readableUtcDate.format(date)}`;

      day.className = "activity-day";
      day.dataset.level = String(activityLevel(seconds));
      day.dataset.tooltip = tooltip;
      if (seconds) {
        day.tabIndex = 0;
        day.setAttribute("aria-label", tooltip);
      } else {
        day.setAttribute("aria-hidden", "true");
      }
      dayElements.push(day);
    }

    activityDays.setAttribute("role", "group");
    activityDays.setAttribute("aria-label", `Daily minutes played in ${year}`);
    activityDays.replaceChildren(...dayElements);
  }

  function showActivityTooltip(event) {
    const day = event.target.closest(".activity-day");
    if (!day) return;

    activityTooltip.textContent = day.dataset.tooltip;
    activityTooltip.hidden = false;
    const bounds = day.getBoundingClientRect();
    const minimumCenter = activityTooltip.offsetWidth / 2 + 4;
    const center = Math.max(
      minimumCenter,
      Math.min(innerWidth - minimumCenter, bounds.left + bounds.width / 2),
    );
    activityTooltip.style.left = `${center}px`;
    activityTooltip.style.top = `${bounds.top - 6}px`;
  }

  function hideActivityTooltip() {
    activityTooltip.hidden = true;
  }

  async function loadPracticeTime() {
    if (!scoreApi) {
      practiceLoadState = -1;
      renderActivity();
      return;
    }

    try {
      const response = await fetch(`${scoreApi}/practice-time`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      totalPracticeSeconds = body.totalSeconds;
      practiceSessions = body.sessions ?? [];
      legacyPracticeSeconds = body.legacySeconds ?? totalPracticeSeconds;
      legacyPracticeYear = body.legacyYear ?? 2026;
      practiceLoadState = 1;
      renderActivity();
    } catch {
      practiceLoadState = -1;
      renderActivity();
    }
  }

  async function savePracticeTime(seconds) {
    if (!scoreApi || !journalKeyInput.value) {
      saveStatus.textContent =
        "Enter the journal key to save practice time. Practice scores are not saved.";
      return;
    }

    saveStatus.textContent = "Saving practice time…";
    try {
      const response = await fetch(`${scoreApi}/practice-time`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${journalKeyInput.value}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ seconds }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      totalPracticeSeconds = body.totalSeconds;
      if (body.session) practiceSessions.push(body.session);
      renderActivity();
      saveStatus.textContent =
        "Practice time saved. Practice scores are not saved.";
    } catch {
      saveStatus.textContent =
        "Practice time could not be saved. Practice scores are not saved.";
    }
  }

  function setLoadingMessage(message) {
    progressStatus.textContent = message;
    historyStatus.textContent = message;
  }

  function withDefaultSettings(entry) {
    return entry.settings ? entry : { ...entry, settings: DEFAULT_SETTINGS };
  }

  async function loadScores() {
    if (!scoreApi) {
      scoresLoadState = -1;
      setLoadingMessage("Score syncing is not configured.");
      renderActivity();
      return;
    }

    setLoadingMessage("Loading…");
    try {
      const response = await fetch(`${scoreApi}/scores`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      scores = body.scores.map(withDefaultSettings);
      scoresLoadState = 1;
      setLoadingMessage("");
    } catch {
      scoresLoadState = -1;
      setLoadingMessage("Scores could not be loaded.");
    }
    renderScores();
  }

  async function saveScore() {
    if (!scoreApi || !journalKeyInput.value) {
      saveStatus.textContent = "Enter the journal key to save this score.";
      return;
    }

    saveStatus.textContent = "Saving…";
    try {
      const response = await fetch(`${scoreApi}/scores`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${journalKeyInput.value}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          score,
          duration: durationSeconds,
          settings,
          attempts,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      scores.push(
        withDefaultSettings({
          ...body.score,
          settings: body.score.settings ?? settings,
        }),
      );
      saveStatus.textContent = "Saved.";
      renderScores();
    } catch {
      saveStatus.textContent = "Score could not be saved.";
    }
  }

  function readRange(minimumId, maximumId) {
    const minimum = Number(document.querySelector(`#${minimumId}`).value);
    const maximum = Number(document.querySelector(`#${maximumId}`).value);
    const valid =
      Number.isSafeInteger(minimum) &&
      Number.isSafeInteger(maximum) &&
      minimum >= 0 &&
      maximum >= minimum &&
      maximum <= 10_000;
    return valid ? { min: minimum, max: maximum } : undefined;
  }

  function readSettings() {
    const operations = DEFAULT_SETTINGS.operations.filter(
      (operation) => document.querySelector(`#${operation}`).checked,
    );
    const additionLeft = readRange("add-left-min", "add-left-max");
    const additionRight = readRange("add-right-min", "add-right-max");
    const multiplicationLeft = readRange("mul-left-min", "mul-left-max");
    const multiplicationRight = readRange("mul-right-min", "mul-right-max");

    if (
      !operations.length ||
      !additionLeft ||
      !additionRight ||
      !multiplicationLeft ||
      !multiplicationRight
    ) {
      settingsError.hidden = false;
      settingsError.textContent = operations.length
        ? "Use whole-number ranges from 0 to 10,000, with the minimum no greater than the maximum."
        : "Select at least one operation.";
      return undefined;
    }

    settingsError.hidden = true;
    return {
      operations,
      additionLeft,
      additionRight,
      multiplicationLeft,
      multiplicationRight,
    };
  }

  function setPageState(state) {
    page.dataset.state = state;
  }

  function showNextProblem() {
    currentProblem = createProblem(Math.random, settings);
    equation.textContent = `${currentProblem.left} ${currentProblem.operator} ${currentProblem.right} =`;
    problemStartedAt = performance.now();
  }

  function updateCountdown() {
    const remaining = Math.max(0, endTime - performance.now());
    timeLeft.value = String(Math.ceil(remaining / 1000));
    if (remaining <= 0) finishGame(GAME_END_REASONS.TIMER_EXPIRED);
  }

  function startGame() {
    const practiceMode = durationSeconds === null;
    practiceStartedAt = practiceMode ? performance.now() : undefined;
    score = 0;
    attempts = [];
    currentScore.value = "0";
    timeLabel.textContent = practiceMode ? "Practice mode" : "Seconds left:";
    timeLeft.hidden = practiceMode;
    timeLeft.value = practiceMode ? "" : String(durationSeconds);
    exitPracticeButton.hidden = !practiceMode;
    isPlaying = true;
    endTime = practiceMode
      ? Number.POSITIVE_INFINITY
      : performance.now() + durationSeconds * 1000;
    answerInput.value = "";
    saveStatus.textContent = "";
    setPageState("playing");
    showNextProblem();
    answerInput.focus();
    countdownTimer = practiceMode
      ? undefined
      : window.setInterval(updateCountdown, 100);
  }

  function finishGame(reason) {
    if (!isPlaying) return;

    const saveTarget = saveTargetForGameEnd(durationSeconds, reason);
    isPlaying = false;
    if (countdownTimer !== undefined) window.clearInterval(countdownTimer);
    countdownTimer = undefined;
    exitPracticeButton.hidden = true;

    if (!saveTarget) {
      practiceStartedAt = undefined;
      return;
    }

    if (saveTarget === "practice") {
      timeLabel.textContent = "Practice complete";
      const seconds = Math.max(
        1,
        Math.round((performance.now() - practiceStartedAt) / 1000),
      );
      practiceStartedAt = undefined;
      savePracticeTime(seconds);
    } else {
      timeLeft.value = "0";
      saveScore();
    }

    finalScore.textContent = String(score);
    renderScores();
    setPageState("finished");
  }

  function rangesMatch(left, right) {
    return left.min === right.min && left.max === right.max;
  }

  function isDefaultGame(entry) {
    const entrySettings = entry.settings;
    return (
      entry.duration === 120 &&
      entrySettings.operations.length === DEFAULT_SETTINGS.operations.length &&
      DEFAULT_SETTINGS.operations.every((operation) =>
        entrySettings.operations.includes(operation),
      ) &&
      rangesMatch(entrySettings.additionLeft, DEFAULT_SETTINGS.additionLeft) &&
      rangesMatch(
        entrySettings.additionRight,
        DEFAULT_SETTINGS.additionRight,
      ) &&
      rangesMatch(
        entrySettings.multiplicationLeft,
        DEFAULT_SETTINGS.multiplicationLeft,
      ) &&
      rangesMatch(
        entrySettings.multiplicationRight,
        DEFAULT_SETTINGS.multiplicationRight,
      )
    );
  }

  function renderScores() {
    const defaultGames = scores.filter(isDefaultGame);
    if (!defaultGames.length) {
      emptyProgress.hidden = false;
      progressData.hidden = true;
      progressChart.setAttribute("hidden", "");
    } else {
      const values = defaultGames.map((entry) => entry.score);
      const average =
        values.reduce((sum, value) => sum + value, 0) / values.length;
      emptyProgress.hidden = true;
      progressData.hidden = false;
      progressSummary.textContent = `Latest: ${values.at(-1)} · Best: ${Math.max(...values)} · Average: ${average.toFixed(1)} · Games: ${values.length}`;
      progressChart.removeAttribute("hidden");
      renderScoreChart(defaultGames);
    }

    emptyHistory.hidden = scores.length > 0;
    historyData.hidden = scores.length === 0;
    if (scores.length) renderHistory();
    renderActivity();
  }

  function renderScoreChart(games) {
    const recentGames = games.slice(-20);
    const width = 440;
    const height = 160;
    const padding = { top: 14, right: 14, bottom: 28, left: 34 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    const highestScore = Math.max(...recentGames.map((entry) => entry.score));
    const scaleMaximum = Math.max(10, Math.ceil(highestScore / 10) * 10);
    const xPosition = (index) =>
      recentGames.length === 1
        ? padding.left + chartWidth / 2
        : padding.left + (index / (recentGames.length - 1)) * chartWidth;
    const yPosition = (value) =>
      padding.top + chartHeight - (value / scaleMaximum) * chartHeight;
    const points = recentGames.map((entry, index) => ({
      x: xPosition(index),
      y: yPosition(entry.score),
      score: entry.score,
    }));
    const path = points
      .map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`)
      .join(" ");

    progressChart.innerHTML = `
      <title id="progress-chart-title">Default mental math scores over time</title>
      <desc id="progress-chart-description">The latest ${recentGames.length} default-setting game scores, from oldest to newest.</desc>
      ${[scaleMaximum, Math.round(scaleMaximum / 2), 0]
        .map((value) => {
          const y = yPosition(value);
          return `<line class="chart-grid" x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}"></line><text class="chart-label" x="${padding.left - 6}" y="${y + 4}" text-anchor="end">${value}</text>`;
        })
        .join("")}
      <path class="chart-line" d="${path}"></path>
      ${points
        .map(
          (point) =>
            `<circle class="chart-point" cx="${point.x}" cy="${point.y}" r="4"><title>Score: ${point.score}</title></circle>`,
        )
        .join("")}
      <text class="chart-label" x="${padding.left}" y="${height - 7}">Older</text>
      <text class="chart-label" x="${width - padding.right}" y="${height - 7}" text-anchor="end">Latest</text>`;
  }

  function formatRange(range) {
    return `${range.min}–${range.max}`;
  }

  function formatSettings(entrySettings) {
    const descriptions = [entrySettings.operations.join(", ")];
    if (
      entrySettings.operations.some(
        (operation) => operation === "addition" || operation === "subtraction",
      )
    ) {
      descriptions.push(
        `add ranges ${formatRange(entrySettings.additionLeft)} + ${formatRange(entrySettings.additionRight)}`,
      );
    }
    if (
      entrySettings.operations.some(
        (operation) =>
          operation === "multiplication" || operation === "division",
      )
    ) {
      descriptions.push(
        `multiply ranges ${formatRange(entrySettings.multiplicationLeft)} × ${formatRange(entrySettings.multiplicationRight)}`,
      );
    }
    return descriptions.join("; ");
  }

  function renderHistory() {
    const dateTime = new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    scoreHistory.replaceChildren(
      ...[...scores].reverse().map((entry) => {
        const item = document.createElement("li");
        item.textContent = `Score ${entry.score} — ${entry.duration}s — ${formatSettings(entry.settings)} — ${dateTime.format(new Date(entry.playedAt))}`;
        return item;
      }),
    );
  }

  optionsForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const requestedSettings = readSettings();
    if (!requestedSettings) return;
    settings = requestedSettings;
    durationSeconds =
      durationSelect.value === "practice" ? null : Number(durationSelect.value);
    startGame();
  });

  answerForm.addEventListener("submit", (event) => event.preventDefault());
  answerInput.addEventListener("input", () => {
    if (!isPlaying || !currentProblem) return;
    if (performance.now() >= endTime) {
      finishGame(GAME_END_REASONS.TIMER_EXPIRED);
      return;
    }
    if (!isCorrectAnswer(currentProblem, answerInput.value)) return;

    if (durationSeconds !== null) {
      attempts.push([
        currentProblem.operator,
        currentProblem.left,
        currentProblem.right,
        Math.max(1, Math.round(performance.now() - problemStartedAt)),
      ]);
    }
    score += 1;
    currentScore.value = String(score);
    answerInput.value = "";
    showNextProblem();
  });

  document.querySelector("#try-again").addEventListener("click", (event) => {
    event.preventDefault();
    startGame();
  });
  exitPracticeButton.addEventListener("click", () =>
    finishGame(GAME_END_REASONS.PRACTICE_EXITED),
  );
  window.addEventListener("pagehide", () =>
    finishGame(GAME_END_REASONS.ABANDONED),
  );
  document.querySelectorAll("[data-show-settings]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      setPageState("settings");
    });
  });
  document.querySelectorAll("[data-show-history]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      setPageState("history");
      renderActivity();
      loadScores();
    });
  });
  activityDays.addEventListener("pointerover", showActivityTooltip);
  activityDays.addEventListener("pointerout", hideActivityTooltip);
  activityDays.addEventListener("focusin", showActivityTooltip);
  activityDays.addEventListener("focusout", hideActivityTooltip);
  activityScroll.addEventListener("scroll", hideActivityTooltip);

  renderScores();
  loadScores();
  loadPracticeTime();
})();
