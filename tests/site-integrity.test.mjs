import assert from "node:assert/strict";
import { access, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const publicDirectory = new URL("../public/", import.meta.url);
const expectedPages = [
  "card-memory/index.html",
  "design/index.html",
  "experience/index.html",
  "five-minute-intro/index.html",
  "index.html",
  "mental-math/index.html",
  "music/index.html",
  "piano/index.html",
  "podcasts/index.html",
  "reading/index.html",
  "side-quests/index.html",
  "typing/index.html",
  "writing/index.html",
];

async function findFiles(directory, extension) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const location = new URL(
        `${entry.name}${entry.isDirectory() ? "/" : ""}`,
        directory,
      );
      if (entry.isDirectory()) return findFiles(location, extension);
      return location.pathname.endsWith(extension) ? [location] : [];
    }),
  );
  return nested.flat();
}

function localAssetPath(reference) {
  if (!reference.startsWith("/")) return null;
  const pathname = reference.split(/[?#]/, 1)[0];
  if (pathname.endsWith("/")) return `${pathname.slice(1)}index.html`;
  return pathname.slice(1);
}

function referencesFrom(html) {
  const references = [
    ...html.matchAll(/(?:href|src|poster|data-src)="([^"]+)"/g),
  ].map((match) => match[1]);
  for (const match of html.matchAll(/srcset="([^"]+)"/g)) {
    references.push(
      ...match[1]
        .split(",")
        .map((candidate) => candidate.trim().split(/\s+/, 1)[0]),
    );
  }
  return references;
}

test("the public route contract contains only published pages", async () => {
  const pages = await findFiles(publicDirectory, ".html");
  const relativePages = pages
    .map((page) => path.relative(publicDirectory.pathname, page.pathname))
    .sort();
  assert.deepEqual(relativePages, expectedPages);
});

test("every local page and asset reference resolves", async () => {
  const pages = await findFiles(publicDirectory, ".html");
  for (const page of pages) {
    const html = await readFile(page, "utf8");
    for (const reference of referencesFrom(html)) {
      const assetPath = localAssetPath(reference);
      if (!assetPath) continue;
      await assert.doesNotReject(
        access(new URL(assetPath, publicDirectory)),
        `${path.relative(publicDirectory.pathname, page.pathname)} references missing ${reference}`,
      );
    }
  }
});

test("local raster images reserve space before loading", async () => {
  const pages = await findFiles(publicDirectory, ".html");
  for (const page of pages) {
    const html = await readFile(page, "utf8");
    for (const match of html.matchAll(/<img\b[^>]*>/g)) {
      const tag = match[0];
      if (!/src="\/(?:images|favicon)/.test(tag)) continue;
      assert.match(
        tag,
        /\bwidth="\d+"/,
        `${page.pathname} has an image without width`,
      );
      assert.match(
        tag,
        /\bheight="\d+"/,
        `${page.pathname} has an image without height`,
      );
    }
  }
});

test("design videos use thumbnails and load only after interaction", async () => {
  const html = await readFile(
    new URL("design/index.html", publicDirectory),
    "utf8",
  );
  assert.equal(html.match(/data-kind="video"/g)?.length, 7);
  assert.equal(html.match(/src="\/images\/design\//g)?.length, 7);
  assert.doesNotMatch(html, /<video\b/);
  assert.doesNotMatch(html, /\bautoplay\b/);
  assert.equal(html.match(/<audio\b[^>]*preload="none"/gs)?.length, 2);
});

test("the Design viewer keeps media inside the visible viewport", async () => {
  const css = await readFile(new URL("design.css", publicDirectory), "utf8");
  assert.match(css, /max-width: calc\(100vw - 32px\)/);
  assert.match(css, /max-height: calc\(100dvh - 72px\)/);
  assert.match(css, /padding: 56px 16px 16px/);
});

test("initial-load and deployment media stay within performance budgets", async () => {
  const sharedAssets = ["style.css", "site.js", "now-playing.js"];
  const sharedBytes = await Promise.all(
    sharedAssets.map(
      async (asset) => (await stat(new URL(asset, publicDirectory))).size,
    ),
  );
  assert.ok(sharedBytes.reduce((sum, size) => sum + size, 0) <= 30_000);

  const designThumbnails = await findFiles(
    new URL("images/design/", publicDirectory),
    ".jpg",
  );
  const thumbnailBytes = await Promise.all(
    designThumbnails.map(async (thumbnail) => (await stat(thumbnail)).size),
  );
  assert.ok(thumbnailBytes.reduce((sum, size) => sum + size, 0) <= 350_000);

  const videos = await findFiles(new URL("videos/", publicDirectory), ".mp4");
  const videoBytes = await Promise.all(
    videos.map(async (video) => (await stat(video)).size),
  );
  assert.ok(videoBytes.reduce((sum, size) => sum + size, 0) <= 70_000_000);
});
