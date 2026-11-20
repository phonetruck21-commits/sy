/**
 * Viewer load test – opens N headless "customers" on one viewing link and reports how many
 * actually receive video. Use it to measure what YOUR server + uplink can handle.
 *
 *   node e2e/load/viewers.mjs <viewing-url> [pin] [viewers=5] [seconds=60]
 *
 * While it runs, watch the server:  docker stats   and   iftop / nload  (upload Mbps)
 * Note: every headless viewer decodes video on THIS machine – run it from a strong PC, not the server.
 */
import { chromium } from '@playwright/test';

const [url, pin = '', nArg = '5', secArg = '60'] = process.argv.slice(2);
if (!url) {
  console.error('usage: node e2e/load/viewers.mjs <viewing-url> [pin] [viewers] [seconds]');
  process.exit(2);
}
const N = Number(nArg);
const SECONDS = Number(secArg);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--autoplay-policy=no-user-gesture-required'] });
const pages = [];
for (let i = 0; i < N; i++) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(url);
  if (pin) {
    await page.locator('input').fill(pin);
    await page.getByRole('button', { name: 'כניסה לצפייה' }).click();
  }
  pages.push(page);
}
const start = Date.now();
while (Date.now() - start < SECONDS * 1000) {
  await new Promise((r) => setTimeout(r, 5000));
  const states = await Promise.all(
    pages.map((p) => p.getByTestId('viewer-video').evaluate((v) => ({ w: v.videoWidth, t: v.currentTime, q: v.getVideoPlaybackQuality?.() })).catch(() => null)),
  );
  const ok = states.filter((s) => s && s.w > 0).length;
  const dropped = states.reduce((a, s) => a + (s?.q?.droppedVideoFrames ?? 0), 0);
  console.log(`${Math.round((Date.now() - start) / 1000)}s: ${ok}/${N} viewers receiving video, dropped frames total ${dropped}`);
}
await browser.close();
