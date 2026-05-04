import { defineConfig } from "astro/config";

const isGitHubPagesBuild = process.env.GITHUB_PAGES === "true";
const usesCustomDomain = process.env.CUSTOM_DOMAIN === "true";

export default defineConfig({
  site: "https://theosteige.github.io",
  base: isGitHubPagesBuild && !usesCustomDomain ? "/the-Steiger.com" : "/",
  trailingSlash: "always"
});
