import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "./",
  plugins: [react()],
  // The overlay is off because several people build theory folders against one dev server:
  // a syntax error in one folder must not cover everybody else's slides.
  server: { port: 5173, strictPort: true, hmr: { overlay: false } },
  optimizeDeps: {
    include: [
      "react", "react-dom", "react-dom/client", "three", "@react-three/fiber", "@react-three/drei", "gsap", "@gsap/react",
      "motion/react", "zustand", "d3-scale", "d3-shape", "katex", "highlight.js/lib/core", "highlight.js/lib/languages/python",
      "@noble/hashes/sha2.js", "@noble/hashes/utils.js",
    ],
  },
  build: { target: "es2022", chunkSizeWarningLimit: 2500 },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    css: false,
    // Rendering every slide of a concept in jsdom takes a few seconds on a busy machine.
    testTimeout: 30_000,
  },
});
