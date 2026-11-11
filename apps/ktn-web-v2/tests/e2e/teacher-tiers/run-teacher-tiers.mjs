#!/usr/bin/env node
/**
 * Master Test Runner for KTN Teacher Management 4-Tier E2E Test Suite
 * 
 * Usage:
 *   node tests/e2e/teacher-tiers/run-teacher-tiers.mjs
 *   node tests/e2e/teacher-tiers/run-teacher-tiers.mjs --tier 1
 *   node tests/e2e/teacher-tiers/run-teacher-tiers.mjs --tier 2
 *   node tests/e2e/teacher-tiers/run-teacher-tiers.mjs --tier 3
 *   node tests/e2e/teacher-tiers/run-teacher-tiers.mjs --tier 4
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  startTestServer,
  stopTestServer,
  launchTestBrowser,
  REPORT_DIR,
} from './test-harness-utils.mjs';
import { runTier1 } from './tier1-feature-coverage.test.mjs';
import { runTier2 } from './tier2-boundary-corner.test.mjs';
import { runTier3 } from './tier3-cross-feature.test.mjs';
import { runTier4 } from './tier4-real-world-scenarios.test.mjs';

// Parse CLI Arguments
const args = process.argv.slice(2);
let selectedTier = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--tier' && args[i + 1]) {
    selectedTier = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i].startsWith('--tier=')) {
    selectedTier = parseInt(args[i].split('=')[1], 10);
  }
}

async function main() {
  const startTime = Date.now();
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║     KTN TEACHER MANAGEMENT UPGRADE — 4-TIER E2E TEST SUITE   ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`Execution Mode: ${selectedTier ? `Tier ${selectedTier} only` : 'All Tiers (1 to 4)'}`);

  console.log('\n[Runner] Booting Vite Dev Server with embedded Cloudflare Worker BFF...');
  const { viteServer, baseUrl, port } = await startTestServer();
  console.log(`[Runner] Server listening on ${baseUrl} (Port ${port})`);

  console.log('[Runner] Launching headless browser (Edge/Chrome)...');
  const browser = await launchTestBrowser();
  console.log(`[Runner] Browser launched successfully (Chromium v${browser.version()})\n`);

  const results = [];

  try {
    if (!selectedTier || selectedTier === 1) {
      await runTier1(browser, baseUrl, results);
    }
    if (!selectedTier || selectedTier === 2) {
      await runTier2(browser, baseUrl, results);
    }
    if (!selectedTier || selectedTier === 3) {
      await runTier3(browser, baseUrl, results);
    }
    if (!selectedTier || selectedTier === 4) {
      await runTier4(browser, baseUrl, results);
    }
  } catch (err) {
    console.error('\n[Runner] Fatal suite execution error:', err);
  } finally {
    console.log('\n[Runner] Closing browser and shutting down test server...');
    await browser.close().catch(() => null);
    await stopTestServer(viteServer).catch(() => null);
  }

  // Summary and statistics
  const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const passRate = total > 0 ? ((passed / total) * 100).toFixed(1) : 0;

  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('                      TEST EXECUTION SUMMARY                    ');
  console.log('════════════════════════════════════════════════════════════════');
  console.log(`  Total Tests Run : ${total}`);
  console.log(`  Passed Tests    : ${passed}`);
  console.log(`  Failed Tests    : ${failed}`);
  console.log(`  Pass Rate       : ${passRate}%`);
  console.log(`  Duration        : ${totalDuration}s`);
  console.log('════════════════════════════════════════════════════════════════');

  // Breakdown by tier
  const tiers = ['Tier 1', 'Tier 2', 'Tier 3', 'Tier 4'];
  for (const tier of tiers) {
    const tierTests = results.filter((r) => r.tier === tier);
    if (tierTests.length > 0) {
      const tierPassed = tierTests.filter((r) => r.passed).length;
      console.log(`  ${tier}: ${tierPassed}/${tierTests.length} passed (${((tierPassed / tierTests.length) * 100).toFixed(0)}%)`);
    }
  }
  console.log('════════════════════════════════════════════════════════════════\n');

  // Write JSON report
  if (!fs.existsSync(REPORT_DIR)) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
  }
  const reportPath = path.join(REPORT_DIR, 'teacher-tiers-report.json');
  const reportData = {
    suite: 'KTN Teacher Management Upgrade 4-Tier E2E',
    timestamp: new Date().toISOString(),
    totalDurationSeconds: parseFloat(totalDuration),
    summary: { total, passed, failed, passRate: `${passRate}%` },
    results,
  };
  fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2), 'utf8');
  console.log(`[Runner] Written execution report to: ${reportPath}`);

  if (failed > 0) {
    console.error(`\n❌ TEST SUITE FAILED: ${failed} out of ${total} tests failed.\n`);
    process.exit(1);
  } else {
    console.log(`\n✅ ALL ${total} TESTS PASSED CLEANLY (100% PASS RATE)!\n`);
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('[Runner] Unhandled top-level error:', err);
  process.exit(1);
});
