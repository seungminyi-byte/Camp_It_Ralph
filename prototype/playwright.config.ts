import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', testMatch: '**/*.spec.ts', fullyParallel: false, workers: 1,
  timeout: 120_000, expect: { timeout: 10_000 }, forbidOnly: !!process.env.CI,
  retries: 0, outputDir: 'e2e/artifacts/test-results',
  reporter: [['list'], ['json', { outputFile: 'e2e/artifacts/results.json' }]],
  use: { baseURL: 'http://127.0.0.1:5208', locale: 'ko-KR', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: { command: 'npm run test:e2e:serve', url: 'http://127.0.0.1:5208', reuseExistingServer: !process.env.CI },
});
