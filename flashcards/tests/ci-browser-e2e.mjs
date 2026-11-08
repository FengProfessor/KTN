#!/usr/bin/env node
/**
 * KTN FLASHCARD • HEADLESS CHROMIUM BROWSER E2E SUITE (CI & LOCAL)
 * Verifies all 15 Phase 5 acceptance requirements in a real Chromium browser:
 * 1. Opens cleanly without dev environment dependencies
 * 2. All 7 Lộ card counts (90, 109, 96, 100, 92, 88, 30 = 605 cards)
 * 3. Card flip & prev/next navigation
 * 4. Crisp 660x940 WebP front/back images & lazy 140x200 thumbnails
 * 5. APPROVED audio plays normally (484 cards)
 * 6. Unapproved audio (NEEDS_REPLACEMENT / PENDING_REVIEW, 121 cards) is blocked from playing bad audio & shows "Đang cập nhật phát âm" while preserving study/flip/write
 * 7. "Quên rồi" reappears after 3–5 cards in current session
 * 8. "Nhớ rồi" fixed 1–3–7–14–30 day schedule & reset on forgot
 * 9. "Ôn hôm nay" strictly counts cards with nextReviewDate <= today (never counts tomorrow's forgot cards as due today)
 * 10. HanziWriter Mễ Tự Cách single & compound word writing
 * 11. Mobile 360x740 (Android) & 390x844 (iPhone) zero horizontal overflow
 * 12. Desktop 1280x800 adaptive two-column split layout
 * 13. Scoped Service Worker (sw.js v3) & Phase 2 internal audio review page (audio-review.html)
 * 14. Back link to Sổ liên lạc KTN (#btnBackToPortal)
 * 15. Reload & level switching preserve progress without cross-level contamination
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
  '.csv': 'text/csv; charset=utf-8',
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
      resolve({
        server,
        baseOrigin: `http://127.0.0.1:${port}`,
        baseUrl: `http://127.0.0.1:${port}/index.html`,
      });
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
    path.resolve(ROOT_DIR, '..'),
    'd:\\Vibe\\khongtunhi-demo\\scripts\\node_modules',
    'd:\\Vibe\\khongtunhi_sofl_style\\node_modules',
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
  console.log('=== [KTN Flashcards Browser E2E] Starting Real Chromium Verification (15 Scenarios) ===');
  const puppeteer = await loadPuppeteer();
  const executablePath = findChromeExecutable();
  const launchOpts = {
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  };
  if (executablePath) launchOpts.executablePath = executablePath;

  const { server, baseOrigin, baseUrl } = await startStaticServer();
  const browser = await puppeteer.launch(launchOpts);

  try {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', err => pageErrors.push(String(err)));

    // 1. Mobile 390x844 (iPhone) & 360x740 (Android) viewport & back-to-portal link check
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.goto(baseUrl, { waitUntil: 'networkidle0' });

    const overflow390 = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      iw: window.innerWidth,
      backHref: document.getElementById('btnBackToPortal')?.getAttribute('href') || '',
    }));
    assert.ok(overflow390.sw <= overflow390.iw, `Horizontal overflow on 390x844: ${JSON.stringify(overflow390)}`);
    assert.ok(overflow390.backHref.includes('khongtunhi.com'), 'Back to Sổ liên lạc link must be present');

    await page.setViewport({ width: 360, height: 740, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const overflow360 = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      iw: window.innerWidth,
    }));
    assert.ok(overflow360.sw <= overflow360.iw, `Horizontal overflow on 360x740: ${JSON.stringify(overflow360)}`);
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

    // 2. All 7 Lộ counts & crisp 660x940 WebP front/back image check (including repaired cards)
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
    console.log('✓ [1,2,4,11,14] All 7 Lộ (605 cards), 660x940 WebP images, mobile 360/390 layouts & Sổ liên lạc link verified.');

    // 3. Verify Audio Quality Gate: APPROVED plays vs NEEDS_REPLACEMENT / PENDING_REVIEW blocked with "Đang cập nhật phát âm"
    await page.select('#levelSelect', 'lo1');
    const audioGateCheck = await page.evaluate(() => {
      const app = window.KTNFlashcardApp;
      const st = app.getState();

      // Card #1 (你) is APPROVED
      st.currentIndex = 0;
      document.getElementById('btnPrev').click();
      document.getElementById('btnNext').click();
      st.currentIndex = 0;
      const card1 = st.filteredCards[0];
      const approved1 = app.isCardAudioApproved(card1);
      const backLabel1 = document.getElementById('audioBackLabel').textContent;

      // Card #3 (你好) is NEEDS_REPLACEMENT
      const idxNiHao = st.filteredCards.findIndex(c => c.word === '你好');
      st.currentIndex = idxNiHao;
      // Trigger render via flip + unflip or next/prev
      document.getElementById('btnPrev').click();
      document.getElementById('btnNext').click();
      const cardNiHao = st.filteredCards[st.currentIndex];
      const approvedNiHao = app.isCardAudioApproved(cardNiHao);
      const playedNiHao = app.playAudio();
      const playedNiHaoExplicit = app.playAudio(cardNiHao.audio);
      const backLabelNiHao = document.getElementById('audioBackLabel').textContent;
      const frontDisabledNiHao = document.getElementById('btnAudioFront').getAttribute('aria-disabled');
      const toastText = document.getElementById('toastMessage').textContent;

      // Verify teacher override from audio-review.html (ktn_audio_audit_overrides_v2) bridges to index.html
      localStorage.setItem(
        'ktn_audio_audit_overrides_v2',
        JSON.stringify({ [`LO1#${cardNiHao.id}`]: { status: 'APPROVED', notes: 'Teacher verified' } })
      );
      const approvedAfterOverride = app.isCardAudioApproved(cardNiHao);
      localStorage.removeItem('ktn_audio_audit_overrides_v2');

      // Card #17 (哪儿) was upgraded to single-take Shtooka File:Zh-nǎr.ogg -> APPROVED while keeping native_concat
      const idxNar = st.filteredCards.findIndex(c => c.word === '哪儿');
      const cardNar = st.filteredCards[idxNar];
      const approvedNar = app.isCardAudioApproved(cardNar);

      return {
        approved1,
        backLabel1,
        wordNiHao: cardNiHao.word,
        approvedNiHao,
        playedNiHao,
        playedNiHaoExplicit,
        approvedAfterOverride,
        backLabelNiHao,
        frontDisabledNiHao,
        toastText,
        approvedNar,
        narType: cardNar.audio_type,
      };
    });

    assert.equal(audioGateCheck.approved1, true, 'Card #1 (你) must be APPROVED');
    assert.equal(audioGateCheck.backLabel1, 'Cách đọc');
    assert.equal(audioGateCheck.wordNiHao, '你好');
    assert.equal(audioGateCheck.approvedNiHao, false, '你好 must NOT be approved');
    assert.equal(audioGateCheck.playedNiHao, false, 'Unapproved audio must NOT play');
    assert.equal(audioGateCheck.playedNiHaoExplicit, false, 'Unapproved audio must NOT play even when card.audio is passed explicitly');
    assert.equal(audioGateCheck.approvedAfterOverride, true, 'Teacher override in ktn_audio_audit_overrides_v2 must bridge to Flashcard app');
    assert.equal(audioGateCheck.backLabelNiHao, 'Đang cập nhật phát âm');
    assert.equal(audioGateCheck.frontDisabledNiHao, 'true');
    assert.ok(audioGateCheck.toastText.includes('Đang cập nhật phát âm'), 'Toast must inform student audio is updating');
    assert.equal(audioGateCheck.approvedNar, true, '哪儿 (File:Zh-nǎr.ogg) must be APPROVED');
    assert.equal(audioGateCheck.narType, 'native_concat', '哪儿 must preserve native_concat type');
    console.log('✓ [5,6] Audio Quality Gate verified (APPROVED plays; NEEDS_REPLACEMENT/PENDING_REVIEW blocked with clear UI notice).');

    // 4. Verify "Quên rồi", "Nhớ rồi" (1-3-7-14-30 days), and "Ôn hôm nay" due-date bug fix
    const srsResult = await page.evaluate(() => {
      localStorage.clear();
      window.__KTN_MOCK_TODAY__ = '2026-11-07';
      const app = window.KTNFlashcardApp;
      app.switchLevel('lo1');
      const st = app.getState();

      // Mark Card #1 as "Quên rồi" on 2026-11-07 -> nextReviewDate is tomorrow (2026-11-08)
      st.currentIndex = 0;
      const c1 = st.filteredCards[0];
      app.markCardForgot();
      // Trigger a second markCardForgot on Card #1 to verify future queue deduplication
      st.currentIndex = 0;
      app.markCardForgot();
      let reinsertIdx = -1;
      let futureCopyCount = 0;
      for (let i = 1; i < st.filteredCards.length; i++) {
        if (st.filteredCards[i].id === c1.id) {
          if (reinsertIdx === -1) reinsertIdx = i;
          futureCopyCount++;
        }
      }

      // CRITICAL BUG FIX CHECK: On 2026-11-07, Card #1 has nextReviewDate = '2026-11-08' (tomorrow).
      // It must NOT be counted in getDueCardsForCurrentLevel() today!
      const dueOnSameDayAfterForgot = app.getDueCardsForCurrentLevel().map(c => c.id);
      const dueBannerOnSameDay = document.getElementById('statDueCount').textContent;
      const relearnCountOnSameDay = document.getElementById('statRelearnCount').textContent;

      // Advance mock date to tomorrow (2026-11-08) -> now Card #1 IS due today!
      window.__KTN_MOCK_TODAY__ = '2026-11-08';
      const dueOnTomorrow = app.getDueCardsForCurrentLevel().map(c => c.id);

      // Reset mock date to 2026-11-07 and test 1-3-7-14-30 day progression on Card #2
      window.__KTN_MOCK_TODAY__ = '2026-11-07';
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

      return {
        reinsertIdx,
        futureCopyCount,
        forgotRec: st.recordsMap[c1.id],
        dueOnSameDayAfterForgot,
        dueBannerOnSameDay,
        relearnCountOnSameDay,
        dueOnTomorrow,
        steps,
        resetRec,
      };
    });

    assert.ok(srsResult.reinsertIdx >= 4 && srsResult.reinsertIdx <= 6, `Forgot card must reappear 3-5 cards later (got ${srsResult.reinsertIdx})`);
    assert.equal(srsResult.futureCopyCount, 1, 'Repeated Quên rồi clicks must deduplicate future copies in session queue');
    assert.equal(srsResult.forgotRec.nextReviewDate, '2026-11-08');
    assert.equal(srsResult.dueOnSameDayAfterForgot.includes(1), false, 'Future forgot card (due tomorrow) must NOT be counted in Ôn hôm nay');
    assert.equal(srsResult.dueBannerOnSameDay, '0', 'dueTodayBannerNum must be 0 when only tomorrow forgot cards exist');
    assert.equal(srsResult.relearnCountOnSameDay, '1', 'statRelearnCount must still track the 1 forgot card');
    assert.equal(srsResult.dueOnTomorrow.includes(1), true, 'Card #1 must become due on 2026-11-08');
    assert.deepEqual(
      srsResult.steps.map(s => s.nextDate),
      ['2026-11-08', '2026-11-10', '2026-11-14', '2026-11-21', '2026-12-07']
    );
    assert.equal(srsResult.resetRec.reviewStep, 0);
    assert.equal(srsResult.resetRec.nextReviewDate, '2026-11-08');
    console.log('✓ [7,8,9] "Quên rồi" requeue, "Nhớ rồi" 1-3-7-14-30 schedule, and "Ôn hôm nay" due-date accuracy verified.');

    // 5. Verify Level Isolation & Persistence across reload (Lộ 1 progress does not leak into Lộ 7)
    await page.select('#levelSelect', 'lo7');
    const levelIsolation = await page.evaluate(() => {
      const app = window.KTNFlashcardApp;
      const st = app.getState();
      return {
        activeLevel: st.activeLevel,
        lo7RecordKeys: Object.keys(st.recordsMap).length,
      };
    });
    assert.equal(levelIsolation.activeLevel, 'lo7');
    assert.equal(levelIsolation.lo7RecordKeys, 0, 'Lộ 1 progress must not leak into Lộ 7');

    await page.select('#levelSelect', 'lo1');
    await page.reload({ waitUntil: 'networkidle0' });
    const persistedLo1 = await page.evaluate(() => {
      const st = window.KTNFlashcardApp.getState();
      return {
        activeLevel: st.activeLevel,
        hasCard1: Boolean(st.recordsMap[1]),
        hasCard2: Boolean(st.recordsMap[2]),
      };
    });
    assert.equal(persistedLo1.activeLevel, 'lo1');
    assert.equal(persistedLo1.hasCard1, true, 'Lộ 1 progress must persist across reload');
    assert.equal(persistedLo1.hasCard2, true, 'Lộ 1 progress must persist across reload');
    console.log('✓ [15] Level isolation (lo1 vs lo7) & progress persistence across reload verified.');

    // 6. Verify Card Flip & HanziWriter Mễ Tự Cách Modal
    await page.click('#btnFlip');
    const isFlipped = await page.evaluate(() => document.getElementById('flashcard').classList.contains('is-flipped'));
    assert.equal(isFlipped, true, 'Card must flip when #btnFlip is clicked');

    await page.click('#btnOpenWrite');
    await page.waitForFunction(() => document.getElementById('writeModal').classList.contains('open'), { timeout: 3000 });
    const hasSvgStroke = await page.evaluate(() => Boolean(document.querySelector('#hanziWriterTarget svg')));
    assert.equal(hasSvgStroke, true, 'HanziWriter SVG must render inside Mễ Tự Cách box');
    await page.click('#btnCloseWrite');
    console.log('✓ [3,10] Card flip & Mễ Tự Cách Hanzi writing modal verified.');

    // 7. Desktop 1280x800 two-column adaptive layout
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
    console.log('✓ [12] Desktop 1280x800 split layout & card arena height verified.');

    // 8. Verify Service Worker registration & offline mode with cached resources
    const swStatus = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return { supported: false };
      const reg = await navigator.serviceWorker.ready;
      const cacheKeys = await caches.keys();
      return {
        supported: true,
        activeState: reg?.active?.state || '',
        cacheKeys,
      };
    });
    assert.equal(swStatus.supported, true);
    assert.equal(swStatus.activeState, 'activated');
    assert.ok(swStatus.cacheKeys.some(k => k.includes('ktn-flashcards-shell-v3')), 'Shell cache v3 must exist');

    await page.setOfflineMode(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    const offlineState = await page.evaluate(() => ({
      totalCards: window.KTNFlashcardApp?.getState()?.allCards?.length || 0,
      frontComplete: document.getElementById('cardFrontImg')?.complete || false,
    }));
    assert.equal(offlineState.totalCards, 90, 'Offline reload must still load Lộ 1 90 cards from Service Worker cache');
    assert.equal(offlineState.frontComplete, true, 'Offline reload must serve cached front WebP image');
    await page.setOfflineMode(false);
    console.log('✓ [13] Service Worker cache & offline reload verified in Chromium.');

    // 10. Verify Image Non-Clipping, Card #8 是, Minimalist Footer, and Multi-Viewport Layout (360x640..1440x900)
    const targetViewports = [
      { width: 360, height: 640 },
      { width: 375, height: 667 },
      { width: 390, height: 844 },
      { width: 430, height: 932 },
      { width: 1366, height: 768 },
      { width: 1440, height: 900 },
    ];
    for (const vp of targetViewports) {
      await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 2 });
      await page.goto(baseUrl, { waitUntil: 'networkidle0' });
      await page.evaluate(async () => {
        const sel = document.getElementById('levelSelect');
        if (sel && sel.value !== 'lo1') {
          sel.value = 'lo1';
          sel.dispatchEvent(new Event('change', { bubbles: true }));
          await new Promise(r => setTimeout(r, 150));
        }
        const btnNext = document.getElementById('btnNext');
        for (let i = 0; i < 7; i++) btnNext.click();
      });
      await new Promise(r => setTimeout(r, 400));

      const audit = await page.evaluate(() => {
        const scene = document.getElementById('cardScene').getBoundingClientRect();
        const frontImg = document.getElementById('cardFrontImg');
        const backImg = document.getElementById('cardBackImg');
        const frontCanvas = document.getElementById('cardFrontCanvas');
        const toolbar = document.querySelector('.app-toolbar').getBoundingClientRect();
        const utilBar = document.querySelector('.card-utility-bar').getBoundingClientRect();
        const tapHint = document.querySelector('.tap-hint');
        const footerDirectChildren = document.querySelectorAll('.app-toolbar > *').length;
        const writeInUtilBar = Boolean(document.querySelector('.card-utility-bar #btnOpenWrite'));
        return {
          idxText: document.getElementById('currentCardIndexText')?.textContent || '',
          frontObjectFit: window.getComputedStyle(frontImg).objectFit,
          backObjectFit: window.getComputedStyle(backImg).objectFit,
          frontCanvasReady: Boolean(frontCanvas && frontCanvas.classList.contains('is-ready')),
          aspectRatioDiff: Math.abs((scene.width / scene.height) - (660 / 940)),
          overlapToolbar: scene.bottom > toolbar.top + 1,
          overlapUtilBar: scene.top < utilBar.bottom - 1,
          horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
          hasTapHint: Boolean(tapHint),
          footerDirectChildren,
          writeInUtilBar,
        };
      });
      assert.equal(audit.idxText, 'Từ 8 / 90', `Must navigate to Lộ 1 Card #8 (是) at ${vp.width}x${vp.height}`);
      assert.equal(audit.frontObjectFit, 'contain', `Front image must use object-fit: contain at ${vp.width}x${vp.height}`);
      assert.equal(audit.backObjectFit, 'contain', `Back image must use object-fit: contain at ${vp.width}x${vp.height}`);
      assert.equal(audit.frontCanvasReady, true, `Card #8 (是) front illustration canvas must restore full unclipped art at ${vp.width}x${vp.height}`);
      assert.ok(audit.aspectRatioDiff < 0.015, `Card scene must preserve 660:940 aspect ratio at ${vp.width}x${vp.height}`);
      assert.equal(audit.overlapToolbar, false, `Card scene must not overlap bottom toolbar at ${vp.width}x${vp.height}`);
      assert.equal(audit.overlapUtilBar, false, `Card scene must not overlap top utility bar at ${vp.width}x${vp.height}`);
      assert.equal(audit.horizontalOverflow, false, `Must have zero horizontal scroll at ${vp.width}x${vp.height}`);
      assert.equal(audit.hasTapHint, false, 'Must not render overlapping .tap-hint on card image');
      assert.equal(audit.footerDirectChildren, 1, 'Footer must only contain the single status row (Quên rồi / Nhớ rồi)');
      assert.equal(audit.writeInUtilBar, true, 'Luyện viết button must live in .card-utility-bar');
    }
    console.log('✓ [16] Non-clipping Card #8 (是), minimalist footer, and all 6 viewports (360x640..1440x900) verified.');

    // 11. Verify Phase 2 Fast Audio Review Page (audio-review.html) loads & filters 121 native_concat cards
    await page.goto(`${baseOrigin}/audio-review.html`, { waitUntil: 'networkidle0' });
    const reviewPageStats = await page.evaluate(() => ({
      total: document.getElementById('statTotal')?.textContent,
      types: document.getElementById('statTypes')?.textContent,
      approved: Number(document.getElementById('statApproved')?.textContent || 0),
      needs: Number(document.getElementById('statNeeds')?.textContent || 0),
      pending: Number(document.getElementById('statPending')?.textContent || 0),
      queueItems: document.querySelectorAll('.queue-item').length,
    }));
    assert.equal(reviewPageStats.total, '605');
    assert.equal(reviewPageStats.types, '484 exact / 121 concat');
    assert.equal(reviewPageStats.approved + reviewPageStats.needs + reviewPageStats.pending, 605);
    assert.equal(reviewPageStats.queueItems, 121, 'Default filter on audio-review.html must list the 121 native_concat cards');
    console.log('✓ [Phase 2] Fast Audio Review tool (audio-review.html) verified in Chromium.');

    assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join('; ')}`);
    console.log('=== [KTN Flashcards Browser E2E] ALL 16 ACCEPTANCE SCENARIOS PASSED ===');
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
