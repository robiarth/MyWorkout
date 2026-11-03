import { execSync, spawnSync } from "node:child_process";
const status = JSON.parse(
  execSync("npx --yes supabase status --output json", {
    encoding: "utf8",
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  }),
);
if (!/^http:\/\/127\.0\.0\.1:54321$/.test(status.API_URL))
  throw new Error("Cette preuve exige Supabase local sur 127.0.0.1:54321.");
const result = spawnSync("npx playwright test", {
  shell: true,
  windowsHide: true,
  stdio: "inherit",
  env: {
    ...process.env,
    MW_CLOUD_E2E: "true",
    MW_TEST_SERVICE_KEY: status.SERVICE_ROLE_KEY,
    EXPO_PUBLIC_SUPABASE_URL: status.API_URL,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
  },
});
process.exitCode = result.status ?? 1;
