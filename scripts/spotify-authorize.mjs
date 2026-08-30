#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const HOST = "127.0.0.1";
const PORT = 8787;
const REDIRECT_URI = `http://${HOST}:${PORT}/callback`;
const SCOPES = "user-read-currently-playing";

async function ask(prompt) {
  const input = createInterface({ input: stdin, output: stdout });
  try {
    return (await input.question(prompt)).trim();
  } finally {
    input.close();
  }
}

async function askHidden(prompt) {
  if (!stdin.isTTY || typeof stdin.setRawMode !== "function") return ask(prompt);
  stdout.write(prompt);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");

  return new Promise((resolve, reject) => {
    let value = "";
    const finish = () => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\n");
      resolve(value.trim());
    };
    const onData = (chunk) => {
      for (const character of chunk) {
        if (character === "\u0003") {
          stdin.off("data", onData);
          stdin.setRawMode(false);
          stdin.pause();
          stdout.write("\n");
          reject(new Error("Setup cancelled."));
          return;
        }
        if (character === "\r" || character === "\n") {
          finish();
          return;
        }
        if (character === "\u007f" || character === "\b") {
          if (value) {
            value = value.slice(0, -1);
            stdout.write("\b \b");
          }
          continue;
        }
        value += character;
        stdout.write("•");
      }
    };
    stdin.on("data", onData);
  });
}

function openBrowser(url) {
  const command = process.platform === "darwin"
    ? ["open", [url]]
    : process.platform === "win32"
      ? ["cmd", ["/c", "start", "", url]]
      : ["xdg-open", [url]];
  const child = spawn(command[0], command[1], { detached: true, stdio: "ignore" });
  child.on("error", () => {});
  child.unref();
}

function browserMessage(response, title, message, status = 200) {
  response.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(`<!doctype html><html lang="en"><meta charset="utf-8"><title>${title}</title><body><h1>${title}</h1><p>${message}</p></body></html>`);
}

function putSecret(name, value) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "npx",
      ["wrangler", "secret", "put", name, "--config", "wrangler.spotify.jsonc"],
      { stdio: ["pipe", "inherit", "inherit"] }
    );
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Cloudflare rejected ${name}.`));
    });
    child.stdin.end(`${value}\n`);
  });
}

async function main() {
  stdout.write(`Spotify authorization helper\n\nBefore continuing, add this exact redirect URI to your Spotify app:\n${REDIRECT_URI}\n\n`);
  const clientId = await ask("Spotify client ID: ");
  const clientSecret = await askHidden("Spotify client secret: ");
  if (!clientId || !clientSecret) throw new Error("Both the client ID and client secret are required.");

  const state = randomBytes(24).toString("hex");
  const authorization = new URL("https://accounts.spotify.com/authorize");
  authorization.search = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    state,
    scope: SCOPES,
    show_dialog: "true"
  }).toString();

  const refreshToken = await new Promise((resolve, reject) => {
    const server = createServer(async (request, response) => {
      const url = new URL(request.url, REDIRECT_URI);
      if (url.pathname !== "/callback") {
        browserMessage(response, "Not found", "This authorization helper only accepts Spotify's callback.", 404);
        return;
      }

      const error = url.searchParams.get("error");
      const returnedState = url.searchParams.get("state");
      const code = url.searchParams.get("code");
      if (error || returnedState !== state || !code) {
        browserMessage(response, "Spotify was not connected", "Return to the terminal and try again.", 400);
        server.close();
        reject(new Error(error ? `Spotify returned: ${error}` : "The OAuth state or authorization code was invalid."));
        return;
      }

      try {
        const tokenResponse = await fetch("https://accounts.spotify.com/api/token", {
          method: "POST",
          headers: {
            "Authorization": `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
            "Content-Type": "application/x-www-form-urlencoded"
          },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            code,
            redirect_uri: REDIRECT_URI
          })
        });
        const token = await tokenResponse.json();
        if (!tokenResponse.ok || !token.refresh_token) {
          throw new Error(token.error_description || token.error || "Spotify did not issue a refresh token.");
        }
        browserMessage(response, "Spotify connected", "You can close this tab and return to the terminal.");
        server.close();
        resolve(token.refresh_token);
      } catch (tokenError) {
        browserMessage(response, "Spotify was not connected", "The token exchange failed. Return to the terminal for details.", 500);
        server.close();
        reject(tokenError);
      }
    });

    server.on("error", reject);
    server.listen(PORT, HOST, () => {
      stdout.write(`\nOpening Spotify authorization:\n${authorization}\n\n`);
      openBrowser(authorization.toString());
    });
  });

  stdout.write("\nUploading the Spotify credentials directly to Cloudflare...\n");
  await putSecret("SPOTIFY_CLIENT_ID", clientId);
  await putSecret("SPOTIFY_CLIENT_SECRET", clientSecret);
  await putSecret("SPOTIFY_REFRESH_TOKEN", refreshToken);
  stdout.write("\nSpotify Worker secrets configured. No credentials were written to disk.\n");
}

main().catch((error) => {
  console.error(`\n${error.message}`);
  process.exitCode = 1;
});
