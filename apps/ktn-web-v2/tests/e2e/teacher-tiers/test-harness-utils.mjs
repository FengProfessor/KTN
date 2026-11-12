/**
 * Shared Test Harness Utilities for KTN Teacher Management 4-Tier E2E Suite
 * Features:
 *   - Local Vite Dev Server with embedded Cloudflare Worker BFF lifecycle
 *   - Headless Edge/Chrome browser launch via Playwright
 *   - Viewport configuration (Desktop 1440x900, Mobile 390x844 with touch)
 *   - Authentication helpers (Admin, Teacher, Student)
 *   - Direct API request helper with HMAC session signing
 *   - DOM assertion, zero-overflow check, and structured reporting
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createServer } from 'vite';
import { chromium, request as playwrightRequest } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const APP_ROOT = path.resolve(__dirname, '../../..');
export const REPO_ROOT = path.resolve(APP_ROOT, '../..');
export const SCREENSHOT_DIR = path.join(REPO_ROOT, 'docs/ui-v2/screenshots/teacher-tiers');
export const REPORT_DIR = path.join(REPO_ROOT, 'docs/ui-v2');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const require = createRequire(import.meta.url);

/**
 * Resolves local browser executable (Microsoft Edge or Google Chrome)
 */
export function resolveBrowserExecutable() {
  try {
    const puppeteer = require('puppeteer');
    const pPath = puppeteer.executablePath();
    if (pPath && fs.existsSync(pPath)) return pPath;
  } catch {
    // fallback
  }

  const candidates = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return undefined;
}

/**
 * Boots the Vite dev server with embedded Cloudflare Worker plugin on a dynamic port
 */
export async function startTestServer() {
  const viteServer = await createServer({
    root: APP_ROOT,
    configFile: path.join(APP_ROOT, 'vite.config.ts'),
    server: { port: 0, host: '127.0.0.1' },
    logLevel: 'error',
  });
  await viteServer.listen();
  const address = viteServer.httpServer.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  return { viteServer, baseUrl, port: address.port };
}

/**
 * Stops the Vite server cleanly
 */
export async function stopTestServer(viteServer) {
  if (viteServer) {
    await viteServer.close();
  }
}

/**
 * Launches the headless browser via Playwright
 */
export async function launchTestBrowser() {
  const executablePath = resolveBrowserExecutable();
  return await chromium.launch({
    headless: true,
    executablePath,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });
}

/**
 * Creates a standard Desktop context (1440x900)
 */
export async function createDesktopContext(browser) {
  return await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'KTN-E2E-Desktop-Runner/1.0',
  });
}

/**
 * Creates a standard Mobile context (390x844, Touch enabled)
 */
export async function createMobileContext(browser) {
  return await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 KTN-E2E-Mobile/1.0',
  });
}

/**
 * Logs in as Admin via quick-login button and navigates to Admin Workspace
 */
export async function loginAdmin(page, baseUrl) {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
  const quickLoginBtn = page.locator('[data-testid="quick-login-quanly@khongtunhi.com"]');
  await quickLoginBtn.waitFor({ state: 'visible', timeout: 10000 });
  await quickLoginBtn.click();

  // Wait for login redirection away from /login
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 10000 });

  // Navigate to /admin workspace
  await page.goto(`${baseUrl}/admin`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="admin-workspace-page"]', { timeout: 10000 });
  return page;
}

/**
 * Logs in as Student via quick-login button
 */
export async function loginStudent(page, baseUrl, email = 'hoangngan@khongtunhi.com') {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
  const quickLoginBtn = page.locator(`[data-testid="quick-login-${email}"]`);
  await quickLoginBtn.waitFor({ state: 'visible', timeout: 10000 });
  await quickLoginBtn.click();
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 10000 });
  return page;
}

/**
 * Logs in as Teacher via quick-login button
 */
export async function loginTeacher(page, baseUrl, email = 'linh.lam@khongtunhi.com') {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
  const quickLoginBtn = page.locator(`[data-testid="quick-login-${email}"]`);
  await quickLoginBtn.waitFor({ state: 'visible', timeout: 10000 });
  await quickLoginBtn.click();
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 10000 });
  return page;
}

/**
 * Signs an HMAC-SHA256 session token conforming to Cloudflare Worker format
 */
export async function signTestSessionToken(payload, secret = 'ktn-v2-local-hmac-secret-2026') {
  const jti = payload.jti || ('sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10));
  const data = {
    ...payload,
    jti,
    iat: Date.now(),
    exp: Date.now() + 30 * 86400 * 1000,
  };
  const bodyB64 = Buffer.from(JSON.stringify(data)).toString('base64url');
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(bodyB64));
  const sigB64 = Buffer.from(sigBuf).toString('base64url');
  return `${bodyB64}.${sigB64}`;
}

let sharedApiContext = null;
export async function getApiContext() {
  if (!sharedApiContext) {
    sharedApiContext = await playwrightRequest.newContext();
  }
  return sharedApiContext;
}

/**
 * Helper to call local backend endpoints directly via Playwright request context
 */
export async function apiCall(baseUrl, endpoint, options = {}) {
  const url = `${baseUrl}${endpoint}`;
  const api = await getApiContext();
  const method = (options.method || 'GET').toLowerCase();
  const headers = { ...(options.headers || {}) };
  const res = await api.fetch(url, {
    method,
    headers,
    data: options.body,
    failOnStatusCode: false,
  });
  let json = null;
  const text = await res.text();
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return {
    status: res.status(),
    ok: res.ok(),
    headers: res.headers(),
    json,
    text,
  };
}

/**
 * Checks that the page has zero horizontal overflow (390px mobile invariant)
 */
export async function checkZeroHorizontalOverflow(page) {
  return await page.evaluate(() => {
    const docWidth = document.documentElement.clientWidth;
    const scrollWidth = document.documentElement.scrollWidth;
    const bodyWidth = document.body ? document.body.scrollWidth : 0;
    return Math.max(scrollWidth, bodyWidth) <= docWidth + 2;
  });
}

/**
 * Captures screenshot on failure
 */
export async function captureFailureScreenshot(page, testId) {
  try {
    const filename = `fail-${testId}-${Date.now()}.png`;
    const fullPath = path.join(SCREENSHOT_DIR, filename);
    await page.screenshot({ path: fullPath, fullPage: true });
    return fullPath;
  } catch {
    return null;
  }
}

/**
 * Text normalizer for accent-insensitive comparison
 */
export function normalizeVietnameseText(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9@._\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Strict assertion helper
 */
export function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

/**
 * Structured test record helper
 */
export function recordResult(results, tier, id, title, passed, details = '', error = null) {
  const record = {
    tier,
    id,
    title,
    passed,
    details: details || (error ? error.message : ''),
    timestamp: new Date().toISOString(),
  };
  results.push(record);
  const icon = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`  ${icon} [${id}] ${title}${details ? ` (${details})` : ''}`);
  if (error && !passed) {
    console.error(`      Error: ${error.stack || error.message}`);
  }
  return record;
}
