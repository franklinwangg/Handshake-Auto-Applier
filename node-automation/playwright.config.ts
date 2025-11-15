import { defineConfig } from "@playwright/test";

export default defineConfig({
  use: {
    headless: false,
    viewport: { width: 1400, height: 900 },
  },
});
