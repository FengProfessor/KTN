import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

console.log('=== [KTN Flashcards CI] Starting Verification Suite ===');

// 1. Load and evaluate data files in a VM context
const sandbox = { window: {} };
vm.createContext(sandbox);

const strokesCode = fs.readFileSync(path.join(ROOT, 'assets/js/strokes-data.js'), 'utf8');
const lo1Code = fs.readFileSync(path.join(ROOT, 'assets/js/cards-lo1.js'), 'utf8');
const dataCode = fs.readFileSync(path.join(ROOT, 'assets/js/cards-data.js'), 'utf8');

vm.runInContext(strokesCode, sandbox);
vm.runInContext(lo1Code, sandbox);
vm.runInContext(dataCode, sandbox);

const byLevel = sandbox.window.FLASHCARDS_DATA_BY_LEVEL;
const strokes = sandbox.window.HANZI_STROKE_DATA;

assert.ok(byLevel, 'window.FLASHCARDS_DATA_BY_LEVEL must be defined');
assert.ok(strokes, 'window.HANZI_STROKE_DATA must be defined');

// 2. Verify exact card counts for all 7 Lộ & Audio Quality Audit fields
const EXPECTED_COUNTS = {
  lo1: 90,
  lo2: 109,
  lo3: 96,
  lo4: 100,
  lo5: 92,
  lo6: 88,
  lo7: 30,
};

let totalCards = 0;
let missingImages = 0;
let missingAudio = 0;
let missingStrokes = 0;
const typeSummary = { native_exact: 0, native_concat: 0 };
const statusSummary = { APPROVED: 0, NEEDS_REPLACEMENT: 0, PENDING_REVIEW: 0 };

for (const [levelKey, expectedCount] of Object.entries(EXPECTED_COUNTS)) {
  const cards = byLevel[levelKey];
  assert.ok(Array.isArray(cards), `${levelKey} must be an array`);
  assert.equal(cards.length, expectedCount, `${levelKey} must have exactly ${expectedCount} cards (got ${cards.length})`);
  totalCards += cards.length;

  for (const card of cards) {
    assert.ok(card.id >= 1, `${levelKey} card id must be >= 1`);
    assert.ok(card.word && card.word.length > 0, `${levelKey} card #${card.id} must have word`);
    assert.ok(card.pinyin && card.pinyin.length > 0, `${levelKey} card #${card.id} must have pinyin`);
    assert.ok(card.meaning_vi && card.meaning_vi.length > 0, `${levelKey} card #${card.id} must have meaning_vi`);
    assert.ok(
      card.audio_type === 'native_exact' || card.audio_type === 'native_concat',
      `${levelKey} card #${card.id} must have valid audio_type`
    );
    assert.ok(
      card.audio_status === 'APPROVED' || card.audio_status === 'NEEDS_REPLACEMENT' || card.audio_status === 'PENDING_REVIEW',
      `${levelKey} card #${card.id} must have valid audio_status`
    );
    typeSummary[card.audio_type]++;
    statusSummary[card.audio_status]++;

    for (const imgField of ['front_img', 'back_img', 'thumb_img']) {
      const rel = card[imgField];
      assert.ok(rel && rel.endsWith('.webp'), `${levelKey} card #${card.id} ${imgField} must be a .webp path`);
      const fullImg = path.join(ROOT, rel);
      if (!fs.existsSync(fullImg) || fs.statSync(fullImg).size < 500) {
        missingImages++;
        console.error(`Missing or empty image: ${rel}`);
      }
    }

    const fullAudio = path.join(ROOT, card.audio);
    if (!fs.existsSync(fullAudio) || fs.statSync(fullAudio).size < 1000) {
      missingAudio++;
      console.error(`Missing or empty audio: ${card.audio}`);
    }

    for (const ch of card.hanzi_chars || []) {
      if (!strokes[ch] || !Array.isArray(strokes[ch].strokes) || strokes[ch].strokes.length === 0) {
        missingStrokes++;
        console.error(`Missing offline stroke data for char: ${ch} in ${levelKey} #${card.id}`);
      }
    }
  }
}

assert.equal(totalCards, 605, 'Total cards across all 7 Lộ must equal 605');
assert.equal(typeSummary.native_exact, 484, 'native_exact count must remain 484');
assert.equal(typeSummary.native_concat, 121, 'native_concat count must remain 121');
assert.equal(statusSummary.APPROVED + statusSummary.NEEDS_REPLACEMENT + statusSummary.PENDING_REVIEW, 605);
assert.equal(missingImages, 0, 'All 1,815 front/back/thumb WebP images must exist on disk');
assert.equal(missingAudio, 0, 'All audio files for 605 cards must exist on disk');
assert.equal(missingStrokes, 0, 'All Hanzi characters across 605 cards must have offline stroke data');
console.log(
  `✓ Verified all 7 Lộ (605 cards: ${typeSummary.native_exact} exact / ${typeSummary.native_concat} concat; ` +
    `${statusSummary.APPROVED} APPROVED, ${statusSummary.NEEDS_REPLACEMENT} NEEDS_REPLACEMENT, ${statusSummary.PENDING_REVIEW} PENDING_REVIEW), ` +
    `1,815 WebP images, and 617 offline stroke entries.`
);

// 3. Verify Phase 1 & Phase 2 Audio Audit artifacts exist and are consistent
const auditJsonPath = path.join(ROOT, 'audio-quality-audit.json');
const auditCsvPath = path.join(ROOT, 'audio-quality-audit.csv');
const recListPath = path.join(ROOT, 'recording-needed-list.csv');
const reviewHtmlPath = path.join(ROOT, 'audio-review.html');

assert.ok(fs.existsSync(auditJsonPath), 'audio-quality-audit.json must exist');
assert.ok(fs.existsSync(auditCsvPath), 'audio-quality-audit.csv must exist');
assert.ok(fs.existsSync(recListPath), 'recording-needed-list.csv must exist');
assert.ok(fs.existsSync(reviewHtmlPath), 'audio-review.html must exist');

const auditData = JSON.parse(fs.readFileSync(auditJsonPath, 'utf8'));
assert.equal(auditData.total_cards, 605, 'audio-quality-audit.json must contain 605 cards');
assert.equal(auditData.type_summary.native_exact, 484, 'audit JSON native_exact must be 484');
assert.equal(auditData.type_summary.native_concat, 121, 'audit JSON native_concat must be 121');

// Verify specific critical words from Phase 1.3
const cardLiangShuang = byLevel.lo6.find(c => c.word === '凉爽');
assert.equal(cardLiangShuang.audio_status, 'NEEDS_REPLACEMENT', '凉爽 (missing 2nd syllable) must be NEEDS_REPLACEMENT');
const cardNar = byLevel.lo1.find(c => c.word === '哪儿');
assert.equal(cardNar.audio_type, 'native_concat', '哪儿 must keep native_concat label per Rule 1.1');
assert.equal(cardNar.audio_status, 'APPROVED', '哪儿 (replaced by single-take Shtooka File:Zh-nǎr.ogg) must be APPROVED');
const cardNiHao = byLevel.lo1.find(c => c.word === '你好');
assert.equal(cardNiHao.audio_status, 'NEEDS_REPLACEMENT', '你好 (stitched sandhi) must be NEEDS_REPLACEMENT');
const cardXiaoNiao = byLevel.lo7.find(c => c.word === '小鸟');
assert.equal(cardXiaoNiao.audio_status, 'NEEDS_REPLACEMENT', '小鸟 (cross-corpus sandhi) must be NEEDS_REPLACEMENT');
const cardJiaJian = byLevel.lo7.find(c => c.word === '加减');
assert.equal(cardJiaJian.audio, 'assets/audio/cmn-加减.mp3', '加减 must point to full word audio cmn-加减.mp3');
assert.equal(cardJiaJian.audio_status, 'PENDING_REVIEW', '加减 (same-speaker concat) must be PENDING_REVIEW');
console.log('✓ Verified Phase 1 & Phase 2 audio audit inventory, CSV exports, and critical word classifications.');

// 4. Verify Lộ 4 card 58 (咳嗽) and card 59 (开水) fix
const lo4 = byLevel.lo4;
assert.equal(lo4[57].word, '咳嗽', 'Lộ 4 Card #58 must be 咳嗽');
assert.equal(lo4[57].meaning_vi, 'Ho', 'Lộ 4 Card #58 meaning_vi must be Ho');
assert.equal(lo4[58].word, '开水', 'Lộ 4 Card #59 must be 开水');
assert.equal(lo4[58].meaning_vi, 'Nước sôi', 'Lộ 4 Card #59 meaning_vi must be Nước sôi');
console.log('✓ Verified Lộ 4 Card #58 (咳嗽) & Card #59 (开水) data alignment.');

// 5. Verify Service Worker & Manifest exist and do not pre-cache all 605 images unconditionally
const swContent = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
assert.ok(swContent.includes('ktn-flashcards-shell-v3'), 'sw.js must use scoped cache name ktn-flashcards-shell-v3');
assert.ok(swContent.includes('MAX_MEDIA_ITEMS'), 'sw.js must cap media cache items');
console.log('✓ Verified Phase 7 scoped Service Worker (sw.js).');

console.log('=== [KTN Flashcards CI] ALL CHECKS PASSED SUCCESSFULLY ===');
