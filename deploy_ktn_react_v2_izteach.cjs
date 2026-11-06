#!/usr/bin/env node
/**
 * KTN React V2 / Backend V3 — Static Deployment, Custom Page Update & Rollback Tool for izTeach S3/CloudFront
 *
 * SAFETY BY DEFAULT:
 * - Defaults to `--dry-run`. Never mutates live izTeach Custom Page or S3 unless `--live` is explicitly passed.
 * - Protects all live production Custom Pages (`PROTECTED_PRODUCTION_PAGE_IDS`) from accidental overwrite.
 * - Scans all Vite build artifacts in `apps/ktn-web-v2/dist/assets` (JS, dynamic chunks, CSS, fonts, images, media),
 *   verifies chunk size limits (< 500 KiB), computes SHA-256 checksums, and writes:
 *     1) `apps/ktn-web-v2/dist/release-manifest.json`
 *     2) `apps/ktn-web-v2/dist/izteach-custom-page-embed.html`
 *     3) `reports/ktn-three-way-reliability/v3-release-manifest.json`
 * - In `--live` mode:
 *     1) Requests signed S3 PUT URLs, uploads all assets with explicit MIME types.
 *     2) Reads back every uploaded asset from CloudFront CDN and verifies HTTP 200, MIME type, and SHA-256 checksum.
 *     3) Backs up existing Custom Page payload (`GET /custom-page-data`).
 *     4) Updates Custom Page (`PUT /custom-page-vendor-setting`) with `SectionHtml` (`html`, `css`, `javascript`)
 *        and verifies read-after-write (`GET /custom-page-data`).
 * - Supports `--rollback <manifest-path>` to restore a previous release manifest (both `--dry-run` and `--live`).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

try {
  const envFile = path.join(__dirname, '.env');
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.+)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  }
} catch (_) {}

const VENDOR_ID = process.env.IZTEACH_VENDOR_ID || '3529cd2b-7af6-4fda-887c-392a79393d6a';
const DEFAULT_PAGE_ID = process.env.IZTEACH_CUSTOM_PAGE_ID || '6adff7ba36309b0002b6e659';
const DEFAULT_SLUG = process.env.IZTEACH_CUSTOM_PAGE_SLUG || 'so-lien-lac-test';
const CLOUDFRONT_ORIGIN = (process.env.IZTEACH_CLOUDFRONT_ORIGIN || 'https://d21acfi38wn3iy.cloudfront.net').replace(/\/+$/, '');
const IZTEACH_API_BASE = (process.env.IZTEACH_API_BASE || 'https://xx7swzlhyl.execute-api.ap-southeast-1.amazonaws.com/prod').replace(/\/+$/, '');
const IZTEACH_CUSTOM_PAGE_API_BASE = (process.env.IZTEACH_CUSTOM_PAGE_API_BASE || 'https://k90adfn1jk.execute-api.ap-southeast-1.amazonaws.com/prod').replace(/\/+$/, '');
const IZTEACH_AUTH_API_BASE = (process.env.IZTEACH_AUTH_API_BASE || 'https://gcnj5paf1j.execute-api.ap-southeast-1.amazonaws.com/prod').replace(/\/+$/, '');
const MAX_CHUNK_BYTES = 500 * 1024; // 500 KiB

const PROTECTED_PRODUCTION_PAGE_IDS = new Set([
  '6adff7ba36309b0002b6e659', // so-lien-lac-test (active legacy portal)
  '68ba99202e8db10002224f08', // ktn-home
  '68c8d7a6456c4700023ba707', // ve-chung-toi
  '695fb1318a964e0002e4c36d', // sll-gv
  '696f7bb3d8cb3100021fd870', // so-lien-lac
  '6986d60e8d010f000201f310', // thu-vien
]);

const DIST_DIR = path.join(__dirname, 'apps', 'ktn-web-v2', 'dist');
const REPORT_DIR = path.join(__dirname, 'reports', 'ktn-three-way-reliability');

function parseArgs(argv) {
  const args = {
    live: false,
    dryRun: true,
    build: false,
    rollbackManifest: null,
    releaseTag: process.env.KTN_RELEASE_TAG || 'v3.0.0',
    pageId: DEFAULT_PAGE_ID,
    slug: DEFAULT_SLUG,
    allowProdOverwrite: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--live') {
      args.live = true;
      args.dryRun = false;
    } else if (a === '--dry-run') {
      args.dryRun = true;
      args.live = false;
    } else if (a === '--build') {
      args.build = true;
    } else if (a === '--allow-prod-page-overwrite') {
      args.allowProdOverwrite = true;
    } else if (a === '--rollback' && argv[i + 1]) {
      args.rollbackManifest = argv[i + 1];
      i += 1;
    } else if (a.startsWith('--rollback=')) {
      args.rollbackManifest = a.slice('--rollback='.length);
    } else if (a === '--tag' && argv[i + 1]) {
      args.releaseTag = argv[i + 1];
      i += 1;
    } else if (a.startsWith('--tag=')) {
      args.releaseTag = a.slice('--tag='.length);
    } else if (a === '--page-id' && argv[i + 1]) {
      args.pageId = argv[i + 1];
      i += 1;
    } else if (a.startsWith('--page-id=')) {
      args.pageId = a.slice('--page-id='.length);
    } else if (a === '--slug' && argv[i + 1]) {
      args.slug = argv[i + 1];
      i += 1;
    } else if (a.startsWith('--slug=')) {
      args.slug = a.slice('--slug='.length);
    }
  }
  return args;
}

function getGitRevision() {
  try {
    return execSync('git rev-parse --short HEAD', {
      cwd: __dirname,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString('utf8')
      .trim();
  } catch {
    return 'unknown';
  }
}

function getMimeType(fileName) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.js') || lower.endsWith('.mjs')) return 'application/javascript; charset=utf-8';
  if (lower.endsWith('.css')) return 'text/css; charset=utf-8';
  if (lower.endsWith('.html')) return 'text/html; charset=utf-8';
  if (lower.endsWith('.json') || lower.endsWith('.map')) return 'application/json; charset=utf-8';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.ico')) return 'image/x-icon';
  if (lower.endsWith('.woff2')) return 'font/woff2';
  if (lower.endsWith('.woff')) return 'font/woff';
  if (lower.endsWith('.ttf')) return 'font/ttf';
  if (lower.endsWith('.otf')) return 'font/otf';
  if (lower.endsWith('.m3u8')) return 'application/vnd.apple.mpegurl';
  if (lower.endsWith('.mp4')) return 'video/mp4';
  if (lower.endsWith('.webm')) return 'video/webm';
  return 'application/octet-stream';
}

function sha256Hex(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function collectFilesRecursively(dirPath, baseDir = dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFilesRecursively(fullPath, baseDir));
    } else if (entry.isFile()) {
      const rel = path.relative(baseDir, fullPath).split(path.sep).join('/');
      results.push({ fullPath, relPath: rel });
    }
  }
  return results.sort((a, b) => a.relPath.localeCompare(b.relPath));
}

function buildEmbedArtifacts(manifest) {
  const cssAssets = manifest.assets.filter((a) => a.fileName.endsWith('.css'));
  const entryJsAssets = manifest.assets.filter(
    (a) => a.fileName.startsWith('assets/index-') && a.fileName.endsWith('.js')
  );
  // Preload core vendor chunks only; NEVER preload vendor-hls so non-video pages (/login, /admin, /teacher) stay lightweight
  const preloadJsAssets = manifest.assets.filter(
    (a) =>
      a.fileName.startsWith('assets/vendor-') &&
      !a.fileName.includes('vendor-hls') &&
      a.fileName.endsWith('.js')
  );

  const cssLinks = cssAssets
    .map((a) => `<link rel="stylesheet" crossorigin href="${a.cdnUrl}">`)
    .join('\n');
  const modulePreloads = preloadJsAssets
    .map((a) => `<link rel="modulepreload" crossorigin href="${a.cdnUrl}">`)
    .join('\n');
  const scriptTags = entryJsAssets
    .map((a) => `<script type="module" crossorigin src="${a.cdnUrl}"></script>`)
    .join('\n');

  const embedCss = `
/* KTN React V2 — izTeach Custom Page Host Isolation (${manifest.releaseTag} @ ${manifest.gitCommit}) */
#__next > main > div.mx-auto.max-w-screen-3xl > div.fixed.inset-x-0.top-0,
#__next > main > div.mx-auto.max-w-screen-3xl > div.border-t.border-slate-200 {
  display: none !important;
}
#__next > main > div.mx-auto.max-w-screen-3xl > div.pt-16 {
  padding-top: 0 !important;
}
#__next > main > div.mx-auto.max-w-screen-3xl {
  max-width: 100% !important;
  padding: 0 !important;
}
#ktn-react-v2-root {
  width: 100%;
  min-height: 100vh;
  background: #FFFDF9;
  isolation: isolate;
}
`.trim();

  const embedHtml = `
<!-- KTN React V2 Custom Page Mount (${manifest.releaseTag} / ${manifest.gitCommit}) -->
${cssLinks}
${modulePreloads}
<div id="ktn-react-v2-root" data-ktn-router="hash" data-ktn-release="${manifest.releaseTag}" data-ktn-commit="${manifest.gitCommit}"></div>
`.trim();

  const embedJs = `
;(function(){
  window.__KTN_EMBED_MODE__ = true;
  window.__KTN_RELEASE_VERSION__ = ${JSON.stringify(manifest.releaseTag)};
  window.__KTN_RELEASE_COMMIT__ = ${JSON.stringify(manifest.gitCommit)};
  var entryScripts = ${JSON.stringify(entryJsAssets.map((a) => a.cdnUrl))};
  entryScripts.forEach(function(src) {
    if (document.querySelector('script[src="' + src + '"]')) return;
    var s = document.createElement('script');
    s.type = 'module';
    s.crossOrigin = 'anonymous';
    s.src = src;
    document.head.appendChild(s);
  });
})();
`.trim();

  const standalonePreviewHtml = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Sổ Liên Lạc Điện Tử — Học Viện Khổng Tử Nhí (${manifest.releaseTag})</title>
  <style>${embedCss}</style>
  ${cssLinks}
  ${modulePreloads}
</head>
<body>
  <script>window.__KTN_EMBED_MODE__ = true;</script>
  <div id="ktn-react-v2-root" data-ktn-router="hash" data-ktn-release="${manifest.releaseTag}" data-ktn-commit="${manifest.gitCommit}"></div>
  ${scriptTags}
</body>
</html>`;

  const customPagePayload = {
    _id: manifest.customPageId || DEFAULT_PAGE_ID,
    vendorId: manifest.vendorId || VENDOR_ID,
    slug: manifest.customPageSlug || DEFAULT_SLUG,
    title: `Sổ Liên Lạc Điện Tử — Khổng Tử Nhí (${manifest.releaseTag})`,
    active: true,
    sections: [
      {
        type: 'SectionHtml',
        name: 'KTN React V2 Portal',
        data: {
          html: embedHtml,
          css: embedCss,
          javascript: embedJs,
        },
      },
    ],
  };

  return { embedHtml, embedCss, embedJs, standalonePreviewHtml, customPagePayload };
}

function assertCustomPageWriteAllowed(pageId, allowProdOverwrite) {
  const isRealProdApi = IZTEACH_API_BASE.includes('xx7swzlhyl.execute-api.ap-southeast-1.amazonaws.com');
  if (isRealProdApi && PROTECTED_PRODUCTION_PAGE_IDS.has(pageId)) {
    const envConfirmed = process.env.KTN_ALLOW_PROD_CUSTOM_PAGE_OVERWRITE === 'true';
    if (!allowProdOverwrite || !envConfirmed) {
      throw new Error(
        `SAFETY GUARD BLOCKED: Custom Page ID "${pageId}" is a protected production page on izTeach. ` +
          `Deploy to a dedicated preview page ID (--page-id=<preview_id>) or explicitly pass both ` +
          `--allow-prod-page-overwrite and KTN_ALLOW_PROD_CUSTOM_PAGE_OVERWRITE=true after owner sign-off.`
      );
    }
  }
}

async function getSignedUrl(token, s3Key, mimeType) {
  const signEndpoint = `${IZTEACH_API_BASE}/resource/signed-url?key=${encodeURIComponent(
    s3Key
  )}&contentType=${encodeURIComponent(mimeType)}`;
  const res = await fetch(signEndpoint, { headers: { Authorization: token } });
  if (!res.ok) throw new Error(`Signed URL request failed for ${s3Key}: HTTP ${res.status}`);
  const data = await res.json();
  return typeof data === 'string'
    ? data
    : data.url || data.signedUrl || data.data?.url || data.data;
}

async function uploadBufferToS3(signedUrl, buffer, mimeType) {
  const res = await fetch(signedUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': mimeType,
      'Content-Length': String(buffer.length),
    },
    body: buffer,
  });
  if (!res.ok) throw new Error(`S3 PUT failed: HTTP ${res.status}`);
  return true;
}

async function verifyAssetOnCdn(asset) {
  const res = await fetch(asset.cdnUrl, {
    method: 'GET',
    headers: { 'Cache-Control': 'no-cache' },
  });
  if (!res.ok) {
    throw new Error(`CDN readback failed for ${asset.cdnUrl}: HTTP ${res.status}`);
  }
  const contentType = String(res.headers.get('content-type') || '').toLowerCase();
  const expectedPrimaryMime = asset.mimeType.split(';')[0].trim().toLowerCase();
  if (contentType && !contentType.includes(expectedPrimaryMime.split('/')[1])) {
    throw new Error(
      `CDN MIME mismatch for ${asset.fileName}: expected ${expectedPrimaryMime}, got ${contentType}`
    );
  }
  const arrayBuf = await res.arrayBuffer();
  const downloadedSha256 = sha256Hex(Buffer.from(arrayBuf));
  if (downloadedSha256 !== asset.sha256) {
    throw new Error(
      `CDN SHA-256 mismatch for ${asset.fileName}: expected ${asset.sha256}, got ${downloadedSha256}`
    );
  }
  return {
    fileName: asset.fileName,
    cdnUrl: asset.cdnUrl,
    status: res.status,
    contentType,
    sha256Verified: true,
  };
}

async function resolveIzTeachAdminToken() {
  const existing = String(process.env.IZTEACH_ADMIN_TOKEN || '').trim();
  if (existing && existing.split('.').length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(existing.split('.')[1], 'base64url').toString('utf8'));
      if (!payload.exp || payload.exp * 1000 > Date.now() + 60000) {
        return existing;
      }
    } catch (_) {}
  }
  const email = String(process.env.IZTEACH_ADMIN_EMAIL || 'hocvienkhongtunhi123@gmail.com').trim();
  const password = String(process.env.IZTEACH_ADMIN_PASSWORD || '').trim();
  if (!password) {
    if (existing) return existing;
    throw new Error('Missing IZTEACH_ADMIN_TOKEN and IZTEACH_ADMIN_PASSWORD in environment.');
  }
  const res = await fetch(`${IZTEACH_AUTH_API_BASE}/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password: Buffer.from(password).toString('base64'),
      vendorId: VENDOR_ID,
    }),
  });
  const data = await res.json().catch(() => null);
  const token = data?.accessToken || data?.token || '';
  if (!res.ok || !token) {
    throw new Error(`Failed to mint izTeach Admin token via /signin (HTTP ${res.status}).`);
  }
  return token;
}

async function fetchCustomPageData(token, pageIdOrSlug, vendorId) {
  const url = `${IZTEACH_CUSTOM_PAGE_API_BASE}/custom-page-data?customPage=${encodeURIComponent(pageIdOrSlug)}&vendorId=${encodeURIComponent(vendorId)}`;
  const res = await fetch(url, {
    headers: token ? { Authorization: token } : {},
  });
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

async function updateCustomPageVendorSetting(token, payload) {
  const url = `${IZTEACH_CUSTOM_PAGE_API_BASE}/custom-page-vendor-setting`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: token,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Custom Page PUT failed: HTTP ${res.status} ${errText}`);
  }
  const data = await res.json().catch(() => ({ ok: true }));
  return data;
}

async function main() {
  const args = parseArgs(process.argv);
  const gitCommit = getGitRevision();
  console.log(
    `[KTN-DEPLOY-V3] Starting static deployment pipeline (mode=${
      args.dryRun ? 'DRY-RUN' : 'LIVE'
    }, tag=${args.releaseTag}, commit=${gitCommit}, pageId=${args.pageId})`
  );

  if (!args.dryRun && !args.rollbackManifest) {
    assertCustomPageWriteAllowed(args.pageId, args.allowProdOverwrite);
  }

  if (args.rollbackManifest) {
    const rbPath = path.resolve(process.cwd(), args.rollbackManifest);
    if (!fs.existsSync(rbPath)) {
      throw new Error(`Rollback manifest not found at: ${rbPath}`);
    }
    const rbManifest = JSON.parse(fs.readFileSync(rbPath, 'utf8'));
    const targetPageId = args.pageId || rbManifest.customPageId || DEFAULT_PAGE_ID;
    const targetVendorId = rbManifest.vendorId || VENDOR_ID;
    console.log(
      `[KTN-DEPLOY-V3] Loaded rollback manifest: tag=${rbManifest.releaseTag}, commit=${rbManifest.gitCommit}, assets=${rbManifest.assets?.length || 0}`
    );
    const embed = buildEmbedArtifacts({
      ...rbManifest,
      customPageId: targetPageId,
      vendorId: targetVendorId,
    });

    fs.mkdirSync(REPORT_DIR, { recursive: true });
    const rollbackReportPath = path.join(REPORT_DIR, 'v3-rollback-verification.json');

    if (args.dryRun) {
      fs.writeFileSync(
        rollbackReportPath,
        JSON.stringify(
          {
            ok: true,
            mode: 'dry-run',
            restoredReleaseTag: rbManifest.releaseTag,
            restoredCommit: rbManifest.gitCommit,
            customPageId: targetPageId,
            embedHtmlBytes: embed.embedHtml.length,
            embedCssBytes: embed.embedCss.length,
            embedJsBytes: embed.embedJs.length,
            embedHtml: embed.embedHtml,
            verifiedAt: new Date().toISOString(),
          },
          null,
          2
        ),
        'utf8'
      );
      console.log(
        '[KTN-DEPLOY-V3] [DRY-RUN] Rollback verified. Custom Page payload ready without touching live server.'
      );
      return;
    }

    assertCustomPageWriteAllowed(targetPageId, args.allowProdOverwrite);
    const adminToken = await resolveIzTeachAdminToken();

    // Verify all assets in rollback manifest are still reachable on CDN before switching Custom Page
    for (const a of rbManifest.assets || []) {
      await verifyAssetOnCdn(a);
    }

    await updateCustomPageVendorSetting(adminToken, embed.customPagePayload);
    const readback = await fetchCustomPageData(adminToken, targetPageId, targetVendorId);
    const readbackHtml =
      readback?.sections?.[0]?.data?.html || readback?.data?.sections?.[0]?.data?.html || '';
    if (!readbackHtml.includes(rbManifest.releaseTag)) {
      throw new Error(
        `Rollback read-after-write verification failed: expected releaseTag ${rbManifest.releaseTag} in Custom Page HTML.`
      );
    }

    fs.writeFileSync(
      rollbackReportPath,
      JSON.stringify(
        {
          ok: true,
          mode: 'live',
          restoredReleaseTag: rbManifest.releaseTag,
          restoredCommit: rbManifest.gitCommit,
          customPageId: targetPageId,
          readAfterWriteVerified: true,
          verifiedAt: new Date().toISOString(),
        },
        null,
        2
      ),
      'utf8'
    );
    console.log(
      `[KTN-DEPLOY-V3] ✅ LIVE ROLLBACK COMPLETED & VERIFIED (restored ${rbManifest.releaseTag} @ ${rbManifest.gitCommit}).`
    );
    return;
  }

  if (args.build) {
    console.log('[KTN-DEPLOY-V3] Running `npm run build` in apps/ktn-web-v2...');
    execSync('npm run build', {
      cwd: path.join(__dirname, 'apps', 'ktn-web-v2'),
      stdio: 'inherit',
    });
  }

  const indexHtmlPath = path.join(DIST_DIR, 'index.html');
  const assetsDir = path.join(DIST_DIR, 'assets');
  if (!fs.existsSync(indexHtmlPath) || !fs.existsSync(assetsDir)) {
    throw new Error(
      `Build artifacts missing at ${DIST_DIR}. Run 'cd apps/ktn-web-v2 && npm run build' or pass --build.`
    );
  }

  const collectedAssets = collectFilesRecursively(assetsDir);
  if (collectedAssets.length === 0) {
    throw new Error(`No compiled assets found in ${assetsDir}`);
  }

  const s3Prefix = `resource/documents/${VENDOR_ID}/ktn-react-v2/${args.releaseTag}-${gitCommit}`;
  const assets = [];
  let oversizedChunks = 0;

  for (const item of collectedAssets) {
    const buf = fs.readFileSync(item.fullPath);
    const sha256 = sha256Hex(buf);
    const relName = `assets/${item.relPath}`;
    const s3Key = `${s3Prefix}/${relName}`;
    const cdnUrl = `${CLOUDFRONT_ORIGIN}/${s3Key}`;
    const sizeKiB = +(buf.length / 1024).toFixed(2);
    const withinBudget = buf.length <= MAX_CHUNK_BYTES;
    if (!withinBudget) oversizedChunks += 1;

    assets.push({
      fileName: relName,
      bytes: buf.length,
      sizeKiB,
      withinBudget,
      mimeType: getMimeType(item.relPath),
      sha256,
      s3Key,
      cdnUrl,
    });
  }

  console.log('\n[KTN-DEPLOY-V3] Verified Bundle Assets:');
  for (const a of assets) {
    console.log(
      `  - ${a.fileName.padEnd(40)} | ${String(a.sizeKiB).padStart(7)} KiB | sha256:${a.sha256.slice(
        0,
        12
      )}... | ${a.withinBudget ? 'OK (<500 KiB)' : 'OVER BUDGET!'}`
    );
  }

  if (oversizedChunks > 0) {
    throw new Error(
      `Bundle size gate failed: ${oversizedChunks} chunk(s) exceed the 500 KiB limit.`
    );
  }

  const manifest = {
    schemaVersion: '3.0',
    app: 'ktn-web-v2',
    releaseTag: args.releaseTag,
    gitCommit,
    generatedAt: new Date().toISOString(),
    mode: args.dryRun ? 'dry-run' : 'live',
    vendorId: VENDOR_ID,
    customPageId: args.pageId,
    customPageSlug: args.slug,
    s3Prefix,
    cloudfrontOrigin: CLOUDFRONT_ORIGIN,
    totalAssets: assets.length,
    totalBytes: assets.reduce((sum, a) => sum + a.bytes, 0),
    allChunksUnder500KiB: oversizedChunks === 0,
    hlsPreloadedOnInitialShell: false,
    assets,
    rollbackCommand: `node deploy_ktn_react_v2_izteach.cjs --rollback reports/ktn-three-way-reliability/v3-release-manifest.json`,
  };

  if (!args.dryRun) {
    assertCustomPageWriteAllowed(args.pageId, args.allowProdOverwrite);
  }

  const embedArtifacts = buildEmbedArtifacts(manifest);
  const distManifestPath = path.join(DIST_DIR, 'release-manifest.json');
  const distEmbedPath = path.join(DIST_DIR, 'izteach-custom-page-embed.html');
  fs.writeFileSync(distManifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  fs.writeFileSync(distEmbedPath, embedArtifacts.standalonePreviewHtml, 'utf8');

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const reportManifestPath = path.join(REPORT_DIR, 'v3-release-manifest.json');

  if (args.dryRun) {
    fs.writeFileSync(reportManifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    console.log(`\n[KTN-DEPLOY-V3] Wrote release manifest: ${distManifestPath}`);
    console.log(`[KTN-DEPLOY-V3] Wrote report manifest:  ${reportManifestPath}`);
    console.log(`[KTN-DEPLOY-V3] Wrote embed preview:    ${distEmbedPath}`);
    console.log(
      '\n[KTN-DEPLOY-V3] ✅ DRY-RUN COMPLETED SUCCESSFULLY. Zero live izTeach pages or S3 objects were modified.'
    );
    console.log(
      '[KTN-DEPLOY-V3] To deploy to live after owner approval, pass `--live` with valid IZTEACH_ADMIN_TOKEN or IZTEACH_ADMIN_PASSWORD in .env.'
    );
    return;
  }

  const adminToken = await resolveIzTeachAdminToken();

  console.log('\n[KTN-DEPLOY-V3] Step 1/3: Uploading assets to izTeach S3/CloudFront...');
  const cdnVerifications = [];
  for (const a of assets) {
    const absPath = path.join(DIST_DIR, a.fileName);
    const buf = fs.readFileSync(absPath);
    const signedUrl = await getSignedUrl(adminToken, a.s3Key, a.mimeType);
    await uploadBufferToS3(signedUrl, buf, a.mimeType);
    const verified = await verifyAssetOnCdn(a);
    cdnVerifications.push(verified);
    console.log(`  [UPLOADED & CDN-VERIFIED] ${a.cdnUrl}`);
  }

  console.log('\n[KTN-DEPLOY-V3] Step 2/3: Backing up existing Custom Page before update...');
  const existingPage = await fetchCustomPageData(adminToken, args.pageId, VENDOR_ID);
  if (existingPage) {
    const backupPath = path.join(REPORT_DIR, `custom-page-backup-${args.pageId}.json`);
    fs.writeFileSync(backupPath, JSON.stringify(existingPage, null, 2), 'utf8');
    console.log(`  [BACKUP SAVED] ${backupPath}`);
  }

  console.log('\n[KTN-DEPLOY-V3] Step 3/3: Updating Custom Page SectionHtml & verifying read-after-write...');
  await updateCustomPageVendorSetting(adminToken, embedArtifacts.customPagePayload);
  const updatedPage = await fetchCustomPageData(adminToken, args.pageId, VENDOR_ID);
  const updatedHtml =
    updatedPage?.sections?.[0]?.data?.html || updatedPage?.data?.sections?.[0]?.data?.html || '';
  if (!updatedHtml.includes(args.releaseTag)) {
    throw new Error(
      `Custom Page read-after-write verification failed: expected releaseTag ${args.releaseTag} in Custom Page HTML.`
    );
  }

  manifest.cdnVerifiedCount = cdnVerifications.length;
  manifest.customPageUpdated = true;
  manifest.customPageVerifiedAt = new Date().toISOString();
  fs.writeFileSync(distManifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  fs.writeFileSync(reportManifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  console.log('\n[KTN-DEPLOY-V3] ✅ LIVE STATIC UPLOAD, CDN VERIFICATION & CUSTOM PAGE UPDATE COMPLETED.');
}

main().catch((err) => {
  console.error('[KTN-DEPLOY-V3] ❌ ERROR:', err.message);
  process.exit(1);
});
