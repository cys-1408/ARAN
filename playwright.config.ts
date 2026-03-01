import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './e2e',
    timeout: 45_000,
    expect: { timeout: 8_000 },
    use: {
        baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },
    projects: [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    ],
    webServer: process.env.E2E_BASE_URL
        ? undefined
        : {
            command: 'npm run dev -- --host 127.0.0.1 --port 5173',
            port: 5173,
            timeout: 90_000,
            reuseExistingServer: true,
        },
});
