const DURATIONS = new Set([30, 60, 120, 300, 600]);
const OPERATIONS = new Set(["addition", "subtraction", "multiplication", "division"]);
const DEFAULT_SETTINGS = {
  operations: [...OPERATIONS],
  additionLeft: { min: 2, max: 100 },
  additionRight: { min: 2, max: 100 },
  multiplicationLeft: { min: 2, max: 12 },
  multiplicationRight: { min: 2, max: 100 }
};
const MAX_PRACTICE_SESSION_SECONDS = 7 * 24 * 60 * 60;

function headers(origin) {
  return {
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    ...(origin ? { "Access-Control-Allow-Origin": origin } : {}),
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff"
  };
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), { status, headers: headers(origin) });
}

function requestOrigin(request, env) {
  const origin = request.headers.get("Origin");
  if (!origin) return null;
  return env.ALLOWED_ORIGINS.split(",").map((value) => value.trim()).includes(origin)
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
  return value &&
    Array.isArray(value.operations) &&
    value.operations.length > 0 &&
    new Set(value.operations).size === value.operations.length &&
    value.operations.every((operation) => OPERATIONS.has(operation)) &&
    validRange(value.additionLeft) &&
    validRange(value.additionRight) &&
    validRange(value.multiplicationLeft) &&
    validRange(value.multiplicationRight);
}

function validScore(value) {
  return Number.isInteger(value.score) &&
    value.score >= 0 &&
    value.score <= 10000 &&
    typeof value.playedAt === "string" &&
    Number.isFinite(Date.parse(value.playedAt)) &&
    DURATIONS.has(value.duration) &&
    validSettings(value.settings);
}

async function readScores(db) {
  const { results } = await db
    .prepare("SELECT score, played_at, duration, settings FROM scores ORDER BY id")
    .all();
  return results.map((row) => ({
    score: row.score,
    playedAt: row.played_at,
    duration: row.duration,
    settings: JSON.parse(row.settings)
  })).filter(validScore);
}

async function sameSecret(left, right) {
  const encode = (value) => crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  const [leftHash, rightHash] = await Promise.all([encode(left), encode(right)]);
  return new Uint8Array(leftHash).every((byte, index) => byte === new Uint8Array(rightHash)[index]);
}

export function createHandler(now = () => new Date()) {
  return async (request, env) => {
    const origin = requestOrigin(request, env);
    if (origin === false) return json({ error: "Origin not allowed." }, 403, null);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: headers(origin) });

    const path = new URL(request.url).pathname.replace(/\/$/, "");
    const isScoresPath = path.endsWith("/scores");
    const isPracticeTimePath = path.endsWith("/practice-time");
    if (!isScoresPath && !isPracticeTimePath) return json({ error: "Not found." }, 404, origin);

    try {
      if (request.method === "GET") {
        if (isScoresPath) return json({ scores: await readScores(env.DB) }, 200, origin);
        const totalSeconds = await env.DB
          .prepare("SELECT total_seconds FROM practice WHERE id=1")
          .first("total_seconds");
        return json({ totalSeconds: totalSeconds ?? 0 }, 200, origin);
      }

      if (request.method === "POST") {
        const key = request.headers.get("Authorization")?.replace(/^Bearer /, "") ?? "";
        if (!key || !(await sameSecret(key, env.WRITE_KEY))) {
          return json({ error: "Journal key is incorrect." }, 401, origin);
        }

        const input = await request.json();
        if (isPracticeTimePath) {
          if (
            !Number.isSafeInteger(input.seconds) ||
            input.seconds < 1 ||
            input.seconds > MAX_PRACTICE_SESSION_SECONDS
          ) {
            return json({ error: "Invalid practice time." }, 400, origin);
          }
          const [, result] = await env.DB.batch([
            env.DB.prepare("UPDATE practice SET total_seconds=total_seconds+? WHERE id=1").bind(input.seconds),
            env.DB.prepare("SELECT total_seconds FROM practice WHERE id=1")
          ]);
          return json({ totalSeconds: result.results[0].total_seconds }, 201, origin);
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

        const entry = {
          score: input.score,
          playedAt: now().toISOString(),
          duration: input.duration,
          settings
        };
        await env.DB
          .prepare("INSERT INTO scores(score,played_at,duration,settings) VALUES(?,?,?,?)")
          .bind(entry.score, entry.playedAt, entry.duration, JSON.stringify(entry.settings))
          .run();
        return json({ score: entry }, 201, origin);
      }

      return json({ error: "Method not allowed." }, 405, origin);
    } catch (error) {
      console.error(error);
      return json({ error: "Game history is temporarily unavailable." }, 502, origin);
    }
  };
}

const handle = createHandler();

export default {
  fetch(request, env) {
    return handle(request, env);
  }
};
