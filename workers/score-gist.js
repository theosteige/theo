const FILE = "scores.json";
const MAX_SCORES = 100;
const DURATIONS = new Set([30, 60, 120, 300, 600]);

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

function validScore(value) {
  return value &&
    Number.isInteger(value.score) &&
    value.score >= 0 &&
    value.score <= 10000 &&
    typeof value.playedAt === "string" &&
    Number.isFinite(Date.parse(value.playedAt)) &&
    DURATIONS.has(value.duration);
}

async function gistRequest(env, fetcher, method = "GET", body) {
  const response = await fetcher(`https://api.github.com/gists/${env.GIST_ID}`, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "theosteiger-mental-math",
      "X-GitHub-Api-Version": "2022-11-28"
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  if (!response.ok) throw new Error(`GitHub returned ${response.status}.`);
  return response.json();
}

async function readScores(env, fetcher) {
  const gist = await gistRequest(env, fetcher);
  const file = gist.files?.[FILE];
  if (!file || file.truncated || typeof file.content !== "string") {
    throw new Error(`${FILE} is missing or too large.`);
  }
  const scores = JSON.parse(file.content);
  return Array.isArray(scores) ? scores.filter(validScore).slice(-MAX_SCORES) : [];
}

async function sameSecret(left, right) {
  const encode = (value) => crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  const [leftHash, rightHash] = await Promise.all([encode(left), encode(right)]);
  return new Uint8Array(leftHash).every((byte, index) => byte === new Uint8Array(rightHash)[index]);
}

export function createHandler(fetcher = fetch, now = () => new Date()) {
  return async (request, env) => {
    const origin = requestOrigin(request, env);
    if (origin === false) return json({ error: "Origin not allowed." }, 403, null);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: headers(origin) });

    const path = new URL(request.url).pathname.replace(/\/$/, "");
    if (!path.endsWith("/scores")) return json({ error: "Not found." }, 404, origin);

    try {
      if (request.method === "GET") {
        return json({ scores: await readScores(env, fetcher) }, 200, origin);
      }

      if (request.method === "POST") {
        const key = request.headers.get("Authorization")?.replace(/^Bearer /, "") ?? "";
        if (!key || !(await sameSecret(key, env.WRITE_KEY))) {
          return json({ error: "Journal key is incorrect." }, 401, origin);
        }

        const input = await request.json();
        if (!Number.isInteger(input.score) || input.score < 0 || input.score > 10000 || !DURATIONS.has(input.duration)) {
          return json({ error: "Invalid score." }, 400, origin);
        }

        const entry = { score: input.score, playedAt: now().toISOString(), duration: input.duration };
        const scores = [...await readScores(env, fetcher), entry].slice(-MAX_SCORES);
        await gistRequest(env, fetcher, "PATCH", {
          files: { [FILE]: { content: `${JSON.stringify(scores, null, 2)}\n` } }
        });
        return json({ score: entry }, 201, origin);
      }

      return json({ error: "Method not allowed." }, 405, origin);
    } catch (error) {
      console.error(error);
      return json({ error: "Score history is temporarily unavailable." }, 502, origin);
    }
  };
}

const handle = createHandler();

export default {
  fetch(request, env) {
    return handle(request, env);
  }
};
