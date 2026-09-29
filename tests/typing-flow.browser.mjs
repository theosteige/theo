import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const root = new URL("../", import.meta.url);
const source = await readFile(new URL("workers/scores.js", root), "utf8");
const { createHandler } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
);
const db = new DatabaseSync(":memory:");
for (const name of (await readdir(new URL("migrations/", root))).sort())
  db.exec(await readFile(new URL(`migrations/${name}`, root), "utf8"));
const env = {
  WRITE_KEY: "browser-test-key",
  ALLOWED_ORIGINS: "http://127.0.0.1:4321",
  DB: {
    prepare(sql) {
      return {
        args: [],
        bind(...args) {
          this.args = args;
          return this;
        },
        async all() {
          return { results: db.prepare(sql).all(...this.args) };
        },
      };
    },
    async batch(statements) {
      const out = [];
      for (const s of statements) out.push(await s.all());
      return out;
    },
  },
};
const handle = createHandler();
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 950 },
  });
  const errors = [],
    payloads = [];
  let saveGate = null;
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/now-playing.js", (route) =>
    route.fulfill({ body: "", contentType: "text/javascript" }),
  );
  await page.route("**/test-api/typing", async (route) => {
    const req = route.request();
    if (req.method() === "POST") {
      payloads.push(JSON.parse(req.postData()));
      if (saveGate) await saveGate;
    }
    const response = await handle(
      new Request("https://api.theosteiger.com/typing", {
        method: req.method(),
        headers: req.headers(),
        ...(req.postData() ? { body: req.postData() } : {}),
      }),
      env,
    );
    await route.fulfill({
      status: response.status,
      headers: Object.fromEntries(response.headers),
      body: await response.text(),
    });
  });
  await page.route("**/typing/", async (route) =>
    route.fulfill({
      contentType: "text/html",
      body: (
        await readFile(new URL("public/typing/index.html", root), "utf8")
      ).replace(/\bdata-score-api(?=[\s>])/, 'data-score-api="/test-api"'),
    }),
  );
  await page.clock.install();
  await page.goto("http://127.0.0.1:4321/typing/");
  await page.locator("#active-word").waitFor();
  await page.screenshot({ path: "/tmp/typing-v2-desktop.png", fullPage: true });
  await page.clock.runFor(20000);
  assert.equal(
    await page.locator(".typing-page").getAttribute("data-state"),
    "ready",
  );
  await page.getByText("Journal", { exact: true }).click();
  await page.locator("#journal-key").fill("browser-test-key");
  await page.getByText("Words & settings", { exact: true }).click();
  await page.locator("#word-source").selectOption("custom");
  assert.equal(await page.locator("#typing-input").isDisabled(), true);
  await page.locator("#custom-text").fill("alpha beta gamma delta");
  await page.locator("#word-order").selectOption("ordered");
  await page.locator("#use-text-length").click();
  assert.equal(await page.locator("#progress-unit").textContent(), " words");
  assert.equal(await page.locator("#active-word").textContent(), "alpha");
  await page.keyboard.type("alpha ");
  await page.keyboard.press("Backspace");
  assert.equal(await page.locator("#typing-input").inputValue(), "");
  assert.equal(await page.locator("#active-word").textContent(), "beta");
  await page.keyboard.type("wrong ");
  await page.keyboard.press("Backspace");
  assert.equal(await page.locator("#typing-input").inputValue(), "wrong");
  await page.keyboard.press("Control+Backspace");
  assert.equal(await page.locator("#typing-input").inputValue(), "");
  await page.keyboard.type("beta gamma ");
  await page.clock.runFor(2000);
  await page.keyboard.type("delta");
  await page.locator("#save-status").filter({ hasText: "Saved." }).waitFor();
  assert.equal(payloads.length, 1);
  assert.equal(payloads[0].mode, "words");
  assert.equal(payloads[0].wordCount, 4);
  assert.equal(payloads[0].source, "custom");
  assert.equal(payloads[0].customText, undefined);
  assert.equal(payloads[0].rawCharacters, payloads[0].correctCharacters);
  assert.ok(payloads[0].totalKeystrokes > payloads[0].rawCharacters);
  assert.equal(await page.locator("#history-rows tr").count(), 1);
  assert.equal(await page.locator("#practice-missed").isVisible(), true);
  await page.screenshot({ path: "/tmp/typing-v2-results.png", fullPage: true });
  await page.locator("#repeat-test").click();
  assert.equal(await page.locator("#active-word").textContent(), "alpha");
  await page.keyboard.type("a");
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement.id), "restart");
  await page.keyboard.press("Enter");
  assert.equal(
    await page.locator(".typing-page").getAttribute("data-state"),
    "ready",
  );
  assert.equal(payloads.length, 1);
  await page.keyboard.press("Escape");
  assert.equal(
    await page.locator("#typing-preferences").getAttribute("open"),
    "",
  );
  await page.locator("#stop-on-error").selectOption("letter");
  await page.locator("#typing-input").focus();
  await page.keyboard.type("x");
  assert.equal(await page.locator("#typing-input").inputValue(), "");
  await page.keyboard.type("alpha ");
  assert.equal(await page.locator("#active-word").textContent(), "beta");
  await page.keyboard.press("Escape");
  await page.locator("#stop-on-error").selectOption("off");
  await page.locator("#custom-text").fill("café 世界!");
  await page.locator("#use-text-length").click();
  await page.keyboard.insertText("café ");
  await page.clock.runFor(1000);
  await page.keyboard.insertText("世界!");
  await page.locator("#save-status").filter({ hasText: "Saved." }).waitFor();
  assert.equal(payloads.length, 2);
  assert.notEqual(payloads[0].corpusId, payloads[1].corpusId);
  assert.equal(await page.locator("#result-accuracy").textContent(), "100%");
  await page.reload();
  await page.locator("#active-word").waitFor();
  assert.equal(await page.locator("#active-word").textContent(), "café");
  assert.equal(await page.locator("#journal-key").inputValue(), "");
  assert.ok(
    !JSON.stringify(await page.evaluate(() => ({ ...localStorage }))).includes(
      "browser-test-key",
    ),
  );
  await page.getByText("Words & settings", { exact: true }).click();
  await page.locator("#word-source").selectOption("english");
  await page.getByText("time", { exact: true }).click();
  await page.getByText("15s", { exact: true }).click();
  await page.locator("#typing-input").focus();
  await page.keyboard.type("abc");
  await page.getByText("Words & settings", { exact: true }).click();
  await page.clock.runFor(15001);
  await page
    .locator("#save-status")
    .filter({ hasText: "Enter the journal key" })
    .waitFor();
  assert.equal(payloads.length, 2);
  assert.equal(await page.locator("#result-duration").textContent(), "15.0s");
  await page.locator("#restart").click();
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByText("Words & settings", { exact: true }).click();
  await page.locator("#word-source").selectOption("custom");
  await page.screenshot({ path: "/tmp/typing-v2-mobile.png", fullPage: true });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.setViewportSize({ width: 320, height: 720 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  if (!(await page.locator("#journal-key").isVisible()))
    await page.getByText("Journal", { exact: true }).click();
  await page.locator("#journal-key").fill("browser-test-key");
  await page.locator("#use-text-length").click();
  let releaseSave;
  saveGate = new Promise((resolve) => {
    releaseSave = resolve;
  });
  await page.keyboard.insertText("café ");
  await page.clock.runFor(1000);
  await page.keyboard.insertText("世界!");
  await page.locator("#save-status").filter({ hasText: "Saving…" }).waitFor();
  await page.locator("#restart").click();
  releaseSave();
  saveGate = null;
  await page.waitForResponse(
    (response) =>
      response.url().endsWith("/test-api/typing") &&
      response.request().method() === "POST",
  );
  assert.equal(
    await page.locator(".typing-page").getAttribute("data-state"),
    "ready",
  );
  assert.equal(await page.locator("#save-status").textContent(), "");
  assert.deepEqual(errors, []);
  console.log(
    "PASS: timers, custom/Unicode/whole-text tests, modes, correction rules, raw WPM, repeat, shortcuts, settings persistence, corpus separation, real SQL saves, no-key flow, and mobile layout.",
  );
} finally {
  await browser.close();
  db.close();
}
