const grid = document.querySelector(".book-grid");
const statusOrder = { "in-progress": 0, finished: 1, unfinished: 2 };
const books = [...grid.querySelectorAll(".book")];

books.sort((a, b) => {
  // Preserve the curated completion order within each status group.
  return (
    (statusOrder[a.dataset.status] ?? 3) -
    (statusOrder[b.dataset.status] ?? 3)
  );
});
grid.append(...books);

const cards = [...grid.querySelectorAll(".book-card")];
const hover = window.matchMedia("(hover: hover)");

function setOpen(card, open) {
  card.setAttribute("aria-expanded", String(open));
}

function closeOthers(current) {
  for (const card of cards) {
    if (card !== current) setOpen(card, false);
  }
}

for (const card of cards) {
  card.dataset.enhanced = "";

  card.addEventListener("pointerenter", (event) => {
    if (event.pointerType === "touch" || !hover.matches) return;
    closeOthers(card);
    setOpen(card, true);
  });

  card.addEventListener("pointerleave", (event) => {
    if (event.pointerType === "touch") return;
    if (!card.matches(":focus-visible")) setOpen(card, false);
  });

  card.addEventListener("focus", () => {
    if (!card.matches(":focus-visible")) return;
    closeOthers(card);
    setOpen(card, true);
  });

  card.addEventListener("blur", () => setOpen(card, false));

  card.addEventListener("click", () => {
    const open = card.getAttribute("aria-expanded") !== "true";
    closeOthers(card);
    setOpen(card, open);
  });

  card.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setOpen(card, false);
      event.preventDefault();
      return;
    }

    // Keep longer notes readable with the keyboard on smaller screens.
    const panel = card.querySelector(".book-overlay");
    if (
      card.getAttribute("aria-expanded") !== "true" ||
      panel.scrollHeight <= panel.clientHeight
    ) return;

    const distance = {
      ArrowDown: 40,
      ArrowUp: -40,
      PageDown: panel.clientHeight,
      PageUp: -panel.clientHeight,
      Home: -panel.scrollHeight,
      End: panel.scrollHeight,
    }[event.key];
    if (distance !== undefined) {
      panel.scrollTop += distance;
      event.preventDefault();
    }
  });
}

document.addEventListener("pointerdown", (event) => {
  if (!event.target.closest(".book-card")) closeOthers(null);
});
