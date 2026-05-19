import { defineConfig } from "astro/config";

const isGitHubPagesBuild = process.env.GITHUB_PAGES === "true";
const usesCustomDomain = process.env.CUSTOM_DOMAIN === "true";
const githubPagesBase = process.env.GITHUB_PAGES_BASE ?? "/theo";
const base = isGitHubPagesBuild && !usesCustomDomain ? githubPagesBase : "/";

const withBase = (path) => {
  if (base === "/") {
    return path;
  }

  return `${base.replace(/\/$/, "")}${path}`;
};

const prefixMarkdownImagePaths = () => {
  return (tree) => {
    const visit = (node) => {
      if (
        node.type === "element" &&
        node.tagName === "img" &&
        typeof node.properties?.src === "string" &&
        node.properties.src.startsWith("/") &&
        !node.properties.src.startsWith("//")
      ) {
        node.properties.src = withBase(node.properties.src);
      }

      if (Array.isArray(node.children)) {
        node.children.forEach(visit);
      }
    };

    visit(tree);
  };
};

export default defineConfig({
  site: "https://theosteige.github.io",
  base,
  trailingSlash: "always",
  markdown: {
    rehypePlugins: [prefixMarkdownImagePaths]
  }
});
