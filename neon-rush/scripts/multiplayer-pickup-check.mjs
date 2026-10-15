import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { startArenaServer } from '../server/index.mjs';
const { WebSocket } = createRequire(new URL('../server/index.mjs', import.meta.url))('ws');

// Uses an isolated real server. Only this test can position players; production
// clients still have no authority to teleport, choose weapons, or award armor.
const base = process.env.NEON_URL || 'http://127.0.0.1:5188';
const server = await startArenaServer({ port: 0, allowedOrigins: [new URL(base).origin] });
let peer, browser;
try {
  browser = await chromium.launch({ headless: true,
    ...(process.env.NEON_BROWSER ? { executablePath: process.env.NEON_BROWSER } : {}),
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  await mkdir('test-results', { recursive: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(port => {
    const Original = window.WebSocket;
    window.WebSocket = class extends Original {
      constructor(url, ...args) { super(String(url).endsWith('/ws') ? `ws://127.0.0.1:${port}/ws` : url, ...args); }
    };
  }, server.port);
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'MULTIPLAYER ARENA', exact: true }).click();
  await page.getByLabel('PLAYER NAME', { exact: true }).fill('Collector');
  await page.getByRole('button', { name: /Orbital Foundry/ }).click();
  await page.getByRole('button', { name: 'CREATE A ROOM', exact: true }).click();
  await page.locator('.arena-room-title h2').waitFor();
  const code = await page.locator('.arena-room-title h2').innerText();
  peer = new WebSocket(`ws://127.0.0.1:${server.port}/ws`, { origin: new URL(base).origin });
  await new Promise((resolve, reject) => { peer.once('open', resolve); peer.once('error', reject); });
  peer.send(JSON.stringify({ type: 'join', code, name: 'Opponent' }));
  await page.locator('.arena-roster li').filter({ hasText: 'Opponent' }).waitFor();
  peer.send(JSON.stringify({ type: 'ready', ready: true }));
  await page.getByRole('button', { name: /I.M READY/ }).click();
  await page.getByRole('button', { name: 'START MATCH', exact: true }).click();
  await page.locator('.arena-ammo').waitFor();
  const room = server.rooms.get(code), player = room.players.get(room.hostId);
  for (const [kind, name, magazine] of [['pulse', 'PULSE RIFLE', 32], ['shotgun', 'PLASMA SHOTGUN', 6], ['laser', 'RAIL BLASTER', 5]]) {
    const pickup = room.pickups.find(p => p.kind === kind);
    Object.assign(player, { x: pickup.x, z: pickup.z });
    await page.locator('.arena-ammo > span').filter({ hasText: name }).waitFor();
    assert.equal(player.ammo, magazine);
    for (const viewport of [{ width: 320, height: 568 }, { width: 568, height: 320 }]) {
      await page.setViewportSize(viewport);
      const overlaps = await page.evaluate(() => {
        const a = document.querySelector('.arena-vitals').getBoundingClientRect();
        const b = document.querySelector('.arena-ammo').getBoundingClientRect();
        const text = document.querySelector('.arena-ammo > span');
        return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top || text.scrollWidth > text.clientWidth;
      });
      assert.equal(overlaps, false, `${name} fits a ${viewport.width}px phone`);
    }
  }
  const armor = room.pickups.find(p => p.kind === 'armor');
  Object.assign(player, { x: armor.x, z: armor.z });
  await page.locator('.arena-vitals').filter({ hasText: '50 ARMOR' }).waitFor();
  const health = room.pickups.find(p => p.kind === 'health');
  Object.assign(player, { x: health.x, z: health.z, hp: 40 });
  await page.waitForFunction(() => document.querySelector('.arena-vitals strong')?.textContent === '80');
  await page.screenshot({ path: 'test-results/multiplayer-pickups-phone.png' });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ result: 'passed', checks: ['all three weapon HUD changes', 'small-phone weapon labels', 'armor HUD', 'health pickup'] }));
} finally { peer?.terminate(); await browser?.close(); await server.close(); }
