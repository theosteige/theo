(() => {
  const browser = document.querySelector(".podcast-browser");
  if (!browser) return;

  const pane = browser.querySelector(".podcast-reading-pane");
  const placeholder = pane.querySelector("[data-podcast-placeholder]");
  const selected = pane.querySelector("[data-podcast-selected]");
  const content = pane.querySelector("[data-podcast-content]");
  pane.tabIndex = -1;
  const episodes = [...browser.querySelectorAll(".podcast-index > li")].map(
    (item) => {
      const link = item.querySelector("h3 a");
      const notes = item.querySelector(".podcast-source-notes");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "podcast-selector";
      button.id = `${item.id}-select`;
      button.textContent = link.textContent.replace(/\s+/g, " ").trim();
      button.setAttribute("aria-expanded", "false");
      button.setAttribute("aria-controls", pane.id);
      const episode = { button, notes };
      link.replaceWith(button);
      notes.hidden = true;
      return episode;
    },
  );

  let current = null;

  function clear() {
    current?.button.setAttribute("aria-expanded", "false");
    current = null;
    selected.hidden = true;
    placeholder.hidden = false;
    content.replaceChildren();
    pane.removeAttribute("aria-labelledby");
  }

  for (const episode of episodes) {
    episode.button.addEventListener("click", () => {
      if (current === episode) {
        clear();
        return;
      }

      clear();
      current = episode;
      episode.button.setAttribute("aria-expanded", "true");
      const paragraphs = [...episode.notes.children].map((node) =>
        node.cloneNode(true),
      );
      if (["", "..."].includes(episode.notes.textContent.trim())) {
        const pending = document.createElement("p");
        pending.textContent = "Thoughts coming soon.";
        content.replaceChildren(pending);
      } else {
        content.replaceChildren(...paragraphs);
      }
      pane.setAttribute("aria-labelledby", episode.button.id);
      placeholder.hidden = true;
      selected.hidden = false;

      if (window.matchMedia("(max-width: 600px)").matches) {
        pane.focus({ preventScroll: true });
        pane.scrollIntoView({ block: "start" });
      }
    });
  }

  pane.hidden = false;
  browser.dataset.enhanced = "";
})();
