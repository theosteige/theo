import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const publicDirectory = new URL("../public/", import.meta.url);
const draftDirectory = new URL("../drafts/", import.meta.url);

async function htmlFiles(directory, prefix = "") {
  const files = [];
  for (const entry of await readdir(new URL(prefix, directory), { withFileTypes: true })) {
    const file = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) files.push(...await htmlFiles(directory, `${file}/`));
    else if (file.endsWith(".html")) files.push(file);
  }
  return files.sort();
}

test("published pages match visible Table of Contents and Side Quests entries", async () => {
  const linked = new Set(["index.html"]);
  for (const navigation of ["index.html", "side-quests/index.html"]) {
    const html = await readFile(new URL(navigation, publicDirectory), "utf8");
    const contents = html.match(/<ul class="contents-list">([\s\S]*?)<\/ul>/)?.[1];
    assert.ok(contents, `Missing contents list in ${navigation}`);
    assert.doesNotMatch(contents, /<li\b[^>]*\bhidden\b/, "Move unpublished pages to drafts/ rather than merely hiding their links");
    for (const match of contents.matchAll(/<a href="\/([a-z0-9-]+)\/">/g)) {
      linked.add(`${match[1]}/index.html`);
    }
  }
  assert.deepEqual(await htmlFiles(publicDirectory), [...linked].sort());
});

test("the five unpublished pages are preserved outside the deployment folder", async () => {
  const drafts = ["blog", "contrarian-takes", "joke", "mood", "projects"];
  assert.deepEqual(await htmlFiles(draftDirectory), drafts.map((route) => `${route}/index.html`));
  for (const route of drafts) {
    await access(new URL(`${route}/index.html`, draftDirectory));
    await assert.rejects(access(new URL(`${route}/`, publicDirectory)), { code: "ENOENT" });
  }
  const workflow = await readFile(new URL("../.github/workflows/deploy.yml", import.meta.url), "utf8");
  assert.match(workflow, /uses: actions\/upload-pages-artifact@v3\s+with:\s+path: public/);
});

test("public assets shared with draft pages remain available", async () => {
  for (const file of [
    "audio/mood/girlfriends-untitled-3.mp3",
    "videos/mood/infohazard.mp4",
    "images/mood/emirshiro-collage-4.jpg",
    "resume/theo-steiger-resume.pdf",
    "CNAME",
  ]) {
    await access(new URL(file, publicDirectory));
  }
});
