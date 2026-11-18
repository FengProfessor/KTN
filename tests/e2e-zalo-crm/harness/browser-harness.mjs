import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assertZeroHorizontalOverflow } from './assertions.mjs';
import { TEST_ENV_DEFAULTS } from './fixtures.mjs';
import { mintKtnSession } from './worker-client.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(__dirname, '../../..');
export const APP_ROOT = path.join(ROOT_DIR, 'apps', 'ktn-web-v2');
export const DEFAULT_ARTIFACTS_DIR = path.join(__dirname, '..', '.artifacts');

const pkgRequire = createRequire(path.join(APP_ROOT, 'package.json'));
const { chromium, request: pwRequest } = pkgRequire('@playwright/test');
const viteEsmPath = path.join(
  path.dirname(pkgRequire.resolve('vite/package.json')),
  'dist',
  'node',
  'index.js'
);

export { assertZeroHorizontalOverflow, pwRequest };

export function resolveBrowserExecutable() {
  try {
    const puppeteer = pkgRequire('puppeteer');
    const pPath = puppeteer.executablePath?.();
    if (pPath && fs.existsSync(pPath)) return pPath;
  } catch {
    // Fallback to OS candidates
  }

  const candidates = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium'
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return undefined;
}

export async function startViteTestServer({ envOverrides = {} } = {}) {
  if (!process.env.VITE_QA_PASS) {
    process.env.VITE_QA_PASS = TEST_ENV_DEFAULTS.KTN_STAFF_AND_TEST_PASSWORD;
  }
  for (const [k, v] of Object.entries(envOverrides)) {
    process.env[k] = String(v);
  }
  const { createServer } = await import(pathToFileURL(viteEsmPath).href);
  const tailwindcss = pkgRequire('tailwindcss');
  const autoprefixer = pkgRequire('autoprefixer');
  const twConfigMod = await import(pathToFileURL(path.join(APP_ROOT, 'tailwind.config.js')).href);
  const twConfig = {
    ...(twConfigMod.default || twConfigMod),
    content: [
      path.join(APP_ROOT, 'index.html'),
      path.join(APP_ROOT, 'src/**/*.{js,ts,jsx,tsx}')
    ]
  };
  const viteServer = await createServer({
    root: APP_ROOT,
    configFile: path.join(APP_ROOT, 'vite.config.ts'),
    css: {
      postcss: {
        plugins: [tailwindcss(twConfig), autoprefixer()]
      }
    },
    server: { port: 0, host: '127.0.0.1' },
    logLevel: 'error'
  });
  await viteServer.listen();
  const address = viteServer.httpServer.address();
  const port = typeof address === 'object' && address ? address.port : 5173;
  const baseUrl = `http://127.0.0.1:${port}`;
  return {
    viteServer,
    baseUrl,
    port,
    stop: async () => {
      await viteServer.close();
    }
  };
}

export async function launchBrowser(options = {}) {
  const executablePath = options.executablePath || resolveBrowserExecutable();
  return chromium.launch({
    headless: options.headless ?? true,
    executablePath,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu'
    ]
  });
}

export async function createDesktopContext(browser) {
  return browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'KTN-E2E-Desktop/1.0'
  });
}

export async function createMobileContext(browser) {
  return browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 KTN-E2E-Mobile/1.0'
  });
}

export function attachDiagnostics(page) {
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (err) => {
    pageErrors.push(err?.message || String(err));
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });
  return {
    pageErrors,
    consoleErrors,
    assertNoPageErrors() {
      if (pageErrors.length > 0) {
        throw new Error(`Uncaught pageerror(s): ${pageErrors.join(' | ')}`);
      }
    }
  };
}

export async function loginViaUi(page, baseUrl, { email, password, targetPath } = {}) {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
  const emailInput = page.locator('[data-testid="login-email-input"]');
  await emailInput.waitFor({ state: 'visible', timeout: 15000 });
  await emailInput.fill(email);
  await page.locator('[data-testid="login-password-input"]').fill(password);
  await page.locator('[data-testid="login-submit-btn"]').click();
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
  if (targetPath) {
    await page.goto(`${baseUrl}${targetPath.startsWith('/') ? '' : '/'}${targetPath}`, {
      waitUntil: 'domcontentloaded'
    });
  }
  return page;
}

export async function loginViaQuickButton(page, baseUrl, email, targetPath = null) {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
  const btn = page.locator(`[data-testid="quick-login-${email}"]`);
  await btn.waitFor({ state: 'visible', timeout: 15000 });
  await btn.click();
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
  if (targetPath) {
    await page.goto(`${baseUrl}${targetPath.startsWith('/') ? '' : '/'}${targetPath}`, {
      waitUntil: 'domcontentloaded'
    });
  }
  return page;
}

export async function seedAuthSession(
  pageOrContext,
  baseUrl,
  sessionPayload,
  secret = TEST_ENV_DEFAULTS.KTN_SESSION_SECRET
) {
  const token = sessionPayload.token || mintKtnSession(sessionPayload, secret);
  const stored = { ...sessionPayload, token };
  const context = typeof pageOrContext.addCookies === 'function'
    ? pageOrContext
    : pageOrContext.context();

  const u = new URL(baseUrl);
  await context.addCookies([
    {
      name: 'ktn_webapp_token',
      value: encodeURIComponent(token),
      domain: u.hostname,
      path: '/'
    }
  ]);

  await pageOrContext.addInitScript((serialized) => {
    try {
      localStorage.setItem('ktn_sll_persistent_auth_v2', serialized);
      sessionStorage.setItem('ktn_sll_persistent_auth_v2', serialized);
    } catch {
      // ignore storage errors on about:blank
    }
  }, JSON.stringify(stored));

  return stored;
}

export async function captureFailureScreenshot(page, testId, outDir = DEFAULT_ARTIFACTS_DIR) {
  fs.mkdirSync(outDir, { recursive: true });
  const safeId = String(testId || 'failure').replace(/[^a-zA-Z0-9_-]+/g, '_');
  const fullPath = path.join(outDir, `fail-${safeId}-${Date.now()}.png`);
  await page.screenshot({ path: fullPath, fullPage: true });
  return fullPath;
}

export async function startBrowserHarness(options = {}) {
  const server = await startViteTestServer(options);
  const browser = await launchBrowser(options);
  const contexts = [];
  let apiContext = null;

  async function openDesktopPage() {
    const ctx = await createDesktopContext(browser);
    contexts.push(ctx);
    const page = await ctx.newPage();
    const diag = attachDiagnostics(page);
    return { context: ctx, page, diag };
  }

  async function openMobilePage() {
    const ctx = await createMobileContext(browser);
    contexts.push(ctx);
    const page = await ctx.newPage();
    const diag = attachDiagnostics(page);
    return { context: ctx, page, diag };
  }

  async function getApiClient() {
    if (!apiContext) {
      apiContext = await pwRequest.newContext({ baseURL: server.baseUrl });
    }
    return apiContext;
  }

  async function close() {
    if (apiContext) {
      await apiContext.dispose().catch(() => {});
      apiContext = null;
    }
    for (const ctx of contexts) {
      await ctx.close().catch(() => {});
    }
    await browser.close().catch(() => {});
    await server.stop().catch(() => {});
  }

  return {
    ...server,
    browser,
    openDesktopPage,
    openMobilePage,
    getApiClient,
    close
  };
}

export async function withBrowserHarness(fn, options = {}) {
  const harness = await startBrowserHarness(options);
  try {
    return await fn(harness);
  } finally {
    await harness.close();
  }
}
