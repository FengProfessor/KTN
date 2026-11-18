import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { MAX_VITE_CHUNK_BYTES, PROTECTED_V1_PAGE_ID } from './fixtures.mjs';

const FORBIDDEN_AI_PRICE_LINK_RE =
  /https?:|www\.|(?:\d[\d., ]*)\s*(?:đồng|vnd|vnđ|₫|đ(?=$|[^\p{L}\p{N}_])|k(?=$|[^\p{L}\p{N}_])|triệu|nghìn)|giảm\s+\d|\d\s*%/iu;

const UNVERIFIED_ADULT_CLAIMS_RE =
  /80%\s*thực\s*hành|đầu\s*ra\s*sau\s*8\s*buổi|rút\s*ngắn\s*một\s*nửa\s*thời\s*gian/i;

const RAW_EMAIL_RE = /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/;
const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const RAW_PHONE_RE = /(?<=^|[^\p{L}\p{N}_])(?:\+?84|0)(?:[ .-]*\d){8,11}\b/u;
const RAW_URL_RE = /https?:\/\/\S+/i;

const SECRET_PATTERNS = [
  { name: 'GOOGLE_API_KEY', re: /AIza[0-9A-Za-z_-]{25,}/ },
  { name: 'RESEND_API_KEY', re: /\bre_[0-9A-Za-z_]{16,}/ },
  { name: 'SUPABASE_SECRET_KEY', re: /\bsb_secret_[0-9A-Za-z_-]+/ },
  { name: 'OPENAI_STYLE_KEY', re: /\bsk-[0-9A-Za-z]{20,}/ },
  { name: 'META_ACCESS_TOKEN', re: /\bEAA[0-9A-Za-z]{20,}/ },
  { name: 'PRIVATE_KEY_BLOCK', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'INLINE_ENV_ASSIGNMENT', re: /\b(?:SUPABASE_SERVICE_ROLE_KEY|KTN_GEMINI_KEYS|KTN_ZALO_APP_SECRET|KTN_ZALO_OA_ACCESS_TOKEN|KTN_SEPAY_API_KEY|KTN_CONSULTATION_MAIL_KEY|KTN_SESSION_SECRET|KTN_CONSULTATION_SECRET)[ \t]*=[ \t]*['"]?[A-Za-z0-9_.-]{10,}/ }
];

const PUBLIC_DOTENV_KEYS = new Set([
  'SUPABASE_URL',
  'IZTEACH_VENDOR_ID',
  'IZTEACH_CLOUDFRONT_ORIGIN',
  'IZTEACH_API_BASE',
  'IZTEACH_CUSTOM_PAGE_API_BASE',
  'IZTEACH_AUTH_API_BASE',
  'KTN_CONSULTATION_PUBLIC_URL',
  'KTN_CONSULTATION_MAIL_FROM',
  'KTN_GEMINI_MODEL',
  'KTN_GEMINI_FALLBACK_MODELS',
  'KTN_META_GRAPH_VERSION',
  'KTN_SEPAY_BANK_ID',
  'KTN_SEPAY_ACCOUNT_NAME',
  'VAPID_PUBLIC_KEY',
  'VITE_VAPID_PUBLIC_KEY',
  'KTN_E2E_STUDENT_A_EMAIL',
  'KTN_E2E_STUDENT_B_EMAIL',
  'KTN_E2E_TEACHER_A_EMAIL',
  'KTN_E2E_TEACHER_B_EMAIL'
]);

export function assertHttpStatus(res, expectedStatus, label = 'HTTP response') {
  const actual = res?.status;
  const allowed = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
  if (!allowed.includes(actual)) {
    const bodyPreview =
      typeof res?.text === 'string'
        ? res.text.slice(0, 300)
        : res?.json
          ? JSON.stringify(res.json).slice(0, 300)
          : '';
    assert.fail(`${label}: expected status ${allowed.join(' or ')}, got ${actual}. Body: ${bodyPreview}`);
  }
}

export function assertNoForbiddenAiText(text, label = 'AI text') {
  const input = String(text || '');
  assert.equal(
    FORBIDDEN_AI_PRICE_LINK_RE.test(input),
    false,
    `${label} must not contain raw prices, discounts, or URLs: ${input.slice(0, 200)}`
  );
  assert.equal(
    UNVERIFIED_ADULT_CLAIMS_RE.test(input),
    false,
    `${label} must not contain unverified Adult 1:1 claims: ${input.slice(0, 200)}`
  );
}

export function assertPiiRedacted(text, rawValues = [], label = 'Redacted text') {
  const input = String(text || '');
  const phoneScanInput = input.replace(UUID_RE, ' ');
  assert.equal(RAW_EMAIL_RE.test(input), false, `${label} still contains raw email address`);
  assert.equal(RAW_PHONE_RE.test(phoneScanInput), false, `${label} still contains raw phone number`);
  assert.equal(RAW_URL_RE.test(input), false, `${label} still contains raw URL`);
  for (const raw of rawValues) {
    if (!raw) continue;
    assert.equal(
      input.includes(String(raw)),
      false,
      `${label} still contains sensitive raw fragment`
    );
  }
}

function unescapeDoubleQuotedDotEnv(str) {
  return str.replace(/\\([nrt"'\\])/g, (_, ch) => {
    if (ch === 'n') return '\n';
    if (ch === 'r') return '\r';
    if (ch === 't') return '\t';
    return ch;
  });
}

function readDotEnvEntriesInMemory(dotEnvPath) {
  if (!fs.existsSync(dotEnvPath)) return [];
  const raw = fs.readFileSync(dotEnvPath, 'utf8');
  const lines = raw.split(/\r?\n/);
  const entries = [];

  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).replace(/^\s*export\s+/, '').trim();
    const rest = trimmed.slice(idx + 1).trimStart();
    if (!key || PUBLIC_DOTENV_KEYS.has(key) || !rest) continue;

    let rawInner = '';
    let quote = '';
    if (rest[0] === '"' || rest[0] === "'") {
      quote = rest[0];
      let buf = rest.slice(1);
      let closeIdx = -1;
      while (closeIdx === -1) {
        if (quote === "'") {
          closeIdx = buf.indexOf("'");
        } else {
          for (let j = 0; j < buf.length; j += 1) {
            if (buf[j] === '\\') {
              j += 1;
              continue;
            }
            if (buf[j] === '"') {
              closeIdx = j;
              break;
            }
          }
        }
        if (closeIdx !== -1) break;
        if (i + 1 >= lines.length) {
          closeIdx = buf.length;
          break;
        }
        i += 1;
        buf += `\n${lines[i]}`;
      }
      rawInner = buf.slice(0, closeIdx);
    } else {
      rawInner = rest.startsWith('#') ? '' : rest.replace(/\s+#.*$/, '').trim();
    }

    const candidates = [rawInner];
    if (quote === '"') {
      const unescaped = unescapeDoubleQuotedDotEnv(rawInner);
      if (unescaped !== rawInner) candidates.push(unescaped);
    }
    const primaryVal = candidates[candidates.length - 1];
    if (primaryVal.length < 12 && rawInner.length < 12) continue;
    if (/^(true|false|full|pilot|https?:\/\/)/i.test(primaryVal)) continue;

    const uniqueCandidates = Array.from(new Set(candidates.filter((c) => c.length >= 12)));
    if (uniqueCandidates.length > 0) {
      entries.push({ key, val: primaryVal, candidates: uniqueCandidates });
    }
  }
  return entries;
}

function collectStringLeaves(value, out = [], seen = new Set()) {
  if (typeof value === 'string') {
    out.push(value);
    return out;
  }
  if (!value || typeof value !== 'object' || seen.has(value)) return out;
  seen.add(value);
  if (value instanceof Error) {
    if (typeof value.message === 'string') out.push(value.message);
    if (typeof value.stack === 'string') out.push(value.stack);
    if (value.cause !== undefined) collectStringLeaves(value.cause, out, seen);
    if (Array.isArray(value.errors)) {
      for (const errItem of value.errors) collectStringLeaves(errItem, out, seen);
    }
  }
  if (value instanceof Map) {
    for (const [k, v] of value.entries()) {
      collectStringLeaves(k, out, seen);
      collectStringLeaves(v, out, seen);
    }
  }
  if (value instanceof Set) {
    for (const item of value.values()) {
      collectStringLeaves(item, out, seen);
    }
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStringLeaves(item, out, seen);
  } else {
    for (const [k, v] of Object.entries(value)) {
      out.push(k);
      collectStringLeaves(v, out, seen);
    }
  }
  return out;
}

export function assertNoSecretLeaks(payloadOrText, options = {}) {
  const {
    checkDotEnv = true,
    rootDir = process.cwd(),
    label = 'Output'
  } = options;
  let serialized = '';
  if (typeof payloadOrText === 'string') {
    serialized = payloadOrText;
  } else {
    try {
      serialized = JSON.stringify(payloadOrText ?? '') || '';
    } catch {
      serialized = '';
    }
  }
  const leaves = typeof payloadOrText === 'string' ? [payloadOrText] : collectStringLeaves(payloadOrText);

  for (const { name, re } of SECRET_PATTERNS) {
    const matched = re.test(serialized) || leaves.some((leaf) => re.test(leaf));
    assert.equal(
      matched,
      false,
      `${label} leaked secret pattern [${name}]`
    );
  }

  if (checkDotEnv) {
    const dotEnvPath = path.join(rootDir, '.env');
    const entries = readDotEnvEntriesInMemory(dotEnvPath);
    for (const { key, val, candidates } of entries) {
      const candidateForms = Array.isArray(candidates) ? candidates : [val];
      const parts = new Set();
      for (const form of candidateForms) {
        if (key.includes('KEYS')) {
          for (const seg of form.split(',').map((s) => s.trim()).filter((s) => s.length >= 12)) {
            parts.add(seg);
          }
        } else if (form.length >= 12) {
          parts.add(form);
        }
      }
      for (const secretPart of parts) {
        const escapedPart = JSON.stringify(secretPart).slice(1, -1);
        const leaked =
          serialized.includes(secretPart) ||
          serialized.includes(escapedPart) ||
          leaves.some((leaf) => leaf.includes(secretPart) || leaf.includes(escapedPart));
        assert.equal(
          leaked,
          false,
          `${label} leaked value belonging to .env variable [${key}]`
        );
      }
    }
  }
}

export function assertSafeStaffThreadResponse(json, options = {}) {
  const { isAdmin = false } = options;
  assert.ok(json && typeof json === 'object', 'Staff thread payload must be an object');
  assert.ok(json.conversation && typeof json.conversation === 'object', 'Staff thread must include conversation');
  assert.equal(
    Object.prototype.hasOwnProperty.call(json.conversation, 'external_id'),
    false,
    'Staff thread conversation must strip external_id'
  );
  if (!isAdmin) {
    assert.deepEqual(json.flags || [], [], 'Non-admin advisor must not receive AI quality flags');
  }
}

const FORBIDDEN_CUSTOMER_THREAD_KEYS = [
  'flags',
  'external_id',
  'prompt_tokens',
  'completion_tokens',
  'ai_debug',
  'system_prompt',
  'internal_notes',
  'internal_note',
  'staff_notes',
  'notes',
  'is_internal'
];

function assertNoForbiddenCustomerKeys(obj, locationLabel) {
  if (!obj || typeof obj !== 'object') return;
  for (const key of FORBIDDEN_CUSTOMER_THREAD_KEYS) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(obj, key) && obj[key] !== undefined,
      false,
      `${locationLabel} must not expose ${key}`
    );
  }
}

export function assertSafeCustomerThreadResponse(json) {
  assert.ok(json && typeof json === 'object', 'Customer thread payload must be an object');
  assertNoForbiddenCustomerKeys(json, 'Customer thread');
  for (const nestedKey of ['conversation', 'thread']) {
    const nested = json[nestedKey];
    if (nested && typeof nested === 'object') {
      assertNoForbiddenCustomerKeys(nested, `Customer thread ${nestedKey}`);
    }
  }
  const messageArrays = [];
  const seenArrays = new Set();
  for (const candidate of [json.messages, json.conversation?.messages, json.thread?.messages]) {
    if (Array.isArray(candidate) && !seenArrays.has(candidate)) {
      seenArrays.add(candidate);
      messageArrays.push(candidate);
    }
  }
  assert.ok(messageArrays.length > 0, 'Customer thread payload must include messages array');
  for (const messages of messageArrays) {
    for (const msg of messages) {
      assert.notEqual(msg?.sender, 'note', 'Customer thread must not expose internal note messages');
      assert.notEqual(msg?.delivery, 'internal', 'Customer thread must not expose internal delivery messages');
      assert.notEqual(msg?.visibility, 'internal', 'Customer thread must not expose internal visibility messages');
      assert.notEqual(msg?.type, 'note', 'Customer thread must not expose note type messages');
      assertNoForbiddenCustomerKeys(msg || {}, 'Customer thread message');
    }
  }
}

export function assertVietQrPayment(payment, expectedOrderId, expectedAmount, expectedAccountNo) {
  assert.ok(payment && typeof payment === 'object', 'payment object is required');
  assert.ok(
    typeof payment.qrUrl === 'string' && payment.qrUrl.startsWith('https://img.vietqr.io/image/'),
    `Expected VietQR img.vietqr.io URL, got ${payment.qrUrl}`
  );
  assert.equal(payment.transferContent, `KTN ${expectedOrderId}`);
  if (expectedAmount !== undefined) {
    assert.equal(Number(payment.amount), Number(expectedAmount));
  }
  if (expectedAccountNo !== undefined) {
    assert.equal(String(payment.accountNo || payment.accountNumber), String(expectedAccountNo));
  }
}

function listJsFilesRecursive(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listJsFilesRecursive(full));
    else if (entry.isFile() && /\.(?:m?js)$/.test(entry.name)) out.push(full);
  }
  return out;
}

export function assertViteBundleBudget(distDir, maxBytes = MAX_VITE_CHUNK_BYTES) {
  const assetsDir = path.join(distDir, 'assets');
  const jsFiles = listJsFilesRecursive(assetsDir);
  assert.ok(jsFiles.length > 0, `No built JS chunks found under ${assetsDir}`);
  let maxChunkBytes = 0;
  let maxChunkFile = '';
  for (const file of jsFiles) {
    const size = fs.statSync(file).size;
    if (size > maxChunkBytes) {
      maxChunkBytes = size;
      maxChunkFile = path.relative(distDir, file);
    }
    assert.ok(
      size <= maxBytes,
      `Vite chunk ${path.relative(distDir, file)} is ${size} bytes (limit ${maxBytes} bytes)`
    );
  }
  return { totalChunks: jsFiles.length, maxChunkBytes, maxChunkFile };
}

const V1_PROTECTED_FILES = [
  'deploy_so_lien_lac_live.cjs',
  'index.html',
  'portal_template.html',
  'ktn_global_auth_hook.js',
  'sll-hocsinh.html',
  'sll-teacher.html',
  'so-lien-lac.html'
];

export function assertV1Isolation({
  rootDir,
  baseRef = 'feat/ktn-react-ui-v2',
  v1Html = null,
  v2Html = null,
  checkSwParity = true
} = {}) {
  assert.ok(rootDir, 'rootDir is required for assertV1Isolation');

  // 1. Verify deploy_ktn_react_v2_izteach.cjs still protects V1 page ID
  const deployV2Path = path.join(rootDir, 'deploy_ktn_react_v2_izteach.cjs');
  if (fs.existsSync(deployV2Path)) {
    const deploySrc = fs.readFileSync(deployV2Path, 'utf8');
    assert.ok(
      deploySrc.includes(PROTECTED_V1_PAGE_ID),
      `Protected V1 page ID ${PROTECTED_V1_PAGE_ID} missing from deploy_ktn_react_v2_izteach.cjs`
    );
  }

  // 2. Verify SW parity (root sw.js === apps/ktn-web-v2/public/sw.js)
  if (checkSwParity) {
    const swRoot = path.join(rootDir, 'sw.js');
    const swPublic = path.join(rootDir, 'apps', 'ktn-web-v2', 'public', 'sw.js');
    assert.ok(fs.existsSync(swRoot), 'Missing root sw.js');
    assert.ok(fs.existsSync(swPublic), 'Missing apps/ktn-web-v2/public/sw.js');
    assert.equal(
      Buffer.compare(fs.readFileSync(swRoot), fs.readFileSync(swPublic)),
      0,
      'sw.js and apps/ktn-web-v2/public/sw.js must stay byte-identical'
    );
  }

  // 3. Git diff check against baseRef + working-tree git status check for V1 files
  const assertNotProtectedV1File = (file, contextLabel) => {
    const cleanFile = String(file || '')
      .replace(/^"|"$/g, '')
      .replace(/\\/g, '/')
      .replace(/^\.\//, '')
      .trim();
    if (!cleanFile) return;
    const isProtected =
      V1_PROTECTED_FILES.includes(cleanFile) ||
      /^so-lien-lac/.test(cleanFile) ||
      /^sll-/.test(cleanFile);
    assert.equal(
      isProtected,
      false,
      `Protected V1 file modified in ${contextLabel}: ${cleanFile}`
    );
  };

  let diffOut = '';
  try {
    diffOut = execFileSync(
      'git',
      ['-C', rootDir, 'diff', '--name-only', '--no-renames', `${baseRef}...HEAD`],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    );
  } catch {
    // baseRef may not exist in shallow clones; skip branch diff comparison gracefully
    diffOut = '';
  }
  const changed = diffOut.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  for (const file of changed) {
    assertNotProtectedV1File(file, 'branch diff');
  }

  let statusOut = '';
  try {
    statusOut = execFileSync(
      'git',
      ['-C', rootDir, 'status', '--porcelain'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    );
  } catch {
    // Not a git worktree; skip git status check gracefully
    statusOut = '';
  }
  for (const line of statusOut.split(/\r?\n/)) {
    if (!line || line.length < 4) continue;
    const rawPath = line.slice(3).trim();
    const paths = rawPath.includes(' -> ') ? rawPath.split(' -> ').map((p) => p.trim()) : [rawPath];
    for (const file of paths) {
      assertNotProtectedV1File(file, 'working tree');
    }
  }

  // 4. Optional N27 HTML check
  if (typeof v1Html === 'string') {
    assert.equal(
      v1Html.includes('rel="manifest"'),
      false,
      'V1 /custom-page/so-lien-lac HTML MUST NOT contain rel="manifest"'
    );
  }
  if (typeof v2Html === 'string') {
    assert.equal(
      v2Html.includes('<link rel="manifest" href="/manifest.json">'),
      true,
      'V2 /custom-page/so-lien-lac-test HTML must include <link rel="manifest" href="/manifest.json">'
    );
  }
}

export async function assertZeroHorizontalOverflow(page, tolerancePx = 2) {
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body ? document.body.scrollWidth : 0,
    clientWidth: document.documentElement.clientWidth
  }));
  const maxWidth = Math.max(metrics.scrollWidth, metrics.bodyScrollWidth);
  assert.ok(
    maxWidth <= metrics.clientWidth + tolerancePx,
    `Horizontal overflow detected: maxScrollWidth=${maxWidth} > clientWidth=${metrics.clientWidth} + ${tolerancePx}`
  );
  return metrics;
}
