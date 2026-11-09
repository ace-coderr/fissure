import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// Preload the two fonts the first screen needs, so the headline and body text do
// not reflow when the web fonts arrive (no layout shift from font swapping).
function preloadFonts(): Plugin {
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
          attrs: { rel: "preload", as: "font", type: "font/woff2", href: `/${f}`, crossorigin: "" },
          injectTo: "head" as const,
        }));
      return { html, tags };
    },
  };
}

export default defineConfig({
  plugins: [react(), preloadFonts()],
  build: { target: "es2022", sourcemap: false },
});
