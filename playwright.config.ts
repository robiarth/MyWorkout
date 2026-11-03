import { defineConfig, devices } from "@playwright/test";
const cloud = process.env.MW_CLOUD_E2E === "true";
const port = cloud ? 8086 : 8085;
export default defineConfig({
  testDir: "e2e",
  testMatch: cloud ? "cloud.spec.ts" : "workout.spec.ts",
  fullyParallel: false,
  use: { baseURL: `http://127.0.0.1:${port}`, ...devices["Pixel 7"] },
  webServer: {
    command: `npx expo start --web --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    env: {
      EXPO_PUBLIC_LOCAL_DEMO: cloud ? "false" : "true",
      EXPO_PUBLIC_SUPABASE_URL: cloud
        ? process.env.EXPO_PUBLIC_SUPABASE_URL!
        : "",
      EXPO_PUBLIC_SUPABASE_ANON_KEY: cloud
        ? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!
        : "",
    },
  },
  reporter: "list",
});
