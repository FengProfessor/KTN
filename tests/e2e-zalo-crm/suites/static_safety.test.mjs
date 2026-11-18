import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  assertNoSecretLeaks,
  assertV1Isolation,
  assertViteBundleBudget
} from '../harness/assertions.mjs';
import { MAX_VITE_CHUNK_BYTES } from '../harness/fixtures.mjs';
import {
  CORE_MIGRATION_FILES,
  ROOT_DIR,
  SCALE_MIGRATION_FILES,
  createSupabasePgliteHarness,
  loadMigrations
} from '../harness/pglite-supabase.mjs';

function walkFiles(dir, predicate) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full, predicate));
    else if (entry.isFile() && predicate(full)) out.push(full);
  }
  return out;
}

describe('Static & Build Safety Gate (F01, F02, F18)', () => {
  it('STATIC-01: node --check passes on all worker/BFF/deploy JS & MJS files', () => {
    const targets = [
      ...fs.readdirSync(ROOT_DIR)
        .filter((f) => /^(?:consultation-.*\.mjs|cloudflare-worker-sw-proxy\.js|deploy_.*\.cjs)$/.test(f))
        .map((f) => path.join(ROOT_DIR, f)),
      path.join(ROOT_DIR, 'sw.js'),
      path.join(ROOT_DIR, 'apps', 'ktn-web-v2', 'server', 'local-worker-middleware.mjs'),
      path.join(ROOT_DIR, 'tests', 'e2e-zalo-crm', 'run_all_e2e.mjs'),
      ...walkFiles(path.join(ROOT_DIR, 'tests', 'e2e-zalo-crm', 'harness'), (f) => /\.(?:m?js)$/.test(f)),
      ...walkFiles(path.join(ROOT_DIR, 'tests', 'e2e-zalo-crm', 'suites'), (f) => /\.test\.mjs$/.test(f))
    ];
    for (const filePath of targets) {
      assert.ok(fs.existsSync(filePath), `Missing file: ${filePath}`);
      execFileSync(process.execPath, ['--check', filePath], { stdio: 'pipe' });
    }
  });

  it('STATIC-02: apps/ktn-web-v2 typecheck, Vite production build (<500 KiB chunks), and Vitest unit tests pass 100%', () => {
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const runNpm = (args) =>
      execFileSync(npmCmd, ['--prefix', 'apps/ktn-web-v2', ...args], {
        cwd: ROOT_DIR,
        stdio: 'pipe',
        shell: process.platform === 'win32',
        encoding: 'utf8'
      });

    runNpm(['run', 'typecheck']);
    runNpm(['run', 'build']);
    const budget = assertViteBundleBudget(path.join(ROOT_DIR, 'apps', 'ktn-web-v2', 'dist'), MAX_VITE_CHUNK_BYTES);
    assert.ok(budget.totalChunks >= 1);
    assert.ok(budget.maxChunkBytes <= MAX_VITE_CHUNK_BYTES);

    const vitestOut = runNpm(['run', 'test:unit']);
    assert.match(vitestOut, /passed/i);
  });

  it('STATIC-03: V1 /custom-page/so-lien-lac isolation, branch ancestry, SW parity, untracked .env, and zero secret leaks', () => {
    const branch = execFileSync('git', ['-C', ROOT_DIR, 'rev-parse', '--abbrev-ref', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    }).trim();
    assert.notEqual(branch, 'main');
    execFileSync('git', ['-C', ROOT_DIR, 'merge-base', '--is-ancestor', '6f244cc', 'HEAD'], { stdio: 'ignore' });
    execFileSync('git', ['-C', ROOT_DIR, 'merge-base', '--is-ancestor', 'feat/ktn-react-ui-v2', 'HEAD'], { stdio: 'ignore' });

    assertV1Isolation({ rootDir: ROOT_DIR, baseRef: 'feat/ktn-react-ui-v2', checkSwParity: true });

    const trackedEnv = execFileSync('git', ['-C', ROOT_DIR, 'ls-files', '.env', '.env.*'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    })
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    assert.deepEqual(trackedEnv, ['.env.example']);

    const sourceFiles = [
      ...fs.readdirSync(ROOT_DIR)
        .filter((f) => /\.(?:js|mjs|cjs)$/.test(f))
        .map((f) => path.join(ROOT_DIR, f)),
      path.join(ROOT_DIR, '.env.example'),
      path.join(ROOT_DIR, 'apps', 'ktn-web-v2', 'server', 'local-worker-middleware.mjs'),
      ...walkFiles(path.join(ROOT_DIR, 'apps', 'ktn-web-v2', 'src'), (f) => /\.(?:ts|tsx|js|mjs)$/.test(f)),
      ...walkFiles(path.join(ROOT_DIR, 'supabase', 'migrations'), (f) => /\.sql$/.test(f))
    ];
    for (const filePath of sourceFiles) {
      const content = fs.readFileSync(filePath, 'utf8');
      assertNoSecretLeaks(content, {
        checkDotEnv: true,
        rootDir: ROOT_DIR,
        label: path.relative(ROOT_DIR, filePath)
      });
    }
  });

  it('STATIC-04: All core & scale SQL migrations apply cleanly in offline PGlite with zero destructive DDL', async () => {
    const actualMigrations = fs
      .readdirSync(path.join(ROOT_DIR, 'supabase', 'migrations'))
      .filter((f) => f.endsWith('.sql'))
      .sort()
      .map((f) => `supabase/migrations/${f}`);
    const existingScale = SCALE_MIGRATION_FILES.filter((rel) => fs.existsSync(path.join(ROOT_DIR, rel)));

    for (const rel of new Set([...CORE_MIGRATION_FILES, ...existingScale, ...actualMigrations])) {
      const fullPath = path.join(ROOT_DIR, rel);
      assert.ok(fs.existsSync(fullPath), `Missing SQL migration: ${rel}`);
      const sql = fs.readFileSync(fullPath, 'utf8');
      assert.equal(
        /\bDROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:public\.)?(?:ktn_orders|ktn_students|ktn_courses|ktn_consultations)\b/i.test(sql),
        false,
        `Unexpected DROP TABLE in ${rel}`
      );
      assert.equal(
        /\bTRUNCATE\s+(?:TABLE\s+)?(?:public\.)?(?:ktn_orders|ktn_students|ktn_courses|ktn_consultations)\b/i.test(sql),
        false,
        `Unexpected TRUNCATE in ${rel}`
      );
    }

    const pg = await createSupabasePgliteHarness({ loadScaleMigrations: false });
    try {
      if (existingScale.length) {
        await loadMigrations(pg.db, existingScale);
      }
      const res = await pg.db.query(`SELECT count(*)::int AS cnt FROM public.ktn_courses`);
      assert.equal(res.rows[0].cnt, 11);
    } finally {
      await pg.close();
    }
  });
});
