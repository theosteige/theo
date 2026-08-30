(() => {
  const section = document.querySelector("[data-now-playing]");
  if (!section) return;

  const expectedType = section.dataset.kind;
  const apiBase = (document.body.dataset.spotifyApi ?? "").replace(/\/$/, "");
  const card = section.querySelector("[data-card]");
  const message = section.querySelector("[data-message]");
  const artwork = section.querySelector("[data-artwork]");
  const state = section.querySelector("[data-state]");
  const title = section.querySelector("[data-title]");
  const creator = section.querySelector("[data-creator]");
  const updated = section.querySelector("[data-updated]");
  const progressWrap = section.querySelector("[data-progress-wrap]");
  const progress = section.querySelector("[data-progress]");
  const elapsed = section.querySelector("[data-elapsed]");
  const duration = section.querySelector("[data-duration]");
  const contentLabel = expectedType === "episode"
    ? "a podcast"
    : expectedType === "track"
      ? "music"
      : "anything on Spotify";
  let current = null;
  let progressTimer = null;

  function formatTime(milliseconds) {
    const seconds = Math.max(0, Math.floor(milliseconds / 1000));
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
  }

  function hideCard(text) {
    current = null;
    card.hidden = true;
    message.hidden = false;
    message.textContent = text;
    updated.textContent = "";
    if (progressTimer) window.clearInterval(progressTimer);
    progressTimer = null;
  }

  function updateProgress() {
    if (!current || current.progressMs === null || current.durationMs === null) return;
    const fetchedAt = Date.parse(current.fetchedAt);
    const liveOffset = current.status === "playing" && Number.isFinite(fetchedAt)
      ? Math.max(0, Date.now() - fetchedAt)
      : 0;
    const value = Math.min(current.durationMs, current.progressMs + liveOffset);
    progress.max = current.durationMs || 1;
    progress.value = value;
    elapsed.textContent = formatTime(value);
    duration.textContent = formatTime(current.durationMs);
  }

  function showCard(playback) {
    current = playback;
    message.hidden = true;
    card.hidden = false;
    card.href = playback.spotifyUrl || "https://open.spotify.com/";
    card.setAttribute("aria-label", `Open ${playback.title} on Spotify`);
    state.textContent = playback.status === "playing"
      ? playback.type === "episode" ? "Listening to a podcast" : "Listening to music"
      : "Paused";
    section.dataset.playbackState = playback.status;
    title.textContent = playback.title;
    creator.textContent = playback.creator;
    updated.textContent = playback.status === "playing" ? "Live" : "Playback paused";

    const hideArtwork = () => {
      artwork.hidden = true;
      artwork.removeAttribute("src");
      card.classList.add("without-artwork");
    };
    artwork.onerror = hideArtwork;
    if (playback.imageUrl) {
      card.classList.remove("without-artwork");
      artwork.src = playback.imageUrl;
      artwork.hidden = false;
    } else {
      hideArtwork();
    }

    const hasProgress = playback.progressMs !== null && playback.durationMs !== null;
    progressWrap.hidden = !hasProgress;
    if (progressTimer) window.clearInterval(progressTimer);
    progressTimer = null;
    if (hasProgress) {
      updateProgress();
      if (playback.status === "playing") progressTimer = window.setInterval(updateProgress, 1000);
    }
  }

  async function refresh() {
    if (!apiBase) {
      hideCard("Live Spotify status will appear here once the site is connected.");
      return;
    }

    try {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 8000);
      const response = await fetch(`${apiBase}/currently-playing`, {
        headers: { "Accept": "application/json" },
        signal: controller.signal
      });
      window.clearTimeout(timeout);
      const playback = await response.json();
      if (!response.ok) throw new Error(playback.error || "Playback unavailable");

      if (playback.status === "private") {
        hideCard("A private Spotify session is active.");
      } else if (
        playback.status === "idle" ||
        (expectedType !== "all" && playback.type !== expectedType)
      ) {
        hideCard(`I am not listening to ${contentLabel} right now.`);
      } else {
        showCard(playback);
      }
    } catch {
      hideCard("Spotify status is temporarily unavailable.");
    }
  }

  refresh();
  window.setInterval(() => {
    if (document.visibilityState === "visible") refresh();
  }, 30_000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refresh();
  });
})();
