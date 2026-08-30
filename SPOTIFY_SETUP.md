# Spotify now-playing setup

The Music and Podcasts pages read a small, public-safe playback response from a dedicated Cloudflare Worker at `https://spotify-api.theosteiger.com`. Spotify credentials stay in Worker secrets and are never sent to the browser.

## 1. Create the Spotify app

1. Sign in to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
2. Create an app and select **Web API**.
3. Add this exact redirect URI:

   ```text
   http://127.0.0.1:8787/callback
   ```

4. Save the app and copy its client ID and client secret. Development-mode apps require the owner to have Spotify Premium.

## 2. Create or update the Worker

The Worker uses the custom domain declared in `wrangler.spotify.jsonc`. Deploy it before authorization because the helper uploads the resulting secrets to the existing Worker:

```sh
npx wrangler deploy --config wrangler.spotify.jsonc
```

Until its secrets are configured, `/currently-playing` intentionally returns `503`.

## 3. Authorize your Spotify account

From the repository root, run:

```sh
node scripts/spotify-authorize.mjs
```

Enter the client ID and client secret when prompted. The helper opens Spotify, asks only for permission to read currently playing content, exchanges the callback for a refresh token, and uploads all three values directly to Cloudflare's encrypted Worker secret store. It does not print the secret values or write them to disk.

## 4. Verify the Worker

```sh
curl https://spotify-api.theosteiger.com/currently-playing
```

The endpoint should return playback JSON rather than `Spotify playback is not configured`. The only production endpoint is:

```text
https://spotify-api.theosteiger.com/currently-playing
```

The `workers.dev` route is disabled in the final configuration so future deployments cannot accidentally expose a second production hostname.

## 5. Connect GitHub Pages

In the GitHub repository, open **Settings → Secrets and variables → Actions → Variables** and create:

```text
SPOTIFY_API_URL=https://spotify-api.theosteiger.com
```

Re-run the **Deploy** workflow, or push a new commit to `main`. The workflow injects this URL into both pages without exposing any Spotify credentials.

## Maintenance

- Spotify access tokens are refreshed automatically by the Worker.
- Spotify refresh tokens expire six months after authorization; refreshing an access token does not extend that deadline. Re-run the authorization helper when Spotify returns `invalid_grant` or the six-month date approaches; it replaces all three Worker secrets safely.
- The Worker hides private sessions and returns only the title, creator, artwork, Spotify link, playback progress, and content type.
- To test locally, create an ignored `.dev.vars` file containing the three Spotify values, then run `npx wrangler dev --config wrangler.spotify.jsonc`.
