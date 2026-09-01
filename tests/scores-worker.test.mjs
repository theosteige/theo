import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../workers/scores.js", import.meta.url),
  "utf8",
);
const worker = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
);

const ORIGIN = "https://theosteiger.com";

function fakeDb(best = 0) {
  const db = {
    best,
    prepare(sql) {
      return {
        sql,
        args: [],
        bind(...args) {
          this.args = args;
          return this;
        },
        async all() {
          return { results: [{ best: db.best }] };
        },
      };
    },
    async batch(statements) {
      return statements.map((statement) => {
        if (statement.sql.includes("UPDATE card_memory")) {
          db.best = Math.max(db.best, statement.args[0]);
          return { results: [] };
        }
        return { results: [{ best: db.best }] };
      });
    },
  };
  return db;
}

function makeEnv(db) {
  return {
    ALLOWED_ORIGINS: "https://theosteiger.com,http://127.0.0.1:4321",
    WRITE_KEY: "journal-key",
    DB: db,
  };
}

function request(method, body, key) {
  return new Request("https://api.theosteiger.com/card-memory", {
    method,
    headers: {
      Origin: ORIGIN,
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

test("returns the stored card memory best score", async () => {
  const handle = worker.createHandler();
  const response = await handle(request("GET"), makeEnv(fakeDb(41)));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), ORIGIN);
  assert.deepEqual(await response.json(), { best: 41 });
});

test("rejects a best score update without the journal key", async () => {
  const handle = worker.createHandler();
  const response = await handle(
    request("POST", { score: 50 }, "wrong-key"),
    makeEnv(fakeDb(0)),
  );
  assert.equal(response.status, 401);
});

test("rejects an invalid card memory score", async () => {
  const handle = worker.createHandler();
  const response = await handle(
    request("POST", { score: -1 }, "journal-key"),
    makeEnv(fakeDb(0)),
  );
  assert.equal(response.status, 400);
});

test("stores a higher card memory best score", async () => {
  const handle = worker.createHandler();
  const db = fakeDb(10);
  const response = await handle(
    request("POST", { score: 25 }, "journal-key"),
    makeEnv(db),
  );
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { best: 25 });
  assert.equal(db.best, 25);
});

test("keeps the old best when the new score is lower", async () => {
  const handle = worker.createHandler();
  const db = fakeDb(60);
  const response = await handle(
    request("POST", { score: 12 }, "journal-key"),
    makeEnv(db),
  );
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { best: 60 });
});
