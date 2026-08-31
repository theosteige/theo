import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../public/now-playing.js", import.meta.url), "utf8");
const profileUrl = "https://open.spotify.com/user/tmoneysteiger?si=07e15516b3f4432c";

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.attributes = new Map();
    this.className = "";
    this.classList = {
      add: (...names) => names.forEach((name) => this.classNames.add(name)),
      remove: (...names) => names.forEach((name) => this.classNames.delete(name)),
    };
    this.hidden = false;
    this.textContent = "";
  }

  get classNames() {
    return new Set(this.className.split(/\s+/).filter(Boolean));
  }

  append(...children) {
    this.children.push(...children);
  }

  prepend(...children) {
    this.children.unshift(...children);
  }

  querySelector(selector) {
    const className = selector.startsWith(".") ? selector.slice(1) : null;
    for (const child of this.children) {
      if (className && child.classNames.has(className)) return child;
      const nested = child.querySelector?.(selector);
      if (nested) return nested;
    }
    return null;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
    delete this[name];
  }

  set innerHTML(html) {
    this.children = [];
    const image = new FakeElement("img");
    image.className = html.match(/<img[^>]*class="([^"]+)"/)?.[1] ?? "";
    const label = new FakeElement("span");
    label.className = html.match(/<span[^>]*class="([^"]+)"/)?.[1] ?? "";
    label.textContent = html.match(/<span[^>]*>(.*?)<\/span>/s)?.[1].trim() ?? "";
    this.children = html.indexOf("<img") < html.indexOf("<span")
      ? [image, label]
      : [label, image];
  }
}

async function renderHeader(playback, { reject = false } = {}) {
  const contacts = new FakeElement("ul");
  const header = new FakeElement("header");
  header.querySelector = (selector) => selector === ".contact-list" ? contacts : null;
  const document = {
    body: { dataset: {} },
    visibilityState: "visible",
    createElement: (tagName) => new FakeElement(tagName),
    querySelector: (selector) => selector === "header" ? header : null,
    addEventListener() {},
  };
  const window = {
    clearInterval() {},
    clearTimeout() {},
    setInterval: () => 1,
    setTimeout: () => 1,
  };
  const fetch = reject
    ? async () => { throw new Error("offline"); }
    : async () => Response.json(playback);

  vm.runInNewContext(source, {
    AbortController,
    console,
    document,
    fetch,
    Response,
    window,
  });

  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  const item = contacts.children[0];
  return { item, link: item.children[0] };
}

test("inactive and unavailable states show the Spotify profile link", async (t) => {
  const cases = [
    ["idle", { status: "idle" }, {}],
    ["private", { status: "private" }, {}],
    ["unavailable", null, { reject: true }],
  ];

  for (const [name, playback, options] of cases) {
    await t.test(name, async () => {
      const { item, link } = await renderHeader(playback, options);
      assert.equal(item.hidden, false);
      assert.equal(link.href, profileUrl);
      assert.equal(link.querySelector(".header-listening-label")?.textContent, "Spotify");
      assert.equal(link.querySelector(".header-listening-artwork")?.hidden, true);
    });
  }
});

test("known playback links to the item with text, artwork, and details", async () => {
  const { item, link } = await renderHeader({
    status: "paused",
    type: "episode",
    title: "Episode title",
    creator: "Podcast title",
    imageUrl: "https://i.scdn.co/episode.jpg",
    spotifyUrl: "https://open.spotify.com/episode/example",
    progressMs: 600_000,
    durationMs: 3_600_000,
    fetchedAt: "2026-08-31T12:00:00.000Z",
  });

  const label = link.querySelector(".header-listening-label");
  const artwork = link.querySelector(".header-listening-artwork");
  assert.equal(item.hidden, false);
  assert.equal(link.href, "https://open.spotify.com/episode/example");
  assert.equal(label.textContent, "Listening to Spotify");
  assert.equal(artwork.src, "https://i.scdn.co/episode.jpg");
  assert.equal(artwork.hidden, false);
  assert.ok(link.children.indexOf(label) < link.children.indexOf(artwork));
  assert.equal(link.title, "Theo is listening to Episode title by Podcast title");
  assert.equal(
    link.getAttribute("aria-label"),
    "Listening to Spotify: Theo is listening to Episode title by Podcast title",
  );
});
