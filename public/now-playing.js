(() => {
  const header = document.querySelector("header");
  if (!header) return;

  const section = document.querySelector("[data-now-playing]");
  const apiBase = (document.body.dataset.spotifyApi || "https://spotify-api.theosteiger.com").replace(/\/$/, "");
  const contacts = header.querySelector(".contact-list");
  if (!contacts) return;
  const miniItem = document.createElement("li");
  miniItem.className = "header-listening-item";
  miniItem.hidden = true;
  const mini = document.createElement("a");
  mini.className = "header-listening";
  mini.target = "_blank";
  mini.rel = "noopener noreferrer";
  mini.innerHTML = `
    <img class="header-listening-artwork" alt="" width="20" height="20">
    <span>Spotify</span>
  `;
  miniItem.append(mini);
  contacts.prepend(miniItem);

  const miniArtwork = mini.querySelector(".header-listening-artwork");
  const card = section?.querySelector("[data-card]");
  const message = section?.querySelector("[data-message]");
  const announcement = section?.querySelector("[data-announcement]");
  const artwork = section?.querySelector("[data-artwork]");
  const state = section?.querySelector("[data-state]");
  const title = section?.querySelector("[data-title]");
  const creator = section?.querySelector("[data-creator]");
  const progressWrap = section?.querySelector("[data-progress-wrap]");
  const progress = section?.querySelector("[data-progress]");
  const elapsed = section?.querySelector("[data-elapsed]");
  const duration = section?.querySelector("[data-duration]");
  const ACTIVE_POLL_MS = 10_000;
  const QUIET_POLL_MS = 30_000;
  let current = null;
  let progressTimer = null;
  let refreshTimer = null;
  let requestController = null;
  let refreshing = false;
  let lastAnnouncement = "";

  miniArtwork.onerror = () => { miniArtwork.hidden = true; };
  if (artwork && card) {
    artwork.onerror = () => {
      artwork.hidden = true;
      artwork.removeAttribute("src");
      card.classList.add("without-artwork");
    };
  }

  function formatTime(milliseconds) {
    const seconds = Math.max(0, Math.floor(milliseconds / 1000));
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
  }

  function hidePlayback(text) {
    current = null;
    miniItem.hidden = true;
    if (section) {
      card.hidden = true;
      message.hidden = false;
      message.textContent = text;
      delete section.dataset.playbackState;
      delete section.dataset.contentType;
    }
    if (progressTimer) window.clearInterval(progressTimer);
    progressTimer = null;
  }

  function announce(text) {
    if (!announcement || text === lastAnnouncement) return;
    lastAnnouncement = text;
    announcement.textContent = text;
  }

  function updateProgress() {
    if (!section || !current || current.progressMs === null || current.durationMs === null) return;
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

  function showPlayback(playback) {
    current = playback;
    const playing = playback.status === "playing";
    const action = `${playing ? "Currently playing" : "Spotify is paused on"} ${playback.title} by ${playback.creator}. Open in Spotify in a new tab.`;
    mini.href = playback.spotifyUrl;
    mini.setAttribute("aria-label", action);
    mini.title = action;
    miniItem.hidden = false;
    if (playback.imageUrl) {
      miniArtwork.src = playback.imageUrl;
      miniArtwork.hidden = false;
    } else {
      miniArtwork.removeAttribute("src");
      miniArtwork.hidden = true;
    }

    if (!section) return;
    message.hidden = true;
    card.hidden = false;
    card.href = playback.spotifyUrl;
    card.setAttribute("aria-label", `Open ${playback.title} by ${playback.creator} on Spotify in a new tab`);
    state.textContent = playing ? "Playing" : "Paused";
    section.dataset.playbackState = playback.status;
    section.dataset.contentType = playback.type;
    title.textContent = playback.title;
    title.title = playback.title;
    creator.textContent = playback.creator;
    creator.title = playback.creator;
    announce(`${playing ? "Now playing" : "Paused"}: ${playback.title} by ${playback.creator}.`);

    if (playback.imageUrl) {
      card.classList.remove("without-artwork");
      artwork.src = playback.imageUrl;
      artwork.hidden = false;
    } else {
      artwork.hidden = true;
      artwork.removeAttribute("src");
      card.classList.add("without-artwork");
    }

    const hasProgress = playback.progressMs !== null && playback.durationMs !== null;
    progressWrap.hidden = !hasProgress;
    if (progressTimer) window.clearInterval(progressTimer);
    progressTimer = null;
    if (hasProgress) {
      updateProgress();
      if (playing) progressTimer = window.setInterval(updateProgress, 1000);
    }
  }

  function schedule(delay) {
    if (refreshTimer) window.clearTimeout(refreshTimer);
    refreshTimer = document.visibilityState === "visible"
      ? window.setTimeout(refresh, delay)
      : null;
  }

  async function refresh() {
    if (refreshing || document.visibilityState !== "visible") return;
    refreshing = true;
    let nextPoll = QUIET_POLL_MS;
    let timeout = null;
    let controller = null;
    try {
      controller = new AbortController();
      requestController = controller;
      timeout = window.setTimeout(() => controller.abort(), 8000);
      const response = await fetch(`${apiBase}/currently-playing`, {
        headers: { "Accept": "application/json" },
        signal: controller.signal
      });
      const playback = await response.json();
      if (!response.ok) {
        const retryAfter = Number(response.headers.get("Retry-After"));
        if (Number.isFinite(retryAfter)) nextPoll = Math.max(QUIET_POLL_MS, retryAfter * 1000);
        throw new Error(playback.error || "Playback unavailable");
      }

      if (playback.status === "private") {
        hidePlayback("A private Spotify session is active.");
      } else if (playback.status === "idle") {
        hidePlayback("I am not listening to anything on Spotify right now.");
      } else if (!playback.spotifyUrl) {
        hidePlayback("Spotify status is temporarily unavailable.");
      } else {
        showPlayback(playback);
        nextPoll = playback.status === "playing" ? ACTIVE_POLL_MS : QUIET_POLL_MS;
      }
    } catch {
      if (document.visibilityState === "visible") hidePlayback("Spotify status is temporarily unavailable.");
    } finally {
      if (timeout) window.clearTimeout(timeout);
      if (requestController === controller) requestController = null;
      refreshing = false;
      schedule(nextPoll);
    }
  }

  refresh();
  document.addEventListener("visibilitychange", () => {
    if (refreshTimer) window.clearTimeout(refreshTimer);
    refreshTimer = null;
    if (document.visibilityState === "visible") refresh();
    else {
      if (requestController) requestController.abort();
      if (progressTimer) window.clearInterval(progressTimer);
      progressTimer = null;
    }
  });
})();
