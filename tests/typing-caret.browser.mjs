// Run with a local server on port 4321 and Playwright installed, or set
// PLAYWRIGHT_MODULE to its module path and TYPING_BASE_URL to another preview.
import assert from "node:assert/strict";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const browser = await chromium.launch({ channel: "chrome", headless: true });

try {
  for (const width of [1200, 375]) {
    for (const reducedMotion of ["no-preference", "reduce"]) {
      const page = await browser.newPage({
        viewport: { width, height: 900 },
        reducedMotion,
      });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(
        `${process.env.TYPING_BASE_URL || "http://127.0.0.1:4321"}/typing/`,
      );
      await page.locator("#active-word").waitFor();
      await page.getByText("2min", { exact: true }).click();
      await page.locator("#typing-input").focus();
      const settle = () =>
        page.waitForFunction(() =>
          ["typing-caret", "word-track"].every(
            (id) => !document.getElementById(id).getAnimations().length,
          ),
        );
      const geometry = () =>
        page.evaluate(() => {
          const caret = document
            .querySelector("#typing-caret")
            .getBoundingClientRect();
          const word = document
            .querySelector("#active-word")
            .getBoundingClientRect();
          const viewport = document
            .querySelector("#words")
            .getBoundingClientRect();
          return {
            x: caret.x,
            y: caret.y,
            height: caret.height,
            wordTop: word.top,
            wordBottom: word.bottom,
            viewTop: viewport.top,
            viewBottom: viewport.bottom,
          };
        });
      const aligned = async () => {
        await settle();
        const g = await geometry();
        assert.ok(
          Math.abs(g.y + g.height / 2 - (g.wordTop + g.wordBottom) / 2) < 1,
          `cursor stays centered on its word: ${JSON.stringify(g)}`,
        );
        assert.ok(
          g.y >= g.viewTop && g.y + g.height <= g.viewBottom,
          "cursor stays inside the visible text area",
        );
        return g;
      };
      const start = await aligned();
      const firstWord = await page.locator("#active-word").innerText();
      const caretNode = await page.locator("#typing-caret").elementHandle();
      await page.keyboard.type(firstWord);
      const end = await aligned();
      assert.ok(
        Math.abs(start.y - end.y) < 0.5,
        "finishing a word never drops the cursor",
      );
      assert.ok(end.x > start.x, "cursor advances to the end of the word");
      assert.ok(
        await caretNode.evaluate(
          (node) => node === document.querySelector("#typing-caret"),
        ),
        "one persistent cursor survives word updates",
      );
      await page.keyboard.type("x");
      await aligned();
      await page.keyboard.press("Backspace");
      await aligned();
      await page.keyboard.type(" ");
      const next = await aligned();
      assert.ok(
        Math.abs(start.y - next.y) < 0.5,
        "space between same-line words keeps cursor level",
      );
      await page.keyboard.press("Backspace");
      assert.equal(await page.locator("#typing-input").inputValue(), firstWord);
      await aligned();
      await page.keyboard.type(" ");
      // Move through several line wraps and scrolls; normal motion uses a short
      // transition, while reduced motion reaches the same positions immediately.
      for (let index = 0; index < 35; index++) {
        const word = await page.locator("#active-word").innerText();
        await page.keyboard.type(word + " ");
        await aligned();
      }
      const motion = await page.evaluate(() => ({
        caret: getComputedStyle(document.querySelector("#typing-caret"))
          .transitionDuration,
        track: getComputedStyle(document.querySelector("#word-track"))
          .transitionDuration,
        scroll: new DOMMatrix(
          getComputedStyle(document.querySelector("#word-track")).transform,
        ).m42,
      }));
      assert.equal(motion.caret, reducedMotion === "reduce" ? "0s" : "0.08s");
      assert.equal(
        motion.track,
        motion.caret,
        "text and cursor transitions stay synchronized",
      );
      assert.ok(motion.scroll < 0, "test exercised scrolling");
      await page.keyboard.press("Escape");
      await aligned();
      assert.equal(
        await page.locator(".typing-page").getAttribute("data-state"),
        "ready",
      );
      assert.deepEqual(errors, []);
      console.log(
        `PASS: ${width}px, ${reducedMotion}: word endings, spaces, corrections, wrapping, scrolling, restart.`,
      );
      await page.close();
    }
  }
} finally {
  await browser.close();
}
