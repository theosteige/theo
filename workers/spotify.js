const TOKEN_URL = "https://accounts.spotify.com/api/token";
const PLAYBACK_URL = "https://api.spotify.com/v1/me/player/currently-playing?additional_types=track%2Cepisode";
const ACCESS_TOKEN_EXPIRY_BUFFER_MS = 30_000;
const PLAYBACK_CACHE_MS = 9_000;

class SpotifyRequestError extends Error {
  constructor(message, status = 502, retryAfter = null) {
    super(message);
    this.name = "SpotifyRequestError";
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

function allowedOrigin(request, env) {
  const origin = request.headers.get("Origin");
  if (!origin) return null;
  const allowed = (env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return allowed.includes(origin) ? origin : false;
}

function responseHeaders(origin, cacheControl = "no-store") {
  const headers = {
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Expose-Headers": "Retry-After",
    "Cache-Control": cacheControl,
    "Content-Type": "application/json; charset=utf-8",
    "Vary": "Origin",
    "X-Content-Type-Options": "nosniff"
  };
  if (origin) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function json(body, status, origin, cacheControl, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...responseHeaders(origin, cacheControl), ...extraHeaders }
  });
}

function configured(env) {
  return Boolean(
    env.SPOTIFY_CLIENT_ID &&
    env.SPOTIFY_CLIENT_SECRET &&
    env.SPOTIFY_REFRESH_TOKEN
  );
}

function artwork(item) {
  const images = item.type === "track"
    ? item.album?.images
    : item.images?.length
      ? item.images
      : item.show?.images;
  return images?.find((image) => image?.url)?.url ?? null;
}

function creator(item) {
  if (item.type === "track") {
    return item.artists?.map((artist) => artist.name).filter(Boolean).join(", ") || "Unknown artist";
  }
  return item.show?.name || "Unknown podcast";
}

export function normalizePlayback(playback, fetchedAt = new Date().toISOString()) {
  if (playback?.device?.is_private_session) {
    return { status: "private", fetchedAt };
  }

  const item = playback?.item;
  if (!item || (item.type !== "track" && item.type !== "episode")) {
    return { status: "idle", fetchedAt };
  }

  const durationMs = Number.isFinite(item.duration_ms) ? Math.max(0, item.duration_ms) : null;
  const progressMs = Number.isFinite(playback.progress_ms)
    ? Math.max(0, durationMs === null ? playback.progress_ms : Math.min(playback.progress_ms, durationMs))
    : null;

  return {
    status: playback.is_playing ? "playing" : "paused",
    type: item.type,
    title: item.name || (item.type === "track" ? "Untitled track" : "Untitled episode"),
    creator: creator(item),
    imageUrl: artwork(item),
    spotifyUrl: item.external_urls?.spotify ?? null,
    progressMs,
    durationMs,
    fetchedAt
  };
}

export function createSpotifyClient({ fetchImpl = fetch, now = Date.now } = {}) {
  let accessToken = null;
  let accessTokenExpiresAt = 0;
  let activeRefreshToken = null;
  let refreshInFlight = null;

  async function refreshAccessToken(env, force = false) {
    if (!force && accessToken && now() < accessTokenExpiresAt - ACCESS_TOKEN_EXPIRY_BUFFER_MS) {
      return accessToken;
    }
    if (!force && refreshInFlight) return refreshInFlight;

    refreshInFlight = (async () => {
      const refreshToken = activeRefreshToken ?? env.SPOTIFY_REFRESH_TOKEN;
      const credentials = btoa(`${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`);
      const response = await fetchImpl(TOKEN_URL, {
        method: "POST",
        headers: {
          "Authorization": `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken
        })
      });

      if (!response.ok) {
        throw new SpotifyRequestError("Spotify authorization needs attention.", 502);
      }

      const token = await response.json();
      if (!token.access_token || !Number.isFinite(token.expires_in)) {
        throw new SpotifyRequestError("Spotify returned an invalid authorization response.", 502);
      }

      accessToken = token.access_token;
      accessTokenExpiresAt = now() + token.expires_in * 1000;
      if (token.refresh_token) activeRefreshToken = token.refresh_token;
      return accessToken;
    })();

    try {
      return await refreshInFlight;
    } finally {
      refreshInFlight = null;
    }
  }

  async function requestPlayback(env, retry = true) {
    const token = await refreshAccessToken(env);
    const response = await fetchImpl(PLAYBACK_URL, {
      headers: {
        "Accept": "application/json",
        "Authorization": `Bearer ${token}`
      }
    });

    if (response.status === 204) return null;
    if (response.status === 401 && retry) {
      accessToken = null;
      accessTokenExpiresAt = 0;
      await refreshAccessToken(env, true);
      return requestPlayback(env, false);
    }
    if (response.status === 429) {
      throw new SpotifyRequestError(
        "Spotify is temporarily limiting playback updates.",
        503,
        response.headers.get("Retry-After")
      );
    }
    if (!response.ok) {
      throw new SpotifyRequestError("Spotify playback is temporarily unavailable.", 502);
    }

    return response.json();
  }

  return { requestPlayback };
}

export function createHandler(options = {}) {
  const now = options.now ?? Date.now;
  const nowDate = options.nowDate ?? (() => new Date());
  const spotify = createSpotifyClient({ ...options, now });
  let cachedPlayback = null;
  let cacheExpiresAt = 0;
  let playbackInFlight = null;

  async function currentPlayback(env) {
    if (cachedPlayback && now() < cacheExpiresAt) return cachedPlayback;
    if (playbackInFlight) return playbackInFlight;

    playbackInFlight = (async () => {
      const playback = await spotify.requestPlayback(env);
      const fetchedAt = nowDate().toISOString();
      const body = playback ? normalizePlayback(playback, fetchedAt) : { status: "idle", fetchedAt };
      cachedPlayback = body;
      cacheExpiresAt = now() + PLAYBACK_CACHE_MS;
      return body;
    })();

    try {
      return await playbackInFlight;
    } finally {
      playbackInFlight = null;
    }
  }

  return async (request, env) => {
    const origin = allowedOrigin(request, env);
    if (origin === false) {
      return json({ error: "Origin not allowed." }, 403, null, "no-store");
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: responseHeaders(origin) });
    }

    const path = new URL(request.url).pathname.replace(/\/$/, "") || "/";
    if (path !== "/currently-playing") {
      return json({ error: "Not found." }, 404, origin, "no-store");
    }
    if (request.method !== "GET") {
      return json({ error: "Method not allowed." }, 405, origin, "no-store");
    }
    if (!configured(env)) {
      return json({ error: "Spotify playback is not configured." }, 503, origin, "no-store");
    }

    try {
      const body = await currentPlayback(env);
      return json(
        body,
        200,
        origin,
        "public, max-age=5, s-maxage=9, stale-while-revalidate=5"
      );
    } catch (error) {
      const known = error instanceof SpotifyRequestError;
      if (!known) console.error(error);
      const retryAfter = known ? error.retryAfter : null;
      return json(
        { error: known ? error.message : "Spotify playback is temporarily unavailable." },
        known ? error.status : 502,
        origin,
        "no-store",
        retryAfter ? { "Retry-After": retryAfter } : {}
      );
    }
  };
}

const handle = createHandler();

export default {
  fetch(request, env) {
    return handle(request, env);
  }
};
