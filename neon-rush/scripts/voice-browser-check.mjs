import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ headless: true,
  ...(process.env.NEON_BROWSER ? { executablePath: process.env.NEON_BROWSER } : {}),
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--disable-background-timer-throttling'],
});
const base = process.env.NEON_URL || 'http://127.0.0.1:5188';
const pages = [];
const errors = [];
async function stats(page) {
  return page.evaluate(async () => Promise.all(window.__voicePeers.filter(pc => pc.connectionState !== 'closed').map(async pc => ({
    state: pc.connectionState,
    channels: pc.getTransceivers().map(t => ({ direction: t.currentDirection, mid: t.mid, sending: !!t.sender.track, enabled: t.sender.track?.enabled })),
    inbound: [...(await pc.getStats()).values()].filter(s => s.type === 'inbound-rtp' && s.kind === 'audio').map(s => ({ bytes: s.bytesReceived, energy: s.totalAudioEnergy })),
  }))));
}
async function receiving(page) {
  const ready = () => page.evaluate(async () => {
    const peers = window.__voicePeers.filter(pc => pc.connectionState !== 'closed');
    if (!peers.length) return false;
    for (const pc of peers) {
      const reports = [...(await pc.getStats()).values()];
      if (!reports.some(s => s.type === 'inbound-rtp' && s.kind === 'audio' && s.bytesReceived > 500 && s.totalAudioEnergy > 0.001)) return false;
    }
    return window.__voiceAudio.some(audio => !audio.paused && audio.readyState >= 2 && audio.volume > 0);
  });
  const deadline = Date.now() + 15000;
  while (!await ready()) {
    assert.ok(Date.now() < deadline, 'Expected audible inbound audio from every peer');
    await new Promise(resolve => setTimeout(resolve, 150));
  }
}
try {
  for (let i = 0; i < 2; i++) {
    const context = await browser.newContext({ permissions: ['microphone'], ...(i ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : {}) });
    await context.addInitScript(() => {
      window.__voicePeers = []; window.__voiceAudio = [];
      const Peer = window.RTCPeerConnection;
      window.RTCPeerConnection = class extends Peer { constructor(...args) { super(...args); window.__voicePeers.push(this); } };
      const AudioElement = window.Audio;
      window.Audio = function (...args) { const element = new AudioElement(...args); window.__voiceAudio.push(element); return element; };
      const play = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () {
        if (window.__blockVoicePlayback && this.srcObject) return Promise.reject(new DOMException('Playback needs a gesture', 'NotAllowedError'));
        return play.call(this);
      };
      localStorage.setItem('neon-rush-sound', 'false');
    });
    const page = await context.newPage(); pages.push(page);
    page.on('pageerror', error => errors.push(error.message));
  }
  const [a, b] = pages;
  await a.goto(`${base}/?room=VOICE1`);
  await a.getByRole('button', { name: 'CREATE ROOM', exact: true }).click();
  await a.getByLabel('PLAYER NAME', { exact: true }).fill('Voice Alice');
  await a.getByRole('button', { name: 'CREATE A ROOM', exact: true }).click();
  await a.locator('.arena-room-title h2').waitFor();
  const code = await a.locator('.arena-room-title h2').innerText();
  await b.goto(`${base}/?room=${code}`);
  await b.getByLabel('PLAYER NAME', { exact: true }).fill('Voice Bob');
  await b.getByRole('button', { name: 'JOIN ROOM', exact: true }).click();
  await a.locator('.arena-roster li').filter({ hasText: 'Voice Bob' }).waitFor();
  // Negotiate before either microphone is enabled: this previously created a one-way channel.
  await Promise.all(pages.map(page => page.waitForFunction(() => window.__voicePeers.some(pc => pc.connectionState === 'connected'))));
  await a.getByRole('button', { name: 'Enable microphone', exact: true }).click();
  await b.getByRole('button', { name: 'Enable microphone', exact: true }).click();
  await Promise.all(pages.map(page => page.getByRole('button', { name: 'Mute microphone', exact: true }).waitFor()));
  await Promise.all(pages.map(receiving));
  console.log('Two-way audio:', JSON.stringify(await Promise.all(pages.map(stats))));
  for (const page of pages) {
    const peers = await stats(page);
    assert.ok(peers.every(pc => pc.channels.length === 1 && pc.channels[0].direction === 'sendrecv' && pc.channels[0].sending));
  }
  await a.getByRole('button', { name: 'Mute microphone', exact: true }).click();
  assert.ok((await stats(a)).every(pc => pc.channels.every(channel => !channel.enabled)));
  await receiving(a); // Muting our microphone must not mute the other player.
  await a.locator('.arena-room-title h2').click();
  await a.keyboard.down('v');
  assert.ok((await stats(a)).every(pc => pc.channels.every(channel => channel.enabled)));
  await a.keyboard.up('v');
  assert.ok((await stats(a)).every(pc => pc.channels.every(channel => !channel.enabled)));
  await a.getByRole('button', { name: 'Unmute microphone', exact: true }).click();
  assert.ok((await stats(a)).every(pc => pc.channels.every(channel => channel.enabled)));
  await b.getByRole('button', { name: 'Deafen voice chat', exact: true }).click();
  assert.ok(await b.evaluate(() => window.__voiceAudio.filter(audio => audio.srcObject).every(audio => audio.volume === 0)));
  await b.getByRole('button', { name: 'Hear teammates', exact: true }).click();
  await Promise.all(pages.map(receiving));
  const previousIce = await Promise.all(pages.map(page => page.evaluate(() => window.__voicePeers.find(pc => pc.connectionState === 'connected').localDescription.sdp.match(/a=ice-ufrag:(.*)/)[1])));
  await Promise.all(pages.map(page => page.evaluate(() => window.__voicePeers.filter(pc => pc.connectionState === 'connected').forEach(pc => pc.restartIce()))));
  await Promise.all(pages.map((page, index) => page.waitForFunction(old => window.__voicePeers.some(pc => pc.connectionState === 'connected' && pc.signalingState === 'stable' && pc.localDescription.sdp.match(/a=ice-ufrag:(.*)/)[1] !== old), previousIce[index])));
  await Promise.all(pages.map(receiving));
  // Reload one player: the remaining player keeps an open mic, the newcomer opts in again.
  await b.addInitScript(() => { window.__blockVoicePlayback = true; });
  await b.reload();
  await b.getByRole('button', { name: 'Enable microphone', exact: true }).click();
  await b.getByRole('button', { name: 'Mute microphone', exact: true }).waitFor();
  await b.getByRole('button', { name: 'HEAR PLAYERS', exact: true }).waitFor();
  await b.evaluate(() => { window.__blockVoicePlayback = false; });
  await b.getByRole('button', { name: 'HEAR PLAYERS', exact: true }).click();
  await b.getByRole('button', { name: 'HEAR PLAYERS', exact: true }).waitFor({ state: 'hidden' });
  await Promise.all(pages.map(receiving));
  console.log('Passed: desktop/mobile two-way audio, mute/unmute, deafen/restore, simultaneous ICE restart, reconnect, blocked playback recovery');
  assert.deepEqual(errors, []);
} catch (error) {
  console.error('Voice diagnostics:', JSON.stringify(await Promise.all(pages.map(stats))));
  throw error;
} finally { await browser.close(); }
