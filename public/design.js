const grid = document.querySelector("#media");
const dialog = document.querySelector("dialog");
const viewer = document.querySelector("#viewer");

function makeLayout(count) {
  if (!count) return [];

  const tiles = [{ index: 0, depth: 0, x: 0, y: 0, width: 1, height: 1 }];
  for (let index = 1; index < count; index += 1) {
    const tile = tiles.reduce((shallowest, candidate) => {
      const candidateWins =
        candidate.depth < shallowest.depth ||
        (candidate.depth === shallowest.depth &&
          candidate.index < shallowest.index);
      return candidateWins ? candidate : shallowest;
    });
    const next = {
      index,
      depth: tile.depth + 1,
      x: tile.x,
      y: tile.y,
      width: tile.width,
      height: tile.height,
    };

    if (tile.depth % 2 === 0) {
      tile.width /= 2;
      next.x += tile.width;
      next.width = tile.width;
    } else {
      tile.height /= 2;
      next.y += tile.height;
      next.height = tile.height;
    }

    tile.depth += 1;
    tiles.push(next);
  }

  return tiles;
}

function updateLayout() {
  const items = [...grid.children];
  for (const tile of makeLayout(items.length)) {
    const { style } = items[tile.index];
    style.setProperty("--x", `${tile.x * 100}%`);
    style.setProperty("--y", `${tile.y * 100}%`);
    style.setProperty("--width", `${tile.width * 100}%`);
    style.setProperty("--height", `${tile.height * 100}%`);
  }
}

function openViewer(item) {
  const { kind, src } = item.dataset;
  const media = document.createElement(kind === "file" ? "iframe" : kind);

  if (kind === "image") {
    media.alt = item.querySelector("img")?.alt || "";
  } else if (kind === "file") {
    media.title = "File viewer";
  } else {
    media.controls = true;
    media.autoplay = true;
    if (kind === "video") {
      media.playsInline = true;
      media.poster = item.querySelector("img")?.src || "";
    }
    if (kind === "audio") media.loop = item.hasAttribute("data-loop");
  }

  media.src = src;
  viewer.replaceChildren(media);
  dialog.showModal();
}

updateLayout();
new MutationObserver(updateLayout).observe(grid, { childList: true });

grid.addEventListener("click", (event) => {
  const item = event.target.closest("button[data-kind]");
  if (!item) return;

  if (event.target.closest("audio")) event.preventDefault();
  const preview = item.querySelector("audio");
  if (preview) {
    preview.pause();
    preview.currentTime = 0;
  }

  openViewer(item);
});

document
  .querySelector("#close")
  .addEventListener("click", () => dialog.close());
dialog.addEventListener("close", () => viewer.replaceChildren());
