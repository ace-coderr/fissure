import { defineConfig, type Plugin } from "vite";
import { copyFileSync } from "node:fs";
import react from "@vitejs/plugin-react";

// Preload the two fonts the first screen needs, so the headline and body text do
// not reflow when the web fonts arrive (no layout shift from font swapping).
function preloadFonts(base: string): Plugin {
  return {
    name: "preload-fonts",
    enforce: "post",
    transformIndexHtml(html, ctx) {
      if (!ctx.bundle) return html; // dev server: nothing hashed yet
      const critical = /(archivo-latin-900-normal|jetbrains-mono-latin-400-normal)[^/]*\.woff2$/;
      const tags = Object.keys(ctx.bundle)
        .filter((f) => critical.test(f))
        .map((f) => ({
          tag: "link",
          attrs: { rel: "preload", as: "font", type: "font/woff2", href: `${base}${f}`, crossorigin: "" },
          injectTo: "head" as const,
        }));
      return { html, tags };
    },
  };
}

// The Netlify build serves from the root. The GitHub Pages build sets VITE_BASE=/fissure/.
const base = process.env.VITE_BASE ?? "/";

// Pages has no rewrite rules: a 404.html that is the app itself makes direct visits and
// refreshes of /replay and /mutants load the app, which then renders the route.
function spaFallback(): Plugin {
  let outDir = "dist";
  return {
    name: "spa-404",
    apply: "build",
    configResolved(c) {
      outDir = c.build.outDir;
    },
    closeBundle() {
      copyFileSync(`${outDir}/index.html`, `${outDir}/404.html`);
    },
  };
}

export default defineConfig({
  base,
  plugins: [react(), preloadFonts(base), spaFallback()],
  build: { target: "es2022", sourcemap: false },
});
