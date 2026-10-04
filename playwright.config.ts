import { defineConfig } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const testDirectory = mkdtempSync(join(tmpdir(), "wayfarer-e2e-"));
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3001",
    headless: true,
    launchOptions: {
      executablePath: "/usr/bin/chromium",
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    },
  },
  webServer: {
    command: "npm run dev -- --port 3001",
    url: "http://localhost:3001",
    reuseExistingServer: false,
    env: {
      NEXT_TEST_DIST: "1",
      LOCAL_FILE_STORAGE: "1",
      LOCAL_JOURNAL_PATH: join(testDirectory, "journal.json"),
      JOURNAL_KEY: "test-only-7ceddc38a9b23fa0fb389a91a5f0c88c",
    },
  },
});
