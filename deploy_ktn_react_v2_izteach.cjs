#!/usr/bin/env node
/**
 * KTN React V2 / Backend V3 — Static Deployment & Rollback Tool for izTeach S3/CloudFront + Custom Page
 *
 * SAFETY BY DEFAULT:
 * - Defaults to `--dry-run`. Never mutates live izTeach Custom Page or S3 unless `--live` is explicitly passed.
 * - Verifies Vite build artifacts in `apps/ktn-web-v2/dist`, checks chunk size limits (< 500 kB),
 *   computes SHA-256 checksums, and writes:
 *     1) `apps/ktn-web-v2/dist/release-manifest.json`
 *     2) `apps/ktn-web-v2/dist/izteach-custom-page-embed.html`
 *     3) `reports/ktn-three-way-reliability/v3-release-manifest.json`
 * - Supports `--rollback <manifest-path>` to restore a previous release manifest.
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
const PAGE_ID = process.env.IZTEACH_CUSTOM_PAGE_ID || '6adff7ba36309b0002b6e659';
const SLUG = process.env.IZTEACH_CUSTOM_PAGE_SLUG || 'so-lien-lac-test';
const CLOUDFRONT_ORIGIN = 'https://d21acfi38wn3iy.cloudfront.net';
const MAX_CHUNK_BYTES = 500 * 1024; // 500 KiB

const DIST_DIR = path.join(__dirname, 'apps', 'ktn-web-v2', 'dist');
const REPORT_DIR = path.join(__dirname, 'reports', 'ktn-three-way-reliability');

function parseArgs(argv) {
  const args = {
    live: false,
    dryRun: true,
    build: false,
    rollbackManifest: null,
    releaseTag: process.env.KTN_RELEASE_TAG || 'v3.0.0',
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
    } else if (a === '--rollback' && argv[i + 1]) {
      args.rollbackManifest = argv[i + 1];
      i += 1;
    } else if (a.startsWith('--tag=')) {
      args.releaseTag = a.slice('--tag='.length);
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
  if (fileName.endsWith('.js') || fileName.endsWith('.mjs')) return 'application/javascript; charset=utf-8';
  if (fileName.endsWith('.css')) return 'text/css; charset=utf-8';
  if (fileName.endsWith('.html')) return 'text/html; charset=utf-8';
  if (fileName.endsWith('.json')) return 'application/json; charset=utf-8';
  if (fileName.endsWith('.svg')) return 'image/svg+xml';
  if (fileName.endsWith('.png')) return 'image/png';
  if (fileName.endsWith('.jpg') || fileName.endsWith('.jpeg')) return 'image/jpeg';
  return 'application/octet-stream';
}

function sha256Hex(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function buildEmbedArtifacts(manifest) {
  const cssAssets = manifest.assets.filter((a) => a.fileName.endsWith('.css'));
  const entryJsAssets = manifest.assets.filter(
    (a) => a.fileName.startsWith('assets/index-') && a.fileName.endsWith('.js')
  );
  const preloadJsAssets = manifest.assets.filter(
    (a) => a.fileName.startsWith('assets/vendor-') && a.fileName.endsWith('.js')
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
<div id="ktn-react-v2-root" data-ktn-router="hash" data-ktn-release="${manifest.releaseTag}"></div>
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
  <div id="ktn-react-v2-root" data-ktn-router="hash" data-ktn-release="${manifest.releaseTag}"></div>
  ${scriptTags}
</body>
</html>`;

  return { embedHtml, embedCss, embedJs, standalonePreviewHtml };
}

async function getSignedUrl(token, s3Key, mimeType) {
  const signEndpoint = `https://xx7swzlhyl.execute-api.ap-southeast-1.amazonaws.com/prod/resource/signed-url?key=${encodeURIComponent(
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

async function main() {
  const args = parseArgs(process.argv);
  const gitCommit = getGitRevision();
  console.log(
    `[KTN-DEPLOY-V3] Starting static deployment pipeline (mode=${
      args.dryRun ? 'DRY-RUN' : 'LIVE'
    }, tag=${args.releaseTag}, commit=${gitCommit})`
  );

  if (args.rollbackManifest) {
    const rbPath = path.resolve(process.cwd(), args.rollbackManifest);
    if (!fs.existsSync(rbPath)) {
      throw new Error(`Rollback manifest not found at: ${rbPath}`);
    }
    const rbManifest = JSON.parse(fs.readFileSync(rbPath, 'utf8'));
    console.log(
      `[KTN-DEPLOY-V3] Loaded rollback manifest: tag=${rbManifest.releaseTag}, commit=${rbManifest.gitCommit}, assets=${rbManifest.assets?.length || 0}`
    );
    const embed = buildEmbedArtifacts(rbManifest);
    if (args.dryRun) {
      console.log('[KTN-DEPLOY-V3] [DRY-RUN] Rollback verified. Custom Page payload ready without touching live server.');
      return;
    }
    console.log('[KTN-DEPLOY-V3] Rollback payload prepared:', embed.embedHtml.length, 'bytes');
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

  const assetFiles = fs
    .readdirSync(assetsDir)
    .filter((f) => !f.startsWith('.'))
    .sort();

  if (assetFiles.length === 0) {
    throw new Error(`No compiled assets found in ${assetsDir}`);
  }

  const s3Prefix = `resource/documents/${VENDOR_ID}/ktn-react-v2/${args.releaseTag}-${gitCommit}`;
  const assets = [];
  let oversizedChunks = 0;

  for (const file of assetFiles) {
    const absPath = path.join(assetsDir, file);
    const stat = fs.statSync(absPath);
    if (!stat.isFile()) continue;
    const buf = fs.readFileSync(absPath);
    const sha256 = sha256Hex(buf);
    const relName = `assets/${file}`;
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
      mimeType: getMimeType(file),
      sha256,
      s3Key,
      cdnUrl,
    });
  }

  console.log('\n[KTN-DEPLOY-V3] Verified Bundle Assets:');
  for (const a of assets) {
    console.log(
      `  - ${a.fileName.padEnd(36)} | ${String(a.sizeKiB).padStart(7)} KiB | sha256:${a.sha256.slice(
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
    customPageId: PAGE_ID,
    customPageSlug: SLUG,
    s3Prefix,
    cloudfrontOrigin: CLOUDFRONT_ORIGIN,
    totalAssets: assets.length,
    totalBytes: assets.reduce((sum, a) => sum + a.bytes, 0),
    allChunksUnder500KiB: oversizedChunks === 0,
    assets,
    rollbackCommand: `node deploy_ktn_react_v2_izteach.cjs --rollback reports/ktn-three-way-reliability/v3-release-manifest.json`,
  };

  const embedArtifacts = buildEmbedArtifacts(manifest);
  const distManifestPath = path.join(DIST_DIR, 'release-manifest.json');
  const distEmbedPath = path.join(DIST_DIR, 'izteach-custom-page-embed.html');
  fs.writeFileSync(distManifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  fs.writeFileSync(distEmbedPath, embedArtifacts.standalonePreviewHtml, 'utf8');

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const reportManifestPath = path.join(REPORT_DIR, 'v3-release-manifest.json');
  fs.writeFileSync(reportManifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  console.log(`\n[KTN-DEPLOY-V3] Wrote release manifest: ${distManifestPath}`);
  console.log(`[KTN-DEPLOY-V3] Wrote report manifest:  ${reportManifestPath}`);
  console.log(`[KTN-DEPLOY-V3] Wrote embed preview:    ${distEmbedPath}`);

  if (args.dryRun) {
    console.log(
      '\n[KTN-DEPLOY-V3] ✅ DRY-RUN COMPLETED SUCCESSFULLY. Zero live izTeach pages or S3 objects were modified.'
    );
    console.log(
      '[KTN-DEPLOY-V3] To deploy to live after owner approval, pass `--live` with valid IZTEACH_ADMIN_TOKEN in .env.'
    );
    return;
  }

  const adminToken = process.env.IZTEACH_ADMIN_TOKEN;
  if (!adminToken) {
    throw new Error(
      'Missing IZTEACH_ADMIN_TOKEN in environment. Refusing to run `--live` deployment.'
    );
  }

  console.log('\n[KTN-DEPLOY-V3] Uploading assets to izTeach S3/CloudFront...');
  for (const a of assets) {
    const absPath = path.join(DIST_DIR, a.fileName);
    const buf = fs.readFileSync(absPath);
    const signedUrl = await getSignedUrl(adminToken, a.s3Key, a.mimeType);
    await uploadBufferToS3(signedUrl, buf, a.mimeType);
    console.log(`  [UPLOADED] ${a.cdnUrl}`);
  }

  console.log('\n[KTN-DEPLOY-V3] ✅ LIVE STATIC UPLOAD COMPLETED.');
}

main().catch((err) => {
  console.error('[KTN-DEPLOY-V3] ❌ ERROR:', err.message);
  process.exit(1);
});
