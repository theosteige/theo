import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const source = await readFile(
  new URL("../workers/scores.js", import.meta.url),
  "utf8",
);
const { createHandler } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
);
const handle = createHandler(() => new Date("2026-09-28T12:00:00Z"));
const migrationDirectory = new URL("../migrations/", import.meta.url);
const migrations = await Promise.all(
  (await readdir(migrationDirectory))
    .sort()
    .map((name) => readFile(new URL(name, migrationDirectory), "utf8")),
);

function environment(t) {
  const sqlite = new DatabaseSync(":memory:");
  for (const migration of migrations) sqlite.exec(migration);
  t.after(() => sqlite.close());
  const DB = {
    prepare(sql) {
      return {
        args: [],
        bind(...args) {
          this.args = args;
          return this;
        },
        async all() {
          return { results: sqlite.prepare(sql).all(...this.args) };
        },
      };
    },
    async batch(statements) {
      const results = [];
      for (const statement of statements) results.push(await statement.all());
      return results;
    },
  };
  return {
    DB,
    WRITE_KEY: "same-journal-key",
    ALLOWED_ORIGINS: "https://theosteiger.com",
  };
}
const valid = {
  id: "2a30a5f0-2900-4ec9-ab10-724c095188ce",
  duration: 30,
  punctuation: false,
  numbers: true,
  correctCharacters: 200,
  totalKeystrokes: 250,
  correctKeystrokes: 225,
};
function request(
  body,
  key = "same-journal-key",
  origin = "https://theosteiger.com",
) {
  return new Request("https://api.theosteiger.com/typing", {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Origin: origin,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

test("typing results use the existing journal key and persist metrics/settings in SQL", async (t) => {
  const env = environment(t);
  assert.deepEqual(await (await handle(request(), env)).json(), {
    results: [],
  });
  const response = await handle(request({ ...valid, wpm: 999 }), env);
  assert.equal(response.status, 201);
  const { result } = await response.json();
  assert.deepEqual(result, {
    ...valid,
    playedAt: "2026-09-28T12:00:00.000Z",
    wpm: 80,
    rawWpm: 100,
    accuracy: 90,
  });
  assert.deepEqual(await (await handle(request(), env)).json(), {
    results: [result],
  });
  const oldGame = await handle(
    new Request("https://api.theosteiger.com/card-memory"),
    env,
  );
  assert.deepEqual(await oldGame.json(), { best: 0 });
});

test("typing saves reject incorrect keys and disallowed origins without writing", async (t) => {
  const env = environment(t);
  assert.equal((await handle(request(valid, "wrong"), env)).status, 401);
  assert.equal(
    (
      await handle(
        request(valid, "same-journal-key", "https://example.com"),
        env,
      )
    ).status,
    403,
  );
  assert.deepEqual(await (await handle(request(), env)).json(), {
    results: [],
  });
});

test("invalid durations, counts, settings, IDs and JSON fail as client errors", async (t) => {
  const env = environment(t);
  const invalid = [
    { duration: 0 },
    { duration: 45 },
    { totalKeystrokes: 0 },
    { totalKeystrokes: 100001 },
    { correctCharacters: -1 },
    { correctCharacters: 226 },
    { correctKeystrokes: 251 },
    { correctKeystrokes: 200.1 },
    { punctuation: 1 },
    { numbers: "true" },
    { id: "bad" },
  ];
  for (const change of invalid)
    assert.equal(
      (await handle(request({ ...valid, ...change }), env)).status,
      400,
      JSON.stringify(change),
    );
  assert.equal((await handle(request(null), env)).status, 400);
  const malformed = new Request("https://api.theosteiger.com/typing", {
    method: "POST",
    headers: { Authorization: "Bearer same-journal-key" },
    body: "{",
  });
  assert.equal((await handle(malformed, env)).status, 400);
});

test("retrying a completed test is idempotent and preserves the original result", async (t) => {
  const env = environment(t);
  const first = await (await handle(request(valid), env)).json();
  const retry = await (
    await handle(request({ ...valid, correctCharacters: 100 }), env)
  ).json();
  assert.deepEqual(retry, first);
  assert.equal((await (await handle(request(), env)).json()).results.length, 1);
});

test("each requested duration saves independently and preflight permits authenticated writes", async (t) => {
  const env = environment(t);
  for (const duration of [15, 30, 60, 120]) {
    const response = await handle(
      request({ ...valid, id: crypto.randomUUID(), duration }),
      env,
    );
    assert.equal(response.status, 201);
  }
  assert.equal((await (await handle(request(), env)).json()).results.length, 4);
  const response = await handle(
    new Request("https://api.theosteiger.com/typing", {
      method: "OPTIONS",
      headers: { Origin: "https://theosteiger.com" },
    }),
    env,
  );
  assert.equal(response.status, 204);
  assert.match(
    response.headers.get("Access-Control-Allow-Headers"),
    /Authorization/,
  );
});

const modern = {
  ...valid,
  metricsVersion: 2,
  mode: "words",
  wordCount: 25,
  source: "custom",
  corpusId: "a".repeat(64),
  numbers: false,
  order: "ordered",
  freedom: false,
  stopOnError: "off",
  elapsedMs: 15000,
  rawCharacters: 220,
  incorrectCharacters: 10,
  extraCharacters: 10,
  missedCharacters: 5,
};

test("modern results persist custom-set identity and calculate speed from elapsed time", async (t) => {
  const env = environment(t);
  const response = await handle(
    request({ ...modern, customText: "private practice words", wpm: 999 }),
    env,
  );
  assert.equal(response.status, 201);
  const { result } = await response.json();
  assert.equal(result.wpm, 160);
  assert.equal(result.rawWpm, 176);
  assert.equal(result.accuracy, 90);
  assert.equal(result.corpusId, modern.corpusId);
  assert.equal(result.mode, "words");
  assert.equal(result.wordCount, 25);
  assert.equal(result.customText, undefined);
  assert.equal(result.metricsVersion, 2);
  assert.deepEqual((await (await handle(request(), env)).json()).results, [
    result,
  ]);
});

test("modern validation rejects inconsistent duration, settings and retained-character totals", async (t) => {
  const env = environment(t);
  for (const change of [
    { elapsedMs: 0 },
    { mode: "time", elapsedMs: 15000 },
    { rawCharacters: 251 },
    { rawCharacters: 199 },
    { wordCount: 501 },
    { metricsVersion: 3 },
    { corpusId: "bad" },
    { source: "english" },
    { numbers: true },
    { freedom: "yes" },
    { stopOnError: "maybe" },
    { order: "unknown" },
    { incorrectCharacters: 999 },
    { missedCharacters: -1 },
  ]) {
    assert.equal(
      (await handle(request({ ...modern, ...change }), env)).status,
      400,
      JSON.stringify(change),
    );
  }
  assert.equal(
    (await handle(request({ ...modern, mode: "time", elapsedMs: 30000 }), env))
      .status,
    201,
  );
});
