#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { finished } from 'node:stream/promises';
import { run } from 'node:test';
import { spec } from 'node:test/reporters';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const SUITE_REGISTRY = [
  { id: 'harness', tier: 'harness', suite: 'harness', file: 'harness/harness_smoke.test.mjs' },
  { id: 'tier1-zalo', tier: '1', suite: 'zalo', file: 'suites/tier1_zalo.test.mjs' },
  { id: 'tier1-chatbot', tier: '1', suite: 'chatbot', file: 'suites/tier1_chatbot.test.mjs' },
  { id: 'tier1-sepay-crm', tier: '1', suite: 'sepay-crm', file: 'suites/tier1_sepay_crm.test.mjs' },
  { id: 'tier1-infra-safety', tier: '1', suite: 'infra-safety', file: 'suites/tier1_infra_safety.test.mjs' },
  { id: 'tier2-zalo', tier: '2', suite: 'zalo', file: 'suites/tier2_zalo.test.mjs' },
  { id: 'tier2-chatbot', tier: '2', suite: 'chatbot', file: 'suites/tier2_chatbot.test.mjs' },
  { id: 'tier2-sepay-crm', tier: '2', suite: 'sepay-crm', file: 'suites/tier2_sepay_crm.test.mjs' },
  { id: 'tier2-infra-safety', tier: '2', suite: 'infra-safety', file: 'suites/tier2_infra_safety.test.mjs' },
  { id: 'tier3-pairwise', tier: '3', suite: 'pairwise', file: 'suites/tier3_pairwise.test.mjs' },
  { id: 'tier4-scenarios', tier: '4', suite: 'scenarios', file: 'suites/tier4_scenarios.test.mjs' },
  { id: 'static-safety', tier: 'static', suite: 'safety', file: 'suites/static_safety.test.mjs' }
];

const SUITE_ALIASES = {
  safety: ['infra-safety', 'safety'],
  static: ['safety']
};

const VALID_TIERS = new Set(['1', '2', '3', '4', 'static', 'harness']);
const VALID_SUITES = new Set([
  ...SUITE_REGISTRY.map((entry) => entry.suite),
  ...SUITE_REGISTRY.map((entry) => entry.id),
  ...Object.keys(SUITE_ALIASES)
]);

const FULL_THRESHOLDS = {
  '1': 90,
  '2': 90,
  '3': 18,
  '4': 12,
  total: 210
};

export function parseCliArgs(argv) {
  const tiers = [];
  const suites = [];
  let jsonPath = null;
  let noThresholds = false;

  const readFlagValue = (flagName, idx) => {
    const next = argv[idx + 1];
    if (!next || next.startsWith('--') || !next.trim()) {
      throw new Error(`Missing value for ${flagName}. Usage: --tier <list> --suite <list> --json <path>`);
    }
    return next;
  };

  const pushTierTokens = (raw, usageMsg) => {
    const vals = raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (!vals.length) {
      throw new Error(usageMsg);
    }
    for (const rawToken of vals) {
      const normalized = rawToken.replace(/^tier/, '');
      if (!normalized || !VALID_TIERS.has(normalized)) {
        throw new Error(`Unknown tier value: ${rawToken}. Valid tiers: ${[...VALID_TIERS].join(', ')}`);
      }
      tiers.push(normalized);
    }
  };

  const pushSuiteTokens = (raw, usageMsg) => {
    const vals = raw.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
    if (!vals.length) {
      throw new Error(usageMsg);
    }
    for (const s of vals) {
      if (!VALID_SUITES.has(s)) {
        throw new Error(`Unknown suite value: ${s}. Valid suites: ${[...VALID_SUITES].join(', ')}`);
      }
      suites.push(s);
    }
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--tier') {
      const raw = readFlagValue('--tier', i);
      i++;
      pushTierTokens(raw, 'Empty value for --tier. Usage: --tier <1|2|3|4|static|harness>');
    } else if (arg.startsWith('--tier=')) {
      const raw = arg.slice('--tier='.length);
      pushTierTokens(raw, 'Missing value for --tier=. Usage: --tier=<1|2|3|4|static|harness>');
    } else if (arg === '--suite') {
      const raw = readFlagValue('--suite', i);
      i++;
      pushSuiteTokens(raw, 'Empty value for --suite. Usage: --suite <name>');
    } else if (arg.startsWith('--suite=')) {
      const raw = arg.slice('--suite='.length);
      pushSuiteTokens(raw, 'Missing value for --suite=. Usage: --suite=<name>');
    } else if (arg === '--json') {
      jsonPath = readFlagValue('--json', i).trim();
      i++;
    } else if (arg.startsWith('--json=')) {
      const raw = arg.slice('--json='.length).trim();
      if (!raw) {
        throw new Error('Missing file path for --json=. Usage: --json=<path>');
      }
      jsonPath = raw;
    } else if (arg === '--no-thresholds') {
      noThresholds = true;
    } else {
      throw new Error(`Unknown CLI argument: ${arg}`);
    }
  }

  return { tiers, suites, jsonPath, noThresholds };
}

function selectRegistryEntries({ tiers, suites }) {
  const isUnfiltered = tiers.length === 0 && suites.length === 0;
  if (isUnfiltered) {
    return SUITE_REGISTRY.filter((entry) => entry.tier !== 'harness');
  }

  const expandedSuites = new Set();
  for (const s of suites) {
    expandedSuites.add(s);
    for (const alias of (SUITE_ALIASES[s] || [])) expandedSuites.add(alias);
  }

  return SUITE_REGISTRY.filter((entry) => {
    const tierMatch = tiers.length === 0 || tiers.includes(entry.tier);
    const suiteMatch = suites.length === 0 || expandedSuites.has(entry.suite) || expandedSuites.has(entry.id);
    return tierMatch && suiteMatch;
  });
}

async function main() {
  const startMs = Date.now();
  const args = parseCliArgs(process.argv.slice(2));
  const selectedEntries = selectRegistryEntries(args);

  if (selectedEntries.length === 0) {
    console.error('[E2E Runner] No test suites matched filters:', JSON.stringify(args));
    process.exit(1);
  }

  const resolvedFiles = [];
  const missingFiles = [];
  const tierByAbsPath = new Map();

  for (const entry of selectedEntries) {
    const abs = path.resolve(__dirname, entry.file);
    tierByAbsPath.set(path.normalize(abs).toLowerCase(), entry.tier);
    if (fs.existsSync(abs)) {
      resolvedFiles.push(abs);
    } else {
      missingFiles.push(entry.file);
    }
  }

  if (missingFiles.length > 0) {
    console.error('[E2E Runner] Missing suite file(s):', missingFiles.join(', '));
    process.exit(1);
  }

  const countsByTier = { '1': 0, '2': 0, '3': 0, '4': 0, static: 0, harness: 0 };
  const fileStats = new Map();
  const failures = [];
  let total = 0;
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  let anyFailEvent = false;

  const stream = run({
    files: resolvedFiles,
    isolation: 'process',
    timeout: 180_000
  });

  const reporter = spec();

  const openStackByFile = new Map();

  const getStack = (fileKey) => {
    let st = openStackByFile.get(fileKey);
    if (!st) {
      st = [];
      openStackByFile.set(fileKey, st);
    }
    return st;
  };

  stream.on('test:start', (data) => {
    const normFile = data.file ? path.normalize(path.resolve(data.file)).toLowerCase() : '';
    getStack(normFile).push({
      nesting: data.nesting ?? 0,
      childPass: 0,
      childFail: 0,
      childSkip: 0
    });
  });

  stream.on('test:pass', (data) => {
    const normFile = data.file ? path.normalize(path.resolve(data.file)).toLowerCase() : '';
    const stack = getStack(normFile);
    const frame = stack.pop();
    if (data.details?.type === 'suite') return;
    const tier = tierByAbsPath.get(normFile) || 'unknown';
    const isSkipped = Boolean(data.skip) || Boolean(data.todo);
    const stat = fileStats.get(normFile) || { file: data.file, tier, total: 0, passed: 0, failed: 0, skipped: 0 };

    // If this test spawned nested t.test() subtests, deduct those subtests so each leaf it() counts once.
    if (frame && (frame.childPass > 0 || frame.childFail > 0 || frame.childSkip > 0)) {
      const subTotal = frame.childPass + frame.childFail + frame.childSkip;
      total -= subTotal;
      passed -= frame.childPass;
      failed -= frame.childFail;
      skipped -= frame.childSkip;
      stat.total -= subTotal;
      stat.passed -= frame.childPass;
      stat.failed -= frame.childFail;
      stat.skipped -= frame.childSkip;
      if (Object.prototype.hasOwnProperty.call(countsByTier, tier)) {
        countsByTier[tier] -= frame.childPass;
      }
    }

    total++;
    if (isSkipped) {
      skipped++;
    } else {
      passed++;
      if (Object.prototype.hasOwnProperty.call(countsByTier, tier)) {
        countsByTier[tier]++;
      }
    }
    stat.total++;
    if (isSkipped) stat.skipped++;
    else stat.passed++;
    fileStats.set(normFile, stat);

    const parent = stack.at(-1);
    if (parent) {
      if (isSkipped) parent.childSkip++;
      else parent.childPass++;
    }
  });

  stream.on('test:fail', (data) => {
    anyFailEvent = true;
    const normFile = data.file ? path.normalize(path.resolve(data.file)).toLowerCase() : '';
    const stack = getStack(normFile);
    const frame = stack.pop();
    if (data.details?.type === 'suite') return;
    const tier = tierByAbsPath.get(normFile) || 'unknown';
    const stat = fileStats.get(normFile) || { file: data.file, tier, total: 0, passed: 0, failed: 0, skipped: 0 };

    if (frame && (frame.childPass > 0 || frame.childFail > 0 || frame.childSkip > 0)) {
      const subTotal = frame.childPass + frame.childFail + frame.childSkip;
      total -= subTotal;
      passed -= frame.childPass;
      failed -= frame.childFail;
      skipped -= frame.childSkip;
      stat.total -= subTotal;
      stat.passed -= frame.childPass;
      stat.failed -= frame.childFail;
      stat.skipped -= frame.childSkip;
      if (Object.prototype.hasOwnProperty.call(countsByTier, tier)) {
        countsByTier[tier] -= frame.childPass;
      }
    }

    total++;
    failed++;
    failures.push({
      name: data.name,
      file: data.file || null,
      tier,
      error: data.details?.error?.message || String(data.details?.error || 'Test failed')
    });
    stat.total++;
    stat.failed++;
    fileStats.set(normFile, stat);

    const parent = stack.at(-1);
    if (parent) {
      parent.childFail++;
    }
  });

  stream.compose(reporter).pipe(process.stdout);
  await finished(stream);

  const isFullRun = args.tiers.length === 0 && args.suites.length === 0;
  const thresholdsChecked = isFullRun && !args.noThresholds;
  const thresholdErrors = [];
  if (thresholdsChecked) {
    if (skipped > 0) {
      thresholdErrors.push(`skipped tests (${skipped}) are not allowed in full threshold runs`);
    }
    for (const [tierKey, minVal] of Object.entries(FULL_THRESHOLDS)) {
      if (tierKey === 'total') {
        if (passed < minVal) thresholdErrors.push(`passed leaf tests ${passed} < minimum ${minVal}`);
      } else if ((countsByTier[tierKey] || 0) < minVal) {
        thresholdErrors.push(`Tier ${tierKey} leaf tests ${countsByTier[tierKey] || 0} < minimum ${minVal}`);
      }
    }
  }

  const durationMs = Date.now() - startMs;
  const report = {
    timestamp: new Date().toISOString(),
    durationMs,
    filters: { tiers: args.tiers, suites: args.suites, noThresholds: args.noThresholds },
    summary: { total, passed, failed, skipped },
    tiers: countsByTier,
    thresholdsChecked,
    thresholdsMet: thresholdErrors.length === 0,
    thresholdErrors,
    files: Array.from(fileStats.values()),
    failures
  };

  console.log('\n[E2E Runner] Summary:', JSON.stringify({
    total,
    passed,
    failed,
    skipped,
    durationMs,
    tiers: countsByTier,
    thresholdsChecked,
    thresholdsMet: report.thresholdsMet
  }));

  if (thresholdErrors.length > 0) {
    console.error('[E2E Runner] Threshold failure(s):', thresholdErrors.join('; '));
  }

  if (args.jsonPath) {
    const outAbs = path.isAbsolute(args.jsonPath)
      ? args.jsonPath
      : path.resolve(process.cwd(), args.jsonPath);
    fs.mkdirSync(path.dirname(outAbs), { recursive: true });
    fs.writeFileSync(outAbs, JSON.stringify(report, null, 2), 'utf8');
    console.log(`[E2E Runner] JSON report written to ${outAbs}`);
  }

  const ok = !anyFailEvent && failed === 0 && total > 0 && thresholdErrors.length === 0;
  process.exit(ok ? 0 : 1);
}

const isDirectEntry =
  Boolean(process.argv[1]) &&
  path.normalize(path.resolve(process.argv[1])).toLowerCase() ===
    path.normalize(fileURLToPath(import.meta.url)).toLowerCase();

if (isDirectEntry) {
  main().catch((err) => {
    console.error('[E2E Runner] Fatal error:', err?.message || err);
    process.exit(1);
  });
}
