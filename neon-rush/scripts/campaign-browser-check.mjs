import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const browser = await chromium.launch({ headless: true, ...(process.env.NEON_BROWSER ? { executablePath: process.env.NEON_BROWSER } : {}), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
const errors = []; page.on('pageerror', error => errors.push(error.message));
await mkdir('test-results', { recursive: true });
await page.addInitScript(() => { localStorage.setItem('neon-rush-quality', 'false'); localStorage.setItem('neon-rush-sound', 'false'); });
try {
  await page.goto(process.env.NEON_URL || 'http://127.0.0.1:5187', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'START CAMPAIGN', exact: false }).waitFor();
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/combat-menu.png', fullPage: true });
  await page.getByRole('button', { name: 'MISSIONS & ARMORY' }).click();
  assert.ok(await page.getByRole('button', { name: 'Laser Highway, locked' }).isDisabled());
  await page.getByRole('button', { name: 'Neon Streets, start mission' }).click();
  await page.getByRole('dialog', { name: 'Mission briefing' }).waitFor();
  await page.getByRole('button', { name: 'DEPLOY RUNNER' }).click();
  await page.locator('.phase-countdown').waitFor();

  // Advance the same live simulation with legal movement commands, without changing HP or kills.
  await page.evaluate(async () => {
    const engineUrl = performance.getEntriesByType('resource').map(entry => entry.name).find(name => name.includes('/src/game/engine.ts'));
    const { game } = await import(engineUrl || '/src/game/engine.ts');
    if (game.phase !== 'countdown') throw new Error(`Browser harness must use the running app's exact module URL, got ${game.phase}`);
    window.__campaignTest = game;
    window.__pilot = () => {
      if (game.phase === 'running') {
        const hazards = game.entities.filter(e => ['wall', 'hurdle', 'beam'].includes(e.kind) && e.z > -13 && e.z < 1);
        if (hazards.some(e => e.lane === game.lane)) { const safe = [-1, 0, 1].find(lane => !hazards.some(e => e.lane === lane)); if (safe !== undefined && safe !== game.lane) game.act(safe < game.lane ? 'left' : 'right'); }
      } else if (['combat', 'boss'].includes(game.phase)) {
        const target = game.combat.enemies.find(e => e.active);
        if (target) { game.combat.aim = { x: target.x, y: target.y + 0.45, z: target.z }; game.fire(true); }
        if (game.combat.projectiles.some(p => p.active && !p.friendly && p.z > -6 && Math.abs(p.x - game.x) < 1.2)) game.dash();
        for (const h of game.combat.hazards) if (h.active) {
          if (h.kind === 'shockwave' && h.z > -5 && h.z < -2) game.act('jump');
          if (h.kind === 'laser' && Math.abs(h.x - game.x) < 1 && h.time > 0.3) game.act(game.lane > 0 ? 'left' : 'right');
        }
      }
    };
    for (let i = 0; i < 6000 && game.phase !== 'combat'; i++) { window.__pilot(); game.update(1 / 120); }
    for (let i = 0; i < 180; i++) game.update(1 / 120);
  });
  await page.locator('.phase-combat').waitFor();
  await page.waitForTimeout(700);
  const stage = await page.locator('.game-stage').boundingBox();
  await page.mouse.move(stage.x + stage.width * 0.5, stage.y + stage.height * 0.42);
  await page.mouse.down();
  await page.waitForFunction(() => window.__campaignTest.combat.shots > 0, undefined, { timeout: 10000 }).catch(async error => {
    console.log('input-debug', await page.evaluate(() => ({ phase: window.__campaignTest.phase, shots: window.__campaignTest.combat.shots, firing: window.__campaignTest.combat.firing, snapshot: window.__campaignTest.getSnapshot().phase, active: document.activeElement?.outerHTML.slice(0, 250) })));
    await page.screenshot({ path: 'test-results/combat-input-failure.png', fullPage: true }); throw error;
  });
  await page.mouse.up();
  await page.keyboard.press('q');
  assert.equal(await page.evaluate(() => window.__campaignTest.combat.weapon), 'pulse');
  await page.keyboard.press('Shift');
  assert.ok(await page.evaluate(() => window.__campaignTest.combat.dashCooldown > 0));
  await page.keyboard.press('p');
  await page.getByRole('heading', { name: 'ON PAUSE.' }).waitFor();
  const time = await page.evaluate(() => window.__campaignTest.missionTime);
  await page.waitForTimeout(250); assert.equal(await page.evaluate(() => window.__campaignTest.missionTime), time);
  await page.getByRole('button', { name: 'RESUME RUN' }).click();
  await page.screenshot({ path: 'test-results/combat-arena.png', fullPage: true });
  await page.evaluate(() => {
    const game = window.__campaignTest; game.combat.aimActive = false; game.combat.weapon = 'blaster';
    for (let i = 0; i < 20000 && !['upgrade', 'over'].includes(game.phase); i++) { window.__pilot(); game.update(1 / 120); }
  });
  await page.getByRole('dialog', { name: 'Choose a field upgrade' }).waitFor();
  await page.getByRole('button', { name: /REINFORCE/ }).click();
  await page.evaluate(() => { const game = window.__campaignTest; for (let i = 0; i < 7000 && game.phase !== 'boss'; i++) { window.__pilot(); game.update(1 / 120); } });
  await page.locator('.phase-boss').waitFor();
  await page.screenshot({ path: 'test-results/combat-boss.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  const pad = await page.getByRole('slider', { name: 'Aim control' }).boundingBox();
  await page.mouse.move(pad.x + pad.width / 2, pad.y + pad.height / 2); await page.mouse.down();
  await page.mouse.move(pad.x + pad.width * 0.85, pad.y + pad.height * 0.3); await page.waitForTimeout(300); await page.mouse.up();
  assert.ok(await page.evaluate(() => window.__campaignTest.combat.aimActive));
  const shots = await page.evaluate(() => window.__campaignTest.combat.shots);
  const fire = await page.getByRole('button', { name: 'Hold to fire' }).boundingBox();
  await page.mouse.move(fire.x + fire.width / 2, fire.y + fire.height / 2); await page.mouse.down();
  await page.waitForFunction(previous => window.__campaignTest.combat.shots > previous, shots, { timeout: 10000 }); await page.mouse.up();
  assert.ok(await page.evaluate(previous => window.__campaignTest.combat.shots > previous, shots));
  assert.equal(await page.evaluate(() => window.__campaignTest.combat.firing), false);
  await page.getByRole('button', { name: 'Reload weapon' }).click();
  await page.screenshot({ path: 'test-results/combat-mobile.png', fullPage: true });
  await page.evaluate(() => {
    const game = window.__campaignTest; game.combat.aimActive = false;
    for (let i = 0; i < 20000 && !['victory', 'over'].includes(game.phase); i++) { window.__pilot(); game.update(1 / 120); }
  });
  await page.getByRole('dialog', { name: 'Mission complete' }).waitFor();
  await page.screenshot({ path: 'test-results/combat-victory-mobile.png', fullPage: true });
  const bank = await page.evaluate(() => window.__campaignTest.progress.bank);
  assert.ok(bank > 0);
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'MISSIONS & ARMORY' }).click();
  assert.equal(await page.getByRole('button', { name: 'Laser Highway, start mission' }).isDisabled(), false);
  await page.getByRole('button', { name: 'UPGRADE · 60 CREDITS' }).first().click();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'START RUN · ENDLESS' }).click();
  await page.locator('.phase-countdown').waitFor();
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ result: 'passed', checks: ['mission selection / locks', 'briefing / countdown', 'runner to combat', 'mouse firing', 'weapon switching', 'dash', 'pause freeze / resume', 'real projectile wave completion', 'field upgrade', 'second runner section', 'boss introduction', 'mobile aim / fire / reload', 'boss defeat / results', 'progression after refresh', 'weapon upgrade purchase', 'preserved endless mode'], errors }));
} finally { await browser.close(); }
