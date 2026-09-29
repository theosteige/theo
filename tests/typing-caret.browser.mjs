// With a local server: PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/typing-caret.browser.mjs
import assert from "node:assert/strict";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  for (const width of [1200, 375, 320])
    for (const reducedMotion of ["no-preference", "reduce"]) {
      const page = await browser.newPage({
        viewport: { width, height: 900 },
        reducedMotion,
      });
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.addInitScript(() => {
        let n = 127;
        Math.random = () => {
          n = (n * 16807) % 2147483647;
          return n / 2147483647;
        };
      });
      await page.goto(
        `${process.env.TYPING_BASE_URL || "http://127.0.0.1:4321"}/typing/`,
      );
      await page.locator("#active-word").waitFor();
      await page.getByText("2min", { exact: true }).click();
      await page.locator("#typing-input").focus();
      const settle = () =>
        page.waitForFunction(
          () =>
            ![...document.querySelectorAll("#typing-caret,#word-track")].some(
              (e) => e.getAnimations().length,
            ),
        );
      const aligned = async () => {
        await settle();
        const g = await page.evaluate(() => {
          const caret = document
            .querySelector("#typing-caret")
            .getBoundingClientRect();
          const word = document.querySelector("#active-word");
          const pos = Array.from(
            document.querySelector("#typing-input").value,
          ).length;
          const letter = (
            word.children[pos] || word.lastElementChild
          ).getBoundingClientRect();
          const viewport = document
            .querySelector("#words")
            .getBoundingClientRect();
          return {
            y: caret.y,
            h: caret.height,
            rowY: letter.y,
            rowH: letter.height,
            top: viewport.top,
            bottom: viewport.bottom,
          };
        });
        assert.ok(
          Math.abs(g.y + g.h / 2 - g.rowY - g.rowH / 2) < 1,
          `cursor centered: ${JSON.stringify(g)}`,
        );
        assert.ok(
          g.y >= g.top - 0.5 && g.y + g.h <= g.bottom + 0.5,
          "cursor visible",
        );
        return g;
      };
      let checkedEdge = false;
      for (let i = 0; i < 40; i++) {
        await aligned();
        const word = await page.locator("#active-word").textContent();
        const handle = await page
          .locator("#active-word .typing-letter")
          .first()
          .elementHandle();
        const before = await page
          .locator("#word-lines")
          .evaluate((e) => e.getBoundingClientRect().top);
        for (const letter of word) {
          await page.keyboard.type(letter);
          const after = await page
            .locator("#word-lines")
            .evaluate((e) => e.getBoundingClientRect().top);
          assert.ok(
            Math.abs(before - after) < 0.5,
            "ordinary keystrokes cannot move text rows",
          );
        }
        assert.ok(
          await handle.evaluate((e) => e.isConnected),
          "letters are updated in place",
        );
        await aligned();
        const atEdge = await page
          .locator("#active-word")
          .evaluate(
            (e) =>
              e.nextElementSibling &&
              e.nextElementSibling.offsetTop > e.offsetTop,
          );
        if (atEdge && !checkedEdge) {
          const top = await page
            .locator("#active-word")
            .evaluate((e) => e.offsetTop);
          await page.keyboard.type("xxxxxxxxxxxxxxxxxxxx");
          assert.equal(
            await page.locator("#active-word").evaluate((e) => e.offsetTop),
            top,
            "extra characters cannot push the active word to another line",
          );
          await aligned();
          await page.keyboard.press("Control+Backspace");
          await page.keyboard.type(word);
          checkedEdge = true;
        }
        await page.keyboard.type(" ");
      }
      assert.ok(checkedEdge);
      await aligned();
      const motion = await page.evaluate(() => ({
        caret: getComputedStyle(document.querySelector("#typing-caret"))
          .transitionDuration,
        scroll: parseFloat(
          document.querySelector("#word-track").style.marginTop,
        ),
      }));
      assert.equal(
        motion.caret,
        reducedMotion === "reduce" ? "0s" : "0.085s, 0.085s",
      );
      assert.ok(motion.scroll < 0);
      await page.keyboard.press("Tab");
      await page.keyboard.press("Enter");
      assert.equal(
        await page.locator(".typing-page").getAttribute("data-state"),
        "ready",
      );
      await aligned();
      await page.keyboard.press("Escape");
      await page.locator("#word-source").selectOption("custom");
      await page
        .locator("#custom-text")
        .fill("abcdefghijklmnopqrstuvwxyzabcdefghij finish");
      await page.locator("#word-order").selectOption("ordered");
      await page.locator("#typing-input").focus();
      for (const letter of "abcdefghijklmnopqrstuvwxyzabcdefghij") {
        await page.keyboard.type(letter);
        await aligned();
      }
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      if (width === 1200) {
        await page.evaluate(() => {
          document.documentElement.style.fontSize = "200%";
          window.dispatchEvent(new Event("resize"));
        });
        await aligned();
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        );
      }
      assert.deepEqual(errors, []);
      console.log(
        `PASS: ${width}px / ${reducedMotion}: stable rows, persistent letters, extra-character guard, caret, wraps, long custom words, restart.`,
      );
      await page.close();
    }
} finally {
  await browser.close();
}
