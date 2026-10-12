import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const browser = await chromium.launch({
  headless: true,
  ...(process.env.NEON_BROWSER ? { executablePath: process.env.NEON_BROWSER } : {}),
  args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const errors = [];
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 }, deviceScaleFactor: 1 });
page.on('pageerror', error => errors.push(error.message));
const base = process.env.NEON_URL || 'http://127.0.0.1:5187';
await mkdir('test-results', { recursive: true });
try {
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'START RUN', exact: false }).waitFor();
  await page.screenshot({ path: 'test-results/desktop.png', fullPage: true });
  assert.equal(await page.locator('canvas').count(), 1);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.getByRole('button', { name: 'How to play', exact: true }).click();
  await page.getByRole('dialog').waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog').count(), 0);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('switch', { name: 'Neon bloom' }).click();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'START RUN', exact: false }).click();
  await page.locator('.phase-running').waitFor({ timeout: 20000 });
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(350);
  await page.keyboard.press('Escape');
  await page.getByRole('heading', { name: 'ON PAUSE.' }).waitFor();
  const score = await page.locator('.score-counter strong').innerText();
  await page.waitForTimeout(500);
  assert.equal(await page.locator('.score-counter strong').innerText(), score);
  await page.screenshot({ path: 'test-results/paused.png', fullPage: true });
  await page.getByRole('button', { name: 'RESUME RUN' }).click();
  await page.locator('.phase-running').waitFor();
  await page.getByRole('button', { name: 'Pause game' }).click();
  await page.getByRole('button', { name: 'Restart run' }).click();
  await page.locator('.phase-countdown').waitFor();
  assert.equal(await page.locator('.score-counter strong').innerText(), '000000');
  await page.locator('.phase-running').waitFor({ timeout: 20000 });
  // Leave the runner in the center lane to hit the first tutorial barrier.
  await page.getByRole('heading', { name: 'RUN COMPLETE' }).waitFor({ timeout: 30000 });
  assert.ok(Number((await page.locator('.result-score strong').innerText()).replaceAll(',', '')) > 0);
  await page.getByRole('button', { name: 'Back to the city' }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('switch', { name: 'Neon bloom' }).click();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.getByRole('button', { name: 'START RUN', exact: false }).click();
  await page.locator('.phase-running').waitFor({ timeout: 20000 });
  await page.getByRole('button', { name: 'Left', exact: true }).dispatchEvent('pointerdown');
  await page.getByRole('button', { name: 'Jump', exact: true }).dispatchEvent('pointerdown');
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'test-results/mobile-running.png', fullPage: true });
  await page.getByRole('button', { name: 'Pause game' }).click();
  assert.deepEqual(errors, [], 'No runtime errors');
  console.log(JSON.stringify({ result: 'passed', checks: ['WebGL rendering', 'desktop/mobile overflow', 'help and settings', 'start/countdown', 'keyboard movement/jump', 'pause freezes score', 'resume', 'restart resets score', 'collision/game over', 'mobile buttons'], errors }));
} finally { await browser.close(); }
