const DURATIONS = new Set([30, 60, 120, 300, 600]);
const OPERATIONS = new Set([
  "addition",
  "subtraction",
  "multiplication",
  "division",
]);
const DEFAULT_SETTINGS = {
  operations: [...OPERATIONS],
  additionLeft: { min: 2, max: 100 },
  additionRight: { min: 2, max: 100 },
  multiplicationLeft: { min: 2, max: 12 },
  multiplicationRight: { min: 2, max: 100 },
};
const MAX_PRACTICE_SESSION_SECONDS = 7 * 24 * 60 * 60;
const LEGACY_PRACTICE_YEAR = 2026;
const ATTEMPT_OPERATIONS = new Set(["+", "−", "×", "÷"]);

function headers(origin) {
  return {
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    ...(origin ? { "Access-Control-Allow-Origin": origin } : {}),
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  };
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: headers(origin),
  });
}

function requestOrigin(request, env) {
  const origin = request.headers.get("Origin");
  if (!origin) return null;
  return env.ALLOWED_ORIGINS.split(",")
    .map((value) => value.trim())
    .includes(origin)
    ? origin
    : false;
}

function validSettings(value) {
  const validRange = (range) =>
    Number.isSafeInteger(range?.min) &&
    Number.isSafeInteger(range.max) &&
    range.min >= 0 &&
    range.max >= range.min &&
    range.max <= 10000;
  return (
    value &&
    Array.isArray(value.operations) &&
    value.operations.length > 0 &&
    new Set(value.operations).size === value.operations.length &&
    value.operations.every((operation) => OPERATIONS.has(operation)) &&
    validRange(value.additionLeft) &&
    validRange(value.additionRight) &&
    validRange(value.multiplicationLeft) &&
    validRange(value.multiplicationRight)
  );
}

function validScore(value) {
  return (
    Number.isInteger(value.score) &&
    value.score >= 0 &&
    value.score <= 10000 &&
    typeof value.playedAt === "string" &&
    Number.isFinite(Date.parse(value.playedAt)) &&
    DURATIONS.has(value.duration) &&
    validSettings(value.settings)
  );
}

function canonicalAttempt(value, duration) {
  if (
    !Array.isArray(value) ||
    value.length !== 4 ||
    !ATTEMPT_OPERATIONS.has(value[0]) ||
    !Number.isSafeInteger(value[1]) ||
    value[1] < 0 ||
    value[1] > 100000000 ||
    !Number.isSafeInteger(value[2]) ||
    value[2] < 0 ||
    value[2] > 100000000 ||
    !Number.isSafeInteger(value[3]) ||
    value[3] < 1 ||
    value[3] > duration * 1000
  )
    return;
  const [operation, first, second, responseMs] = value;
  const [left, right] =
    (operation === "+" || operation === "×") && first > second
      ? [second, first]
      : [first, second];
  return [operation, left, right, responseMs];
}

async function readScores(db) {
  const { results } = await db
    .prepare(
      "SELECT score, played_at, duration, settings FROM scores ORDER BY id",
    )
    .all();
  return results
    .map((row) => ({
      score: row.score,
      playedAt: row.played_at,
      duration: row.duration,
      settings: JSON.parse(row.settings),
    }))
    .filter(validScore);
}

async function readPractice(db) {
  const [practice, sessions] = await db.batch([
    db.prepare("SELECT total_seconds FROM practice WHERE id=1"),
    db.prepare("SELECT played_at,seconds FROM practice_sessions ORDER BY id"),
  ]);
  const entries = sessions.results.map((row) => ({
    playedAt: row.played_at,
    seconds: row.seconds,
  }));
  const totalSeconds = practice.results[0]?.total_seconds ?? 0;
  return {
    totalSeconds,
    legacySeconds: Math.max(
      0,
      totalSeconds - entries.reduce((sum, entry) => sum + entry.seconds, 0),
    ),
    legacyYear: LEGACY_PRACTICE_YEAR,
    sessions: entries,
  };
}

async function readCardMemoryBest(db) {
  const { results } = await db
    .prepare("SELECT best FROM card_memory WHERE id=1")
    .all();
  return results[0]?.best ?? 0;
}

async function saveCardMemoryBest(db, score) {
  const { results } = await db
    .prepare(
      `
        INSERT INTO card_memory(id,best) VALUES(1,?)
        ON CONFLICT(id) DO UPDATE SET best=excluded.best
        WHERE excluded.best > card_memory.best
        RETURNING best
      `,
    )
    .bind(score)
    .all();

  if (results[0]) return { best: results[0].best, updated: true };
  return { best: await readCardMemoryBest(db), updated: false };
}

async function sameSecret(left, right) {
  const encode = (value) =>
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  const [leftHash, rightHash] = await Promise.all([
    encode(left),
    encode(right),
  ]);
  return new Uint8Array(leftHash).every(
    (byte, index) => byte === new Uint8Array(rightHash)[index],
  );
}

function validTypingResult(input) {
  const countsValid =
    input &&
    typeof input.id === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      input.id,
    ) &&
    [15, 30, 60, 120].includes(input.duration) &&
    typeof input.punctuation === "boolean" &&
    typeof input.numbers === "boolean" &&
    Number.isSafeInteger(input.totalKeystrokes) &&
    input.totalKeystrokes >= 1 &&
    input.totalKeystrokes <= 100000 &&
    Number.isSafeInteger(input.correctKeystrokes) &&
    input.correctKeystrokes >= 0 &&
    input.correctKeystrokes <= input.totalKeystrokes &&
    Number.isSafeInteger(input.correctCharacters) &&
    input.correctCharacters >= 0 &&
    input.correctCharacters <= input.correctKeystrokes;
  if (!countsValid) return false;
  if (input.metricsVersion === undefined) return true; // Existing deployed clients can finish their tests.
  return (
    input.metricsVersion === 2 &&
    ["time", "words"].includes(input.mode) &&
    Number.isSafeInteger(input.wordCount) &&
    input.wordCount >= 1 &&
    input.wordCount <= 500 &&
    ["english", "custom"].includes(input.source) &&
    (input.source === "english"
      ? input.corpusId === "english-v1"
      : /^[0-9a-f]{64}$/.test(input.corpusId)) &&
    ["random", "shuffle", "ordered"].includes(input.order) &&
    (input.source !== "english" || input.order === "random") &&
    (input.source !== "custom" || (!input.punctuation && !input.numbers)) &&
    typeof input.freedom === "boolean" &&
    ["off", "word", "letter"].includes(input.stopOnError) &&
    Number.isSafeInteger(input.elapsedMs) &&
    input.elapsedMs >= 1 &&
    input.elapsedMs <= 86400000 &&
    (input.mode !== "time" || input.elapsedMs === input.duration * 1000) &&
    Number.isSafeInteger(input.rawCharacters) &&
    input.rawCharacters >= input.correctCharacters &&
    input.rawCharacters <= input.totalKeystrokes &&
    [
      input.incorrectCharacters,
      input.extraCharacters,
      input.missedCharacters,
    ].every((n) => Number.isSafeInteger(n) && n >= 0 && n <= 100000) &&
    input.incorrectCharacters + input.extraCharacters <= input.rawCharacters
  );
}

function typingSettings(input) {
  if (input.metricsVersion !== 2) return {};
  const {
    metricsVersion,
    mode,
    wordCount,
    source,
    corpusId,
    order,
    freedom,
    stopOnError,
    incorrectCharacters,
    extraCharacters,
    missedCharacters,
  } = input;
  return {
    metricsVersion,
    mode,
    wordCount,
    source,
    corpusId,
    order,
    freedom,
    stopOnError,
    incorrectCharacters,
    extraCharacters,
    missedCharacters,
  };
}

function typingResult(row) {
  const settings = JSON.parse(row.settings || "{}");
  const seconds = row.elapsed_ms ? row.elapsed_ms / 1000 : row.duration;
  return {
    id: row.id,
    playedAt: row.played_at,
    duration: row.duration,
    punctuation: Boolean(row.punctuation),
    numbers: Boolean(row.numbers),
    correctCharacters: row.correct_characters,
    correctKeystrokes: row.correct_keystrokes,
    totalKeystrokes: row.total_keystrokes,
    ...(settings.metricsVersion === 2
      ? {
          ...settings,
          elapsedMs: row.elapsed_ms,
          rawCharacters: row.raw_characters,
        }
      : {}),
    wpm: Math.round((row.correct_characters * 12) / seconds),
    rawWpm: Math.round(
      ((row.raw_characters ?? row.total_keystrokes) * 12) / seconds,
    ),
    accuracy:
      Math.round((row.correct_keystrokes / row.total_keystrokes) * 1000) / 10,
  };
}

export function createHandler(now = () => new Date()) {
  return async (request, env) => {
    const origin = requestOrigin(request, env);
    if (origin === false)
      return json({ error: "Origin not allowed." }, 403, null);
    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers: headers(origin) });

    const path = new URL(request.url).pathname.replace(/\/$/, "");
    const isScoresPath = path.endsWith("/scores");
    const isPracticeTimePath = path.endsWith("/practice-time");
    const isCardMemoryPath = path.endsWith("/card-memory");
    const isTypingPath = path === "/typing";
    if (
      !isScoresPath &&
      !isPracticeTimePath &&
      !isCardMemoryPath &&
      !isTypingPath
    )
      return json({ error: "Not found." }, 404, origin);

    try {
      if (request.method === "GET") {
        if (isTypingPath) {
          const { results } = await env.DB.prepare(
            "SELECT * FROM typing_results ORDER BY played_at DESC, id DESC",
          ).all();
          return json({ results: results.map(typingResult) }, 200, origin);
        }
        if (isScoresPath)
          return json({ scores: await readScores(env.DB) }, 200, origin);
        if (isCardMemoryPath)
          return json({ best: await readCardMemoryBest(env.DB) }, 200, origin);
        return json(await readPractice(env.DB), 200, origin);
      }

      if (request.method === "POST") {
        const key =
          request.headers.get("Authorization")?.replace(/^Bearer /, "") ?? "";
        if (!key || !(await sameSecret(key, env.WRITE_KEY))) {
          return json({ error: "Journal key is incorrect." }, 401, origin);
        }

        let input;
        try {
          input = await request.json();
        } catch {
          return json({ error: "Invalid JSON." }, 400, origin);
        }
        if (!input || typeof input !== "object")
          return json({ error: "Invalid result." }, 400, origin);
        if (isTypingPath) {
          if (!validTypingResult(input))
            return json({ error: "Invalid typing result." }, 400, origin);
          const [, stored] = await env.DB.batch([
            env.DB.prepare(
              `INSERT INTO typing_results
              (id,played_at,duration,punctuation,numbers,correct_characters,total_keystrokes,correct_keystrokes,elapsed_ms,raw_characters,settings)
              VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING`,
            ).bind(
              input.id,
              now().toISOString(),
              input.duration,
              Number(input.punctuation),
              Number(input.numbers),
              input.correctCharacters,
              input.totalKeystrokes,
              input.correctKeystrokes,
              input.metricsVersion === 2 ? input.elapsedMs : null,
              input.metricsVersion === 2 ? input.rawCharacters : null,
              JSON.stringify(typingSettings(input)),
            ),
            env.DB.prepare("SELECT * FROM typing_results WHERE id=?").bind(
              input.id,
            ),
          ]);
          return json({ result: typingResult(stored.results[0]) }, 201, origin);
        }
        if (isCardMemoryPath) {
          if (
            !Number.isInteger(input.score) ||
            input.score < 0 ||
            input.score > 1000000
          ) {
            return json({ error: "Invalid score." }, 400, origin);
          }
          return json(
            await saveCardMemoryBest(env.DB, input.score),
            201,
            origin,
          );
        }

        if (isPracticeTimePath) {
          if (
            !Number.isSafeInteger(input.seconds) ||
            input.seconds < 1 ||
            input.seconds > MAX_PRACTICE_SESSION_SECONDS
          ) {
            return json({ error: "Invalid practice time." }, 400, origin);
          }
          const playedAt = now().toISOString();
          const [, , result] = await env.DB.batch([
            env.DB.prepare(
              "UPDATE practice SET total_seconds=total_seconds+? WHERE id=1",
            ).bind(input.seconds),
            env.DB.prepare(
              "INSERT INTO practice_sessions(played_at,seconds) VALUES(?,?)",
            ).bind(playedAt, input.seconds),
            env.DB.prepare("SELECT total_seconds FROM practice WHERE id=1"),
          ]);
          return json(
            {
              totalSeconds: result.results[0].total_seconds,
              session: { playedAt, seconds: input.seconds },
            },
            201,
            origin,
          );
        }

        const settings = input.settings ?? DEFAULT_SETTINGS;
        if (
          !Number.isInteger(input.score) ||
          input.score < 0 ||
          input.score > 10000 ||
          !DURATIONS.has(input.duration) ||
          !validSettings(settings)
        ) {
          return json({ error: "Invalid score." }, 400, origin);
        }

        let attempts = [];
        if (input.attempts !== undefined) {
          if (
            !Array.isArray(input.attempts) ||
            input.attempts.length !== input.score
          )
            return json({ error: "Invalid attempts." }, 400, origin);
          attempts = input.attempts.map((attempt) =>
            canonicalAttempt(attempt, input.duration),
          );
          if (attempts.some((attempt) => !attempt)) {
            return json({ error: "Invalid attempts." }, 400, origin);
          }
        }

        const entry = {
          score: input.score,
          playedAt: now().toISOString(),
          duration: input.duration,
          settings,
        };
        const statements = [
          env.DB.prepare(
            "INSERT INTO scores(score,played_at,duration,settings) VALUES(?,?,?,?)",
          ).bind(
            entry.score,
            entry.playedAt,
            entry.duration,
            JSON.stringify(entry.settings),
          ),
        ];
        if (attempts.length)
          statements.push(
            env.DB.prepare(
              `
          INSERT INTO attempts(game_at,operation,left_operand,right_operand,response_ms)
          SELECT ?,json_extract(value,'$[0]'),json_extract(value,'$[1]'),
            json_extract(value,'$[2]'),json_extract(value,'$[3]')
          FROM json_each(?)
        `,
            ).bind(entry.playedAt, JSON.stringify(attempts)),
          );
        await env.DB.batch(statements);
        return json({ score: entry }, 201, origin);
      }

      return json({ error: "Method not allowed." }, 405, origin);
    } catch (error) {
      console.error(error);
      return json(
        { error: "Game history is temporarily unavailable." },
        502,
        origin,
      );
    }
  };
}

const handle = createHandler();

export default {
  fetch(request, env) {
    return handle(request, env);
  },
};
