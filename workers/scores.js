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
    if (!isScoresPath && !isPracticeTimePath && !isCardMemoryPath)
      return json({ error: "Not found." }, 404, origin);

    try {
      if (request.method === "GET") {
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

        const input = await request.json();
        if (isCardMemoryPath) {
          if (
            !Number.isInteger(input.score) ||
            input.score < 0 ||
            input.score > 1000000
          ) {
            return json({ error: "Invalid score." }, 400, origin);
          }
          const [, result] = await env.DB.batch([
            env.DB.prepare(
              "UPDATE card_memory SET best=MAX(best,?) WHERE id=1",
            ).bind(input.score),
            env.DB.prepare("SELECT best FROM card_memory WHERE id=1"),
          ]);
          return json({ best: result.results[0].best }, 201, origin);
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
