import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { gzipSync } from "node:zlib";

import {
  DECK_SIZE,
  cardImagePath,
  createDeck,
} from "../public/card-memory-logic.js";

const publicDirectory = new URL("../public/", import.meta.url);
const cardDirectory = new URL("images/cards/", publicDirectory);

test("all 52 cards map to unique bundled images", async () => {
  const paths = createDeck(0).map(cardImagePath);
  const files = (await readdir(cardDirectory)).sort();
  assert.equal(paths.length, DECK_SIZE);
  assert.equal(new Set(paths).size, DECK_SIZE);
  assert.equal(files.length, DECK_SIZE);
  assert.deepEqual(
    files,
    paths.map((path) => path.split("/").at(-1)).sort(),
  );
});

test("the optimized deck stays within its lightweight transfer budget", async () => {
  const files = await readdir(cardDirectory);
  let compressedDeckBytes = 0;
  for (const file of files) {
    const image = await readFile(new URL(file, cardDirectory));
    const compressedBytes = gzipSync(image, { level: 9 }).byteLength;
    compressedDeckBytes += compressedBytes;
    const isCourtCard = /-(?:J|Q|K)\.svg$/.test(file);
    assert.ok(
      compressedBytes <= (isCourtCard ? 20_000 : 2_000),
      `${file} exceeds its compressed size budget`,
    );
  }
  assert.ok(compressedDeckBytes <= 180_000);
});

test("card images are licensed and absent from the initial page load", async () => {
  const [license, html, script] = await Promise.all([
    readFile(
      new URL("licenses/playing-cards-CC0.txt", publicDirectory),
      "utf8",
    ),
    readFile(new URL("card-memory/index.html", publicDirectory), "utf8"),
    readFile(new URL("card-memory.js", publicDirectory), "utf8"),
  ]);
  assert.match(license, /CC0 1\.0 Universal/);
  assert.doesNotMatch(html, /images\/cards/);
  assert.match(script, /cardImagePath\(card\)/);
});
