import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";
const executablePath =
  process.env.CHROMIUM_PATH ||
  (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  workers: 2,
  timeout: 30000,
  expect: { timeout: 10000 },
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4173/ChatGPT-Wrapped/",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium-desktop",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          executablePath,
          args: ["--no-sandbox", "--disable-dev-shm-usage"],
        },
      },
    },
    {
      name: "chromium-mobile",
      use: {
        ...devices["Pixel 7"],
        defaultBrowserType: "chromium",
        launchOptions: {
          executablePath,
          args: ["--no-sandbox", "--disable-dev-shm-usage"],
        },
      },
    },
    ...(process.env.PLAYWRIGHT_ALL_BROWSERS === "1"
      ? [
          { name: "firefox", use: { ...devices["Desktop Firefox"] } },
          { name: "webkit", use: { ...devices["Desktop Safari"] } },
        ]
      : []),
  ],
  webServer: {
    command:
      "npm run build:pages && npm run preview -- --base=/ChatGPT-Wrapped/ --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173/ChatGPT-Wrapped/",
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },
});
