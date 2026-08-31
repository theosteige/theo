import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const publicDir = new URL("../public/", import.meta.url);
const requiredLinks = [
  `<link rel="icon" type="image/svg+xml" sizes="any" href="/favicon-blue-t.svg">`,
  `<link rel="mask-icon" href="/safari-pinned-tab.svg" color="#0645ad">`,
  `<link rel="apple-touch-icon" sizes="512x512" href="/favicon-512.png?v=20260831">`,
];

async function findHtmlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const location = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directory);
      return entry.isDirectory()
        ? findHtmlFiles(location)
        : location.pathname.endsWith(".html")
          ? [location]
          : [];
    }),
  );

  return files.flat();
}

test("every page declares one cache-independent blue-T favicon", async () => {
  const htmlFiles = await findHtmlFiles(publicDir);
  assert.ok(htmlFiles.length > 0, "expected at least one public HTML page");

  for (const file of htmlFiles) {
    const html = await readFile(file, "utf8");
    const relativePath = path.relative(publicDir.pathname, file.pathname);

    for (const link of requiredLinks) {
      assert.ok(html.includes(link), `${relativePath} is missing ${link}`);
    }

    assert.equal(
      html.match(/<link rel="icon"/g)?.length,
      1,
      `${relativePath} must expose one unambiguous rel=icon candidate`,
    );
  }
});

test("favicon assets exist and the source artwork is the blue underlined T", async () => {
  for (const filename of [
    "favicon-blue-t.svg",
    "safari-pinned-tab.svg",
    "favicon-32.png",
    "favicon-512.png",
    "favicon.ico",
  ]) {
    const asset = new URL(filename, publicDir);
    assert.ok((await stat(asset)).size > 0, `${filename} must not be empty`);
  }

  const svg = await readFile(new URL("favicon-blue-t.svg", publicDir), "utf8");
  assert.match(svg, /Blue underlined letter T/i);
  assert.match(svg, /#0645ad/i);
});
