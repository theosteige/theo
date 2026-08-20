import assert from "node:assert/strict";
import test from "node:test";
import { createHandler } from "../workers/score-gist.js";

const env = {
  ALLOWED_ORIGINS: "https://theosteiger.com",
  GIST_ID: "gist-id",
  GITHUB_TOKEN: "github-token",
  WRITE_KEY: "journal-key"
};

const priorScore = {
  score: 31,
  playedAt: "2026-08-19T12:00:00.000Z",
  duration: 120
};

function gist(scores = [priorScore]) {
  return Response.json({
    files: {
      "scores.json": {
        content: JSON.stringify(scores),
        truncated: false
      }
    }
  });
}

test("reads score history from the Gist", async () => {
  const handler = createHandler(async (input, init) => {
    const request = new Request(input, init);
    assert.equal(request.url, "https://api.github.com/gists/gist-id");
    assert.equal(request.headers.get("Authorization"), "Bearer github-token");
    return gist();
  });
  const response = await handler(
    new Request("https://scores.example/scores", {
      headers: { Origin: "https://theosteiger.com" }
    }),
    env
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { scores: [priorScore] });
});

test("appends an authenticated score and updates the Gist", async () => {
  const requests = [];
  const handler = createHandler(
    async (input, init) => {
      const request = new Request(input, init);
      requests.push(request.clone());
      return request.method === "GET" ? gist() : Response.json({ ok: true });
    },
    () => new Date("2026-08-20T12:00:00.000Z")
  );
  const response = await handler(
    new Request("https://scores.example/scores", {
      method: "POST",
      headers: {
        Authorization: "Bearer journal-key",
        "Content-Type": "application/json",
        Origin: "https://theosteiger.com"
      },
      body: JSON.stringify({ score: 44, duration: 120 })
    }),
    env
  );

  assert.equal(response.status, 201);
  assert.equal(requests.length, 2);
  assert.equal(requests[1].method, "PATCH");
  const update = await requests[1].json();
  const scores = JSON.parse(update.files["scores.json"].content);
  assert.deepEqual(scores, [
    priorScore,
    { score: 44, playedAt: "2026-08-20T12:00:00.000Z", duration: 120 }
  ]);
});

test("rejects incorrect keys without contacting GitHub", async () => {
  let calls = 0;
  const handler = createHandler(async () => {
    calls += 1;
    return gist();
  });
  const response = await handler(
    new Request("https://scores.example/scores", {
      method: "POST",
      headers: {
        Authorization: "Bearer wrong-key",
        "Content-Type": "application/json",
        Origin: "https://theosteiger.com"
      },
      body: JSON.stringify({ score: 44, duration: 120 })
    }),
    env
  );

  assert.equal(response.status, 401);
  assert.equal(calls, 0);
});
