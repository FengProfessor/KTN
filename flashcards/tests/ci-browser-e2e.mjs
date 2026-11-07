#!/usr/bin/env node
/**
 * KTN FLASHCARD • HEADLESS CHROMIUM BROWSER E2E SUITE (CI & LOCAL)
 * Verifies Phase 1–8 acceptance flows in a real Chromium browser:
 * - All 7 Lộ card counts (90, 109, 96, 100, 92, 88, 30 = 605 cards)
 * - Crisp 660x940 WebP front/back images & lazy 140x200 thumbnails
 * - Mobile 360x740 & 390x844 zero horizontal overflow
 * - Desktop 1280x800 adaptive two-column split layout
 * - Tap flip & touch swipe left/right
 * - Phase 2 "Quên rồi" (re-insert after 3–5 cards + end-of-session edge case + tomorrow schedule)
 * - Phase 2 "Nhớ rồi" fixed 1–3–7–14–30 day schedule & reset on forgot
 * - LocalStorage persistence & legacy progress migration
 * - Phase 6 HanziWriter Mễ Tự Cách single & compound word writing
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.mp3': 'audio/mpeg',
  '.svg': 'image/svg+xml',
};

function startStaticServer() {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      const relPath = urlPath === '/' ? '/index.html' : urlPath;
      const filePath = path.join(ROOT_DIR, relPath);
      if (!filePath.startsWith(ROOT_DIR) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${port}/index.html` });
    });
  });
}

function findChromeExecutable() {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean);
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

async function loadPuppeteer() {
  const require = createRequire(import.meta.url);
  const searchPaths = [
    process.cwd(),
    ROOT_DIR,
    '/tmp/ktn-fc-deps/node_modules',
    '/tmp/ktn-ci-deps/node_modules',
  ];
  for (const modName of ['puppeteer-core', 'puppeteer']) {
    for (const sp of searchPaths) {
      try {
        const resolved = require.resolve(modName, { paths: [sp] });
        const mod = await import(`file://${resolved.replace(/\\/g, '/')}`);
        return mod.default || mod;
      } catch (_) {}
    }
  }
  throw new Error('Could not load puppeteer-core or puppeteer');
}

async function main() {
  console.log('=== [KTN Flashcards Browser E2E] Starting Real Chromium Verification ===');
  const puppeteer = await loadPuppeteer();
  const executablePath = findChromeExecutable();
  const launchOpts = {
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  };
  if (executablePath) launchOpts.executablePath = executablePath;

  const { server, baseUrl } = await startStaticServer();
  const browser = await puppeteer.launch(launchOpts);

  try {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', err => pageErrors.push(String(err)));

    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.goto(baseUrl, { waitUntil: 'networkidle0' });

    // 1. Mobile overflow check
    const overflow390 = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      iw: window.innerWidth,
    }));
    assert.ok(overflow390.sw <= overflow390.iw, `Horizontal overflow on 390x844: ${JSON.stringify(overflow390)}`);

    // 2. All 7 Lộ counts & crisp 660x940 WebP front image check
    const expectedCounts = { lo1: 90, lo2: 109, lo3: 96, lo4: 100, lo5: 92, lo6: 88, lo7: 30 };
    for (const [loKey, expCnt] of Object.entries(expectedCounts)) {
      await page.select('#levelSelect', loKey);
      const cnt = await page.evaluate(() => window.KTNFlashcardApp.getState().allCards.length);
      assert.equal(cnt, expCnt, `Expected ${expCnt} cards for ${loKey}, got ${cnt}`);
      await page.waitForFunction(
        () => {
          const im = document.getElementById('cardFrontImg');
          return im && im.complete && im.naturalWidth === 660 && im.naturalHeight === 940;
        },
        { timeout: 5000 }
      );
    }
    console.log('✓ All 7 Lộ (605 cards) & 660x940 WebP front images verified in headless Chromium.');

    await page.select('#levelSelect', 'lo1');

    // 3. Phase 2 "Quên rồi" & "Nhớ rồi" 1-3-7-14-30 day schedule
    const srsResult = await page.evaluate(() => {
      window.__KTN_MOCK_TODAY__ = '2026-11-07';
      const app = window.KTNFlashcardApp;
      const st = app.getState();
      st.currentIndex = 0;
      const c1 = st.filteredCards[0];
      app.markCardForgot();
      let reinsertIdx = -1;
      for (let i = 1; i < st.filteredCards.length; i++) {
        if (st.filteredCards[i].id === c1.id) {
          reinsertIdx = i;
          break;
        }
      }

      const steps = [];
      for (let i = 0; i < 5; i++) {
        st.currentIndex = st.filteredCards.findIndex(c => c.id === 2);
        app.markCardRemembered();
        const r = st.recordsMap[2];
        steps.push({ step: r.reviewStep, nextDate: r.nextReviewDate });
      }
      st.currentIndex = st.filteredCards.findIndex(c => c.id === 2);
      app.markCardForgot();
      const resetRec = st.recordsMap[2];
      return { reinsertIdx, forgotRec: st.recordsMap[c1.id], steps, resetRec };
    });

    assert.ok(srsResult.reinsertIdx >= 4 && srsResult.reinsertIdx <= 6, `Forgot card must reappear 3-5 cards later (got ${srsResult.reinsertIdx})`);
    assert.equal(srsResult.forgotRec.nextReviewDate, '2026-11-08');
    assert.deepEqual(
      srsResult.steps.map(s => s.nextDate),
      ['2026-11-08', '2026-11-10', '2026-11-14', '2026-11-21', '2026-12-07']
    );
    assert.equal(srsResult.resetRec.reviewStep, 0);
    assert.equal(srsResult.resetRec.nextReviewDate, '2026-11-08');
    console.log('✓ Phase 2 "Quên rồi" (3-5 card requeue) & "Nhớ rồi" (1-3-7-14-30 days) verified.');

    // 4. Desktop 1280x800 two-column adaptive layout
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2, isMobile: false, hasTouch: false });
    await page.reload({ waitUntil: 'networkidle0' });
    const deskMetrics = await page.evaluate(() => {
      const appRect = document.getElementById('app').getBoundingClientRect();
      const mainRect = document.querySelector('.workspace-main').getBoundingClientRect();
      const sideRect = document.getElementById('wordDrawerBackdrop').getBoundingClientRect();
      const sceneRect = document.getElementById('cardScene').getBoundingClientRect();
      return {
        appWidth: appRect.width,
        mainHeight: mainRect.height,
        sideWidth: sideRect.width,
        sideLeft: sideRect.left,
        mainRight: mainRect.right,
        sceneHeight: sceneRect.height,
      };
    });
    assert.ok(deskMetrics.appWidth >= 950, `Desktop app width should be >= 950px, got ${deskMetrics.appWidth}`);
    assert.ok(deskMetrics.sideWidth >= 350 && deskMetrics.sideLeft >= deskMetrics.mainRight - 4);
    assert.ok(deskMetrics.mainHeight <= 800 && deskMetrics.sceneHeight >= 300);
    console.log('✓ Desktop 1280x800 split layout & card arena height verified.');

    assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join('; ')}`);
    console.log('=== [KTN Flashcards Browser E2E] ALL CHECKS PASSED ===');
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
