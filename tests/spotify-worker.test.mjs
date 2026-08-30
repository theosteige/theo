import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../workers/spotify.js", import.meta.url), "utf8");
const worker = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

const env = {
  ALLOWED_ORIGINS: "https://theosteiger.com,http://127.0.0.1:4321",
  SPOTIFY_CLIENT_ID: "client-id",
  SPOTIFY_CLIENT_SECRET: "client-secret",
  SPOTIFY_REFRESH_TOKEN: "refresh-token"
};

test("normalizes a currently playing track to public-safe fields", () => {
  const result = worker.normalizePlayback({
    is_playing: true,
    progress_ms: 61_000,
    device: { name: "Private device name", is_private_session: false },
    item: {
      type: "track",
      name: "Song title",
      duration_ms: 180_000,
      artists: [{ name: "First artist" }, { name: "Second artist" }],
      album: { images: [{ url: "https://i.scdn.co/cover.jpg" }] },
      external_urls: { spotify: "https://open.spotify.com/track/example" }
    }
  }, "2026-08-30T12:00:00.000Z");

  assert.deepEqual(result, {
    status: "playing",
    type: "track",
    title: "Song title",
    creator: "First artist, Second artist",
    imageUrl: "https://i.scdn.co/cover.jpg",
    spotifyUrl: "https://open.spotify.com/track/example",
    progressMs: 61_000,
    durationMs: 180_000,
    fetchedAt: "2026-08-30T12:00:00.000Z"
  });
  assert.equal("device" in result, false);
});

test("normalizes a paused podcast episode", () => {
  const result = worker.normalizePlayback({
    is_playing: false,
    progress_ms: 600_000,
    device: { is_private_session: false },
    item: {
      type: "episode",
      name: "Episode title",
      duration_ms: 3_600_000,
      images: [{ url: "https://i.scdn.co/episode.jpg" }],
      show: { name: "Podcast title" },
      external_urls: { spotify: "https://open.spotify.com/episode/example" }
    }
  }, "2026-08-30T12:00:00.000Z");

  assert.equal(result.status, "paused");
  assert.equal(result.type, "episode");
  assert.equal(result.creator, "Podcast title");
});

test("hides private sessions", () => {
  const result = worker.normalizePlayback({
    is_playing: true,
    device: { is_private_session: true },
    item: { type: "track", name: "Hidden song" }
  }, "2026-08-30T12:00:00.000Z");

  assert.deepEqual(result, {
    status: "private",
    fetchedAt: "2026-08-30T12:00:00.000Z"
  });
});

test("refreshes the token and returns sanitized playback with CORS", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.includes("/api/token")) {
      return Response.json({ access_token: "access-token", expires_in: 3600 });
    }
    return Response.json({
      is_playing: true,
      progress_ms: 20_000,
      device: { is_private_session: false },
      item: {
        type: "track",
        name: "Worker song",
        duration_ms: 200_000,
        artists: [{ name: "Worker artist" }],
        album: { images: [] },
        external_urls: { spotify: "https://open.spotify.com/track/worker" }
      }
    });
  };
  const handler = worker.createHandler({
    fetchImpl,
    now: () => 1_000,
    nowDate: () => new Date("2026-08-30T12:00:00.000Z")
  });
  const response = await handler(new Request("https://worker.example/currently-playing", {
    headers: { Origin: "https://theosteiger.com" }
  }), env);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://theosteiger.com");
  assert.match(response.headers.get("Cache-Control"), /max-age=10/);
  assert.equal(body.title, "Worker song");
  assert.equal(calls.length, 2);
  assert.equal(calls[1].options.headers.Authorization, "Bearer access-token");
  assert.match(calls[1].url, /additional_types=track%2Cepisode/);
});

test("returns idle when Spotify has no active playback", async () => {
  const fetchImpl = async (url) => url.includes("/api/token")
    ? Response.json({ access_token: "access-token", expires_in: 3600 })
    : new Response(null, { status: 204 });
  const handler = worker.createHandler({
    fetchImpl,
    now: () => 1_000,
    nowDate: () => new Date("2026-08-30T12:00:00.000Z")
  });
  const response = await handler(new Request("https://worker.example/currently-playing"), env);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    status: "idle",
    fetchedAt: "2026-08-30T12:00:00.000Z"
  });
});

test("rejects unapproved browser origins before contacting Spotify", async () => {
  let called = false;
  const handler = worker.createHandler({
    fetchImpl: async () => {
      called = true;
      return new Response();
    }
  });
  const response = await handler(new Request("https://worker.example/currently-playing", {
    headers: { Origin: "https://malicious.example" }
  }), env);

  assert.equal(response.status, 403);
  assert.equal(called, false);
});
