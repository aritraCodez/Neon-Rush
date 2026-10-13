import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const browser = await chromium.launch({ headless: true, ...(process.env.NEON_BROWSER ? { executablePath: process.env.NEON_BROWSER } : {}), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const contexts = await Promise.all([
  browser.newContext({ viewport: { width: 1440, height: 1100 } }),
  browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }),
]);
const errors = [];
for (const context of contexts) {
  await context.grantPermissions(['microphone']);
  await context.addInitScript(() => {
  localStorage.setItem('neon-rush-quality', 'false'); localStorage.setItem('neon-rush-sound', 'false');
  // Observe transport traffic without changing gameplay or client/server state.
  const Original = window.WebSocket;
  window.WebSocket = class extends Original {
    constructor(...args) {
      super(...args);
      if (!String(args[0]).endsWith('/ws')) return;
      this.addEventListener('message', event => {
        const message = JSON.parse(event.data);
        if (message.type === 'snapshot') window.__arenaSnapshot = message.room;
        if (message.type === 'session') window.__arenaId = message.id;
        if (message.type === 'voice') { window.__arenaVoice ??= []; window.__arenaVoice.push(message.kind); }
      });
    }
    send(data) { const message = JSON.parse(data); if (message.type === 'input') window.__lastInput = message.input; return super.send(data); }
  };
  });
}
const [a, b] = await Promise.all(contexts.map(context => context.newPage()));
for (const page of [a, b]) page.on('pageerror', error => errors.push(error.message));
const base = process.env.NEON_URL || 'http://127.0.0.1:5187';
await mkdir('test-results', { recursive: true });
try {
  await a.goto(base, { waitUntil: 'networkidle' });
  await a.getByRole('button', { name: 'MULTIPLAYER ARENA', exact: true }).click();
  await a.getByLabel('PLAYER NAME', { exact: true }).fill('Alice');
  await a.getByRole('button', { name: 'CREATE A ROOM', exact: true }).click();
  await a.locator('.arena-room-title h2').waitFor(); const code = await a.locator('.arena-room-title h2').innerText();
  assert.match(code, /^[A-Z2-9]{6}$/);
  await b.goto(`${base}/?room=${code}`, { waitUntil: 'networkidle' });
  await b.getByLabel('PLAYER NAME', { exact: true }).fill('Bob');
  assert.equal(await b.getByLabel('ROOM CODE', { exact: true }).inputValue(), code);
  await b.getByRole('button', { name: 'JOIN ROOM', exact: true }).click();
  await b.locator('.arena-roster li').filter({ hasText: 'Alice' }).waitFor();
  await a.locator('.arena-roster li').filter({ hasText: 'Bob' }).waitFor();
  await a.getByLabel('Chat message', { exact: true }).fill('glhf');
  await a.getByRole('button', { name: 'Send chat', exact: true }).click();
  await b.locator('.arena-chat li').filter({ hasText: 'glhf' }).waitFor();
  await Promise.all([a, b].map(page => page.getByRole('button', { name: 'Enable microphone', exact: true }).click()));
  await a.waitForFunction(() => window.__arenaSnapshot?.players.length === 2 && window.__arenaSnapshot.players.every(player => player.muted === false), undefined, { timeout: 10000 });
  await a.waitForFunction(() => (window.__arenaVoice || []).some(kind => kind === 'offer' || kind === 'answer'), undefined, { timeout: 10000 });
  assert.equal(await a.getByRole('button', { name: 'START MATCH', exact: true }).isDisabled(), true);
  assert.equal(await b.getByRole('button', { name: 'START MATCH', exact: true }).count(), 0);
  await a.getByRole('button', { name: 'I’M READY', exact: true }).click();
  await b.getByRole('button', { name: 'I’M READY', exact: true }).click();
  await a.waitForFunction(() => window.__arenaSnapshot?.players.every(player => player.ready));
  await a.screenshot({ path: 'test-results/multiplayer-lobby-desktop.png', fullPage: true });
  await b.screenshot({ path: 'test-results/multiplayer-lobby-mobile.png', fullPage: true });
  await a.getByRole('button', { name: 'START MATCH', exact: true }).click();
  await Promise.all([a, b].map(page => page.waitForFunction(() => window.__arenaSnapshot?.phase === 'playing', undefined, { timeout: 15000 })));
  await a.bringToFront();
  await a.locator('.arena-canvas canvas').focus(); await a.keyboard.down('d');
  await a.waitForFunction(() => window.__arenaSnapshot.players.find(player => player.id === window.__arenaId).x > 8.5, undefined, { timeout: 12000 });
  await a.keyboard.up('d');
  await a.waitForTimeout(1400);
  const aim = await a.evaluate(async () => {
    const { PerspectiveCamera, Vector3 } = await import('/node_modules/three/build/three.module.js');
    const self = window.__arenaSnapshot.players.find(player => player.id === window.__arenaId);
    const rival = window.__arenaSnapshot.players.find(player => player.id !== window.__arenaId);
    const rect = document.querySelector('.arena-canvas canvas').getBoundingClientRect();
    const camera = new PerspectiveCamera(50, rect.width / rect.height, 0.1, 120);
    camera.position.set(self.x * 0.2, 29, self.z * 0.25 + 23); camera.lookAt(self.x * 0.2, 0, self.z * 0.25); camera.updateMatrixWorld();
    const point = new Vector3(rival.x, 0, rival.z).project(camera);
    return { x: rect.left + (point.x + 1) * rect.width / 2, y: rect.top + (1 - point.y) * rect.height / 2 };
  });
  await a.mouse.move(aim.x, aim.y); await a.mouse.down();
  await a.waitForFunction(() => window.__arenaSnapshot.players.find(player => player.id === window.__arenaId).shots >= 1, undefined, { timeout: 10000 });
  await b.waitForFunction(() => window.__arenaSnapshot.players.find(player => player.id === window.__arenaId).hp < 100, undefined, { timeout: 10000 });
  await a.waitForFunction(() => window.__arenaSnapshot.players.find(player => player.id === window.__arenaId).kills >= 1, undefined, { timeout: 10000 });
  await a.mouse.up();
  await a.keyboard.press('r');
  await a.waitForFunction(() => window.__arenaSnapshot.players.find(player => player.id === window.__arenaId).reload > 0);
  await a.screenshot({ path: 'test-results/multiplayer-combat-desktop.png', fullPage: true });
  await b.waitForFunction(() => window.__arenaSnapshot.players.find(player => player.id === window.__arenaId).hp === 100, undefined, { timeout: 10000 });
  const bobId = await b.evaluate(() => window.__arenaId);
  await b.reload({ waitUntil: 'networkidle' });
  await b.waitForFunction(id => window.__arenaId === id && window.__arenaSnapshot?.phase === 'playing', bobId, { timeout: 15000 });
  assert.equal(await b.locator('.arena-scoreboard li').count(), 2);
  await b.bringToFront();
  await b.locator('.arena-stage').scrollIntoViewIfNeeded();
  const move = await b.getByRole('group', { name: 'Move runner with pad or arrow keys' }).boundingBox();
  const fire = await b.getByRole('group', { name: 'Aim and fire with pad or arrow keys' }).boundingBox();
  const cdp = await contexts[1].newCDPSession(b);
  const touches = [{ id: 1, x: move.x + move.width * 0.8, y: move.y + move.height / 2 }, { id: 2, x: fire.x + fire.width / 2, y: fire.y + fire.height * 0.2 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touches });
  await b.waitForFunction(() => window.__lastInput?.dx > 0.2 && window.__lastInput?.fire === true, undefined, { timeout: 5000 });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await b.waitForFunction(() => window.__lastInput?.dx === 0 && window.__lastInput?.fire === false);
  await b.getByRole('button', { name: 'DASH', exact: true }).click();
  // Dash requires movement; test the cooldown with the move pad held.
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touches[0]] });
  await b.getByRole('button', { name: 'DASH', exact: true }).dispatchEvent('click');
  await b.waitForFunction(() => window.__arenaSnapshot.players.find(player => player.id === window.__arenaId).dashCooldown > 0);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.equal(await b.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await b.screenshot({ path: 'test-results/multiplayer-combat-mobile.png', fullPage: true });
  await b.getByRole('button', { name: 'LEAVE MATCH', exact: true }).click();
  await a.getByRole('heading', { name: 'YOU WIN.', exact: true }).waitFor();
  await a.getByRole('button', { name: 'REMATCH LOBBY', exact: true }).click();
  await a.locator('.arena-room-title h2').waitFor();
  assert.equal(await a.locator('.arena-roster li').count(), 1);
  assert.equal(await a.getByRole('button', { name: 'START MATCH', exact: true }).isDisabled(), true);
  await b.getByRole('button', { name: 'MULTIPLAYER ARENA', exact: true }).click();
  await b.getByRole('button', { name: 'JOIN FRIENDS', exact: true }).click();
  await b.getByLabel('ROOM CODE', { exact: true }).fill(code);
  await b.getByRole('button', { name: 'JOIN ROOM', exact: true }).click();
  await b.getByRole('button', { name: 'I’M READY', exact: true }).click();
  await a.getByRole('button', { name: 'I’M READY', exact: true }).click();
  await a.getByRole('button', { name: 'START MATCH', exact: true }).click();
  await a.waitForFunction(() => window.__arenaSnapshot?.phase === 'playing' && window.__arenaSnapshot.round === 2);
  assert.equal(await a.locator('.arena-network-overlay').count(), 0, 'Rematch recreates the 3D renderer without a false graphics failure');
  await a.getByRole('button', { name: 'SOLO MODE', exact: true }).click();
  await a.getByRole('button', { name: 'START RUN', exact: false }).waitFor();
  await a.getByRole('button', { name: 'START RUN', exact: false }).click();
  await a.locator('.phase-running').waitFor({ timeout: 15000 });
  await a.getByRole('button', { name: 'Pause game', exact: true }).click();
  await a.getByRole('heading', { name: 'ON PAUSE.', exact: true }).waitFor();
  assert.deepEqual(errors, [], 'No browser runtime errors');
  console.log(JSON.stringify({ result: 'passed', checks: ['separate players via room code and invite', 'ready and host permissions', 'room text chat', 'voice chat signaling', 'shared countdown', 'remote movement', 'real mouse aim and damage', 'kill scoreboard', 'reload and respawn', 'refresh reconnect', 'simultaneous mobile move/aim/fire', 'dash', 'mobile overflow', 'disconnect result and rematch', 'return to solo'], errors }));
} catch (error) {
  await Promise.allSettled([a.screenshot({ path: 'test-results/multiplayer-failure-a.png', fullPage: true }), b.screenshot({ path: 'test-results/multiplayer-failure-b.png', fullPage: true })]);
  console.error('arena-state', await a.evaluate(() => ({ room: window.__arenaSnapshot, input: window.__lastInput })).catch(() => null)); throw error;
} finally { await browser.close(); }
