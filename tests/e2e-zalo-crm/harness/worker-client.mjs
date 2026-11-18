import { AsyncLocalStorage } from 'node:async_hooks';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { TEST_ENV_DEFAULTS } from './fixtures.mjs';
import { createSupabasePgliteHarness, ROOT_DIR } from './pglite-supabase.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKER_PROXY_PATH = path.join(ROOT_DIR, 'cloudflare-worker-sw-proxy.js');
const CONSULTATION_WORKER_PATH = path.join(ROOT_DIR, 'consultation-worker.mjs');

export const DEFAULT_TEST_ENV = Object.freeze({ ...TEST_ENV_DEFAULTS });

const workerFetchAls = new AsyncLocalStorage();
let globalFetchPatched = false;
const originalGlobalFetch = globalThis.fetch;

function ensureGlobalFetchAlsDispatcher() {
  if (globalFetchPatched) return;
  globalFetchPatched = true;
  globalThis.fetch = function ktnTestFetchDispatcher(input, init) {
    const activeFetch = workerFetchAls.getStore();
    if (typeof activeFetch === 'function') {
      return activeFetch(input, init);
    }
    return originalGlobalFetch.call(globalThis, input, init);
  };
}

export function zaloSign(appId, rawData, timeStamp, appSecret) {
  const rawStr = typeof rawData === 'string' ? rawData : JSON.stringify(rawData);
  return crypto
    .createHash('sha256')
    .update(`${String(appId)}${rawStr}${String(timeStamp)}${String(appSecret)}`)
    .digest('hex');
}

export function metaSign(rawBody, appSecret) {
  const rawStr = typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody);
  return 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawStr).digest('hex');
}

export function sepayHeaders(apiKey = DEFAULT_TEST_ENV.KTN_SEPAY_API_KEY) {
  return {
    Authorization: `Apikey ${apiKey}`,
    'Content-Type': 'application/json'
  };
}

export function mintWebTicket({
  id = crypto.randomUUID(),
  scope = 'web',
  secret = DEFAULT_TEST_ENV.KTN_CONSULTATION_SECRET,
  ttlMs = (scope === 'web' ? 30 : 7) * 86400000
} = {}) {
  const expiry = String(Date.now() + ttlMs);
  const payload = `${scope}.${id}.${expiry}`;
  const macHex = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return `${payload}.${macHex}`;
}

export function mintKtnSession(payload = {}, secret = DEFAULT_TEST_ENV.KTN_SESSION_SECRET) {
  const nowMs = Date.now();
  const data = {
    jti: payload.jti || `sess_${nowMs}_${crypto.randomUUID().slice(0, 8)}`,
    iat: nowMs,
    exp: nowMs + 30 * 86400 * 1000,
    ...payload
  };
  const bodyB64 = Buffer.from(JSON.stringify(data), 'utf8').toString('base64url');
  const sigB64 = crypto.createHmac('sha256', secret).update(bodyB64).digest('base64url');
  return `${bodyB64}.${sigB64}`;
}

export function mintSupabaseJwt({
  email,
  sub = crypto.randomUUID(),
  role = 'authenticated',
  email_confirmed_at = new Date().toISOString(),
  exp,
  iat,
  ttlSec = 3600,
  ttlMs,
  secret = 'test-supabase-jwt-secret'
}) {
  const normEmail = String(email || '').trim().toLowerCase();
  const nowSec = Math.floor(Date.now() / 1000);
  const iatSec = typeof iat === 'number' ? iat : nowSec;
  const expSec =
    typeof exp === 'number'
      ? exp
      : typeof ttlMs === 'number'
        ? Math.floor((Date.now() + ttlMs) / 1000)
        : nowSec + ttlSec;
  const headerB64 = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' }), 'utf8').toString('base64url');
  const payloadB64 = Buffer.from(
    JSON.stringify({
      sub,
      email: normEmail,
      role,
      email_confirmed_at,
      iat: iatSec,
      exp: expSec
    }),
    'utf8'
  ).toString('base64url');
  const sigB64 = crypto.createHmac('sha256', secret).update(`${headerB64}.${payloadB64}`).digest('base64url');
  return `${headerB64}.${payloadB64}.${sigB64}`;
}

export function loadWorkerInstance({ fetchImpl }) {
  ensureGlobalFetchAlsDispatcher();
  let source = fs.readFileSync(WORKER_PROXY_PATH, 'utf8');
  source = source.replace(/export\s+default\s+\{/, 'module.exports = {');
  source = source.replace(
    /\bimport\s*\(\s*(['"]\.\/[^'"]+\.m?js['"])\s*\)/g,
    '__ktnDynamicImport($1)'
  );
  source += '\nif (typeof consultationDependencies !== "undefined") { module.exports.__consultationDependencies = consultationDependencies; }\n';

  const moduleObj = { exports: {} };
  const sandbox = {
    module: moduleObj,
    exports: moduleObj.exports,
    fetch: fetchImpl,
    Request,
    Response,
    Headers,
    URL,
    URLSearchParams,
    TextEncoder,
    TextDecoder,
    atob,
    btoa,
    crypto: globalThis.crypto || crypto.webcrypto,
    AbortController,
    AbortSignal,
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Date,
    Math,
    JSON,
    Object,
    Array,
    ArrayBuffer,
    Uint8Array,
    Uint32Array,
    Int32Array,
    DataView,
    String,
    Number,
    Boolean,
    RegExp,
    Map,
    Set,
    Promise,
    Error,
    TypeError,
    encodeURIComponent,
    decodeURIComponent,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    __ktnDynamicImport: (specifier) => {
      const target = path.resolve(ROOT_DIR, specifier);
      return import(pathToFileURL(target).href);
    }
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'cloudflare-worker-sw-proxy.js' });
  return sandbox.module.exports;
}

async function parseWorkerResponse(response) {
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return {
    status: response.status,
    ok: response.ok,
    headers: response.headers,
    text,
    json
  };
}

export async function createTestWorld({
  mode = 'sandbox',
  envOverrides = {},
  ...pgliteOpts
} = {}) {
  const normalizedMode = mode === 'live_auth' ? 'live-auth' : mode;
  const pgliteSupabase = await createSupabasePgliteHarness(pgliteOpts);
  const worker = loadWorkerInstance({ fetchImpl: pgliteSupabase.fetch });

  let rateLimitAllow = true;
  const env = {
    ...DEFAULT_TEST_ENV,
    ...(normalizedMode === 'sandbox'
      ? {
          KTN_ZALO_SANDBOX: 'true',
          KTN_AI_SANDBOX: 'true',
          KTN_SEPAY_SANDBOX: 'true',
          KTN_GEMINI_KEYS: ''
        }
      : {
          KTN_ZALO_SANDBOX: 'false',
          KTN_AI_SANDBOX: 'false',
          KTN_SEPAY_SANDBOX: 'false'
        }),
    KTN_CONSULTATION_LIMIT: {
      limit: async () => ({ success: rateLimitAllow })
    },
    ...envOverrides
  };

  const pendingTasks = [];
  function createCtx() {
    return {
      waitUntil(promise) {
        const p = Promise.resolve(promise).catch(() => {});
        pendingTasks.push(p);
        return p;
      },
      passThroughOnException() {}
    };
  }

  async function drainPendingTasks() {
    while (pendingTasks.length) {
      const batch = pendingTasks.splice(0, pendingTasks.length);
      await Promise.allSettled(batch);
    }
  }

  function buildRequest(targetPath, options = {}) {
    const {
      method = 'GET',
      headers = {},
      body,
      json,
      token,
      cookie
    } = options;
    const urlStr = /^https?:\/\//i.test(targetPath)
      ? targetPath
      : `${env.KTN_CONSULTATION_PUBLIC_URL.replace(/\/$/, '')}${targetPath.startsWith('/') ? '' : '/'}${targetPath}`;
    const hdrs = new Headers(headers);
    if (token && !hdrs.has('Authorization')) {
      hdrs.set('Authorization', token.startsWith('Bearer ') || token.startsWith('Apikey ') ? token : `Bearer ${token}`);
    }
    if (cookie && !hdrs.has('Cookie')) {
      hdrs.set('Cookie', cookie);
    }
    let reqBody = body;
    if (json !== undefined) {
      reqBody = JSON.stringify(json);
      if (!hdrs.has('Content-Type')) hdrs.set('Content-Type', 'application/json');
    }
    return new Request(urlStr, {
      method: method.toUpperCase(),
      headers: hdrs,
      body: ['GET', 'HEAD'].includes(method.toUpperCase()) ? undefined : reqBody
    });
  }

  async function request(targetPath, options = {}) {
    const { awaitBackground = true } = options;
    const req = buildRequest(targetPath, options);
    const ctx = createCtx();
    const res = await workerFetchAls.run(pgliteSupabase.fetch, async () => {
      const response = await worker.fetch(req, env, ctx);
      if (awaitBackground) await drainPendingTasks();
      return response;
    });
    return parseWorkerResponse(res);
  }

  async function scheduled(cron = '*/5 * * * *', scheduledTime = Date.now()) {
    const ctx = createCtx();
    await workerFetchAls.run(pgliteSupabase.fetch, async () => {
      await worker.scheduled({ cron, scheduledTime }, env, ctx);
      await drainPendingTasks();
    });
  }

  async function callConsultationDirect(targetPath, options = {}) {
    const { awaitBackground = true } = options;
    const req = buildRequest(targetPath, options);
    const ctx = createCtx();
    const mod = await import(pathToFileURL(CONSULTATION_WORKER_PATH).href);
    const deps = worker.__consultationDependencies;
    const res = await workerFetchAls.run(pgliteSupabase.fetch, async () => {
      const response = await mod.handleConsultation(req, env, ctx, deps);
      if (awaitBackground) await drainPendingTasks();
      return response;
    });
    return parseWorkerResponse(res);
  }

  async function postZaloEvent(payload, { sign = true, sandbox = false, path: routePath } = {}) {
    const rawBody = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const ts = String(payload?.timestamp || Date.now());
    const headers = { 'Content-Type': 'application/json' };
    if (sign) {
      headers['X-ZEvent-Signature'] = zaloSign(env.KTN_ZALO_APP_ID, rawBody, ts, env.KTN_ZALO_APP_SECRET);
      headers['X-ZEvent-Timestamp'] = ts;
    }
    if (sandbox) {
      headers['X-KTN-Sandbox'] = 'true';
    }
    const target = routePath || (sandbox ? '/api/ktn/consultations/zalo/sandbox/event' : '/api/ktn/consultations/zalo');
    return request(target, { method: 'POST', headers, body: rawBody });
  }

  async function postSepay(payload, { apiKey = env.KTN_SEPAY_API_KEY, path: routePath = '/api/ktn/consultations/sepay' } = {}) {
    const headers = apiKey ? sepayHeaders(apiKey) : { 'Content-Type': 'application/json' };
    return request(routePath, { method: 'POST', headers, json: payload });
  }

  async function startWebChat() {
    const res = await request('/api/ktn/consultations/web/start', { method: 'POST' });
    return { ...res, token: res.json?.token || null };
  }

  async function sendWebMessage(ticketToken, body, requestId = crypto.randomUUID()) {
    return request('/api/ktn/consultations/web/message', {
      method: 'POST',
      token: ticketToken,
      json: { requestId, body }
    });
  }

  async function staffReq(subPath, { actor, method = 'GET', json, body, headers = {}, authType = 'ktn-session' } = {}) {
    const cleanSub = subPath.startsWith('/') ? subPath : `/api/ktn/consultations/${subPath}`;
    let token = null;
    if (actor) {
      if (authType === 'supabase-jwt') {
        const reg = pgliteSupabase.registerJwtUser({ email: actor.email });
        token = reg.access_token;
      } else {
        token = mintKtnSession(
          {
            email: actor.email,
            name: actor.name,
            role: actor.role || (actor.admin ? 'admin' : 'advisor')
          },
          env.KTN_SESSION_SECRET
        );
      }
    }
    return request(cleanSub, { method, json, body, headers, token });
  }

  const mocks = {
    get upstreamCalls() {
      return pgliteSupabase.upstreamCalls;
    },
    get faults() {
      return pgliteSupabase.faults;
    },
    get izteach() {
      return pgliteSupabase.izteach;
    },
    setFaults(patch) {
      pgliteSupabase.setFaults(patch);
    },
    clearFaults() {
      pgliteSupabase.clearFaults();
    },
    clearUpstreamCalls() {
      pgliteSupabase.clearUpstreamCalls();
    },
    registerJwtUser(user) {
      return pgliteSupabase.registerJwtUser(user);
    },
    setRateLimitAllowed(allowed) {
      rateLimitAllow = Boolean(allowed);
    }
  };

  async function close() {
    await drainPendingTasks();
    await pgliteSupabase.close();
  }

  return {
    db: pgliteSupabase.db,
    env,
    pgliteSupabase,
    worker,
    request,
    fetchWorker: request,
    scheduled,
    runCron: scheduled,
    callConsultationDirect,
    postZaloEvent,
    postSepay,
    startWebChat,
    sendWebMessage,
    staffReq,
    zaloSign,
    metaSign,
    sepayHeaders,
    mintWebTicket,
    mintKtnSession,
    mintSupabaseJwt,
    mocks,
    getMocks: () => mocks,
    reset: () => pgliteSupabase.reset(),
    cleanup: close,
    close
  };
}
