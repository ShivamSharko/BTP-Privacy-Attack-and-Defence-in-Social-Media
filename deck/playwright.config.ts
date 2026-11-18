import { defineConfig } from "@playwright/test";

/**
 * End-to-end walk through the built deck, in the Microsoft Edge that Windows already has
 * (no browser download). WebGL runs on SwiftShader, so frame times here are a report, not
 * the pass mark; the pass mark is checked in a real window (see deck/README.md).
 */
const swiftshader = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];

export default defineConfig({
  testDir: "./e2e",
  testMatch: "*.spec.ts",
  timeout: 240_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:4173",
    channel: "msedge",
    viewport: { width: 1600, height: 900 },
  },
  webServer: {
    command: "npm run preview",
    url: "http://localhost:4173",
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [
    { name: "motion", use: { launchOptions: { args: swiftshader } } },
    { name: "reduced-motion", use: { launchOptions: { args: swiftshader }, contextOptions: { reducedMotion: "reduce" } } },
    { name: "no-webgl", use: { launchOptions: { args: ["--disable-gpu", "--disable-webgl", "--disable-webgl2", "--disable-3d-apis"] } } },
  ],
});
