import { defineConfig } from "astro/config";

const isGitHubPagesBuild = process.env.GITHUB_PAGES === "true";
const usesCustomDomain = process.env.CUSTOM_DOMAIN === "true";
const githubPagesBase = process.env.GITHUB_PAGES_BASE ?? "/theo";

export default defineConfig({
  site: "https://theosteige.github.io",
  base: isGitHubPagesBuild && !usesCustomDomain ? githubPagesBase : "/",
  trailingSlash: "always"
});
