/**
 * KHỔNG TỬ NHÍ • FLASHCARD & LUYỆN VIẾT CHỮ HÁN (LỘ 1 – LỘ 7)
 * Cơ chế ôn tập đơn giản cố định 1–3–7–14–30 ngày (Không dùng FSRS / SM-2 / Anki)
 */

(function () {
  'use strict';

  // Lịch giãn ngày cố định khi bấm "Nhớ rồi": 1 -> 3 -> 7 -> 14 -> 30 ngày
  const FIXED_REVIEW_DAYS = [1, 3, 7, 14, 30];

  const LEVEL_LABELS = {
    lo1: 'Lộ 1 • 90 Thẻ Từ Vựng',
    lo2: 'Lộ 2 • 109 Thẻ Từ Vựng',
    lo3: 'Lộ 3 • 96 Thẻ Từ Vựng',
    lo4: 'Lộ 4 • 100 Thẻ Từ Vựng',
    lo5: 'Lộ 5 • 92 Thẻ Từ Vựng',
    lo6: 'Lộ 6 • 88 Thẻ Từ Vựng',
    lo7: 'Lộ 7 • 30 Thẻ Từ Vựng',
  };

  function getLevelCards(levelKey) {
    if (window.FLASHCARDS_DATA_BY_LEVEL && window.FLASHCARDS_DATA_BY_LEVEL[levelKey]) {
      return window.FLASHCARDS_DATA_BY_LEVEL[levelKey];
    }
    return window.FLASHCARDS_DATA || [];
  }

  function formatDateYMD(dateObj) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function addDaysYMD(baseYMD, daysToAdd) {
    const parts = (baseYMD || formatDateYMD(new Date())).split('-').map(Number);
    const dt = new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1, 12, 0, 0);
    dt.setDate(dt.getDate() + daysToAdd);
    return formatDateYMD(dt);
  }

  function getTodayYMD() {
    if (window.__KTN_MOCK_TODAY__) return window.__KTN_MOCK_TODAY__;
    return formatDateYMD(new Date());
  }

  const savedLevel = localStorage.getItem('ktn_flashcard_active_level') || 'lo1';

  const state = {
    activeLevel: LEVEL_LABELS[savedLevel] ? savedLevel : 'lo1',
    allCards: [],
    filteredCards: [],
    currentIndex: 0,
    isFlipped: false,
    activeCategory: 'all',
    drawerFilter: 'all',
    drawerSearchQuery: '',
    // Map<cardId, { cardId, level, reviewStep, nextReviewDate, lastReviewedAt, status }>
    recordsMap: {},
    // Legacy compatibility sets
    reviewSet: new Set(),
    masteredSet: new Set(),
    // HanziWriter state
    activeWriter: null,
    compoundWriters: [],
    isCompoundMode: false,
    compoundQuizActiveIdx: 0,
    currentCharList: [],
    activeCharIdx: 0,
    showOutline: true,
    isQuizMode: false,
  };

  state.allCards = getLevelCards(state.activeLevel);
  state.filteredCards = [...state.allCards];

  const dom = {
    levelSelect: document.getElementById('levelSelect'),
    networkBadge: document.getElementById('networkBadge'),
    categoryNav: document.getElementById('categoryNav'),
    progressBarFill: document.getElementById('progressBarFill'),
    currentCardIndexText: document.getElementById('currentCardIndexText'),
    currentCardStatus: document.getElementById('currentCardStatus'),
    headerWordCount: document.getElementById('headerWordCount'),
    todayReviewBanner: document.getElementById('todayReviewBanner'),
    todayReviewMessage: document.getElementById('todayReviewMessage'),
    dueTodayBannerNum: document.getElementById('dueTodayBannerNum'),
    btnStartTodayReview: document.getElementById('btnStartTodayReview'),
    statDuePill: document.getElementById('statDuePill'),
    statRememberedPill: document.getElementById('statRememberedPill'),
    statRelearnPill: document.getElementById('statRelearnPill'),
    statDueCount: document.getElementById('statDueCount'),
    statRememberedCount: document.getElementById('statRememberedCount'),
    statRelearnCount: document.getElementById('statRelearnCount'),
    cardScene: document.getElementById('cardScene'),
    flashcard: document.getElementById('flashcard'),
    cardFrontImg: document.getElementById('cardFrontImg'),
    cardBackImg: document.getElementById('cardBackImg'),
    btnAudioFront: document.getElementById('btnAudioFront'),
    btnAudioBack: document.getElementById('btnAudioBack'),
    audioFrontLabel: document.getElementById('audioFrontLabel'),
    audioBackLabel: document.getElementById('audioBackLabel'),
    btnBackToPortal: document.getElementById('btnBackToPortal'),
    btnPrev: document.getElementById('btnPrev'),
    btnNext: document.getElementById('btnNext'),
    btnFlip: document.getElementById('btnFlip'),
    btnOpenWrite: document.getElementById('btnOpenWrite'),
    btnMarkReview: document.getElementById('btnMarkReview'),
    btnMarkMastered: document.getElementById('btnMarkMastered'),
    forgotSubHint: document.getElementById('forgotSubHint'),
    rememberedSubHint: document.getElementById('rememberedSubHint'),
    writeModal: document.getElementById('writeModal'),
    btnCloseWrite: document.getElementById('btnCloseWrite'),
    btnWriteAudio: document.getElementById('btnWriteAudio'),
    writeWordTitle: document.getElementById('writeWordTitle'),
    writePinyinTitle: document.getElementById('writePinyinTitle'),
    writeCharTabs: document.getElementById('writeCharTabs'),
    singleMeiziContainer: document.getElementById('singleMeiziContainer'),
    compoundMeiziContainer: document.getElementById('compoundMeiziContainer'),
    hanziWriterTarget: document.getElementById('hanziWriterTarget'),
    strokeOfflineNotice: document.getElementById('strokeOfflineNotice'),
    btnAnimateStroke: document.getElementById('btnAnimateStroke'),
    btnQuizStroke: document.getElementById('btnQuizStroke'),
    btnResetStroke: document.getElementById('btnResetStroke'),
    btnToggleOutline: document.getElementById('btnToggleOutline'),
    quizSuccessOverlay: document.getElementById('quizSuccessOverlay'),
    quizMistakeFeedback: document.getElementById('quizMistakeFeedback'),
    btnNextCharOrClose: document.getElementById('btnNextCharOrClose'),
    btnDrawerOpen: document.getElementById('btnDrawerOpen'),
    btnDrawerClose: document.getElementById('btnDrawerClose'),
    wordDrawerBackdrop: document.getElementById('wordDrawerBackdrop'),
    drawerWordList: document.getElementById('drawerWordList'),
    drawerSubtitle: document.getElementById('drawerSubtitle'),
    drawerSearchInput: document.getElementById('drawerSearchInput'),
    drawerFilterChips: document.querySelectorAll('.drawer-chip'),
    toastMessage: document.getElementById('toastMessage'),
    nativeAudioPlayer: document.getElementById('nativeAudioPlayer'),
  };

  // ==============================================================
  // STORAGE & MIGRATION (Phase 2)
  // Lưu tối thiểu: cardId, level, reviewStep, nextReviewDate, lastReviewedAt
  // ==============================================================
  function getSrsStorageKey(level) {
    return `ktn_flashcard_srs_v2_${level || state.activeLevel}`;
  }

  function getLegacyStorageKey(level) {
    return `ktn_flashcard_progress_${level || state.activeLevel}`;
  }

  function syncLegacySetsFromRecords() {
    state.reviewSet = new Set();
    state.masteredSet = new Set();
    Object.values(state.recordsMap).forEach(rec => {
      if (!rec || !rec.cardId) return;
      if (rec.reviewStep >= 1) {
        state.masteredSet.add(rec.cardId);
      } else if (rec.status === 'forgot' || rec.reviewStep === 0) {
        state.reviewSet.add(rec.cardId);
      }
    });
  }

  function loadProgress() {
    state.recordsMap = {};
    const today = getTodayYMD();
    const validCardIds = new Set((state.allCards || []).map(c => Number(c.id)));

    try {
      const rawV2 = localStorage.getItem(getSrsStorageKey());
      if (rawV2) {
        const parsed = JSON.parse(rawV2);
        if (parsed && typeof parsed === 'object') {
          Object.keys(parsed).forEach(k => {
            const rec = parsed[k];
            if (rec && rec.cardId != null) {
              const cid = Number(rec.cardId);
              if (rec.level && rec.level !== state.activeLevel) return;
              if (validCardIds.size > 0 && !validCardIds.has(cid)) return;
              state.recordsMap[cid] = {
                cardId: cid,
                level: state.activeLevel,
                reviewStep: Number(rec.reviewStep || 0),
                nextReviewDate: rec.nextReviewDate || today,
                lastReviewedAt: rec.lastReviewedAt || new Date().toISOString(),
                status: rec.status || (Number(rec.reviewStep) > 0 ? 'remembered' : 'forgot'),
              };
            }
          });
        }
      }

      // Chuyển đổi có kiểm soát từ dữ liệu cũ "Cần ôn / Đã thuộc"
      const rawLegacy = localStorage.getItem(getLegacyStorageKey());
      if (rawLegacy) {
        const leg = JSON.parse(rawLegacy);
        let migrated = false;
        if (leg && Array.isArray(leg.review)) {
          leg.review.forEach(cid => {
            const numId = Number(cid);
            if (!state.recordsMap[numId] && (validCardIds.size === 0 || validCardIds.has(numId))) {
              state.recordsMap[numId] = {
                cardId: numId,
                level: state.activeLevel,
                reviewStep: 0,
                nextReviewDate: today,
                lastReviewedAt: new Date().toISOString(),
                status: 'forgot',
              };
              migrated = true;
            }
          });
        }
        if (leg && Array.isArray(leg.mastered)) {
          leg.mastered.forEach(cid => {
            const numId = Number(cid);
            if (!state.recordsMap[numId] && (validCardIds.size === 0 || validCardIds.has(numId))) {
              state.recordsMap[numId] = {
                cardId: numId,
                level: state.activeLevel,
                reviewStep: 1,
                nextReviewDate: addDaysYMD(today, 1),
                lastReviewedAt: new Date().toISOString(),
                status: 'remembered',
              };
              migrated = true;
            }
          });
        }
        if (migrated) {
          saveProgress();
        }
      }
    } catch (e) {
      console.warn('Could not load flashcard progress:', e);
    }

    syncLegacySetsFromRecords();
  }

  function saveProgress() {
    try {
      syncLegacySetsFromRecords();
      localStorage.setItem(getSrsStorageKey(), JSON.stringify(state.recordsMap));
      // Giữ tương thích ngược với cấu trúc cũ
      localStorage.setItem(
        getLegacyStorageKey(),
        JSON.stringify({
          review: Array.from(state.reviewSet),
          mastered: Array.from(state.masteredSet),
        })
      );

      // Nếu có tài khoản KTN đăng nhập sẵn trên cùng origin, lưu bản đồng bộ theo user
      const ktnUserRaw = localStorage.getItem('ktn_user') || localStorage.getItem('user');
      if (ktnUserRaw) {
        try {
          const u = JSON.parse(ktnUserRaw);
          const uid = u.id || u.username || u.email;
          if (uid) {
            localStorage.setItem(`ktn_flashcard_user_${uid}_${state.activeLevel}`, JSON.stringify(state.recordsMap));
          }
        } catch (_) {}
      }
    } catch (e) {
      console.warn('Could not save flashcard progress:', e);
    }
    updateStatusCounters();
    renderDrawerList();
  }

  function isCardDueToday(cardId) {
    const rec = state.recordsMap[cardId];
    if (!rec || !rec.nextReviewDate) return false;
    if (rec.level && rec.level !== state.activeLevel) return false;
    const today = getTodayYMD();
    return rec.nextReviewDate <= today;
  }

  function getDueCardsForCurrentLevel() {
    return state.allCards.filter(c => isCardDueToday(c.id));
  }

  function getNextIntervalDaysForCard(cardId) {
    const rec = state.recordsMap[cardId];
    const currentStep = rec && rec.reviewStep > 0 ? rec.reviewStep : 0;
    const idx = Math.min(currentStep, FIXED_REVIEW_DAYS.length - 1);
    return FIXED_REVIEW_DAYS[idx];
  }

  // ==============================================================
  // PHASE 2 REVIEW ACTIONS: "QUÊN RỒI" & "NHỚ RỒI"
  // ==============================================================
  function markCardForgot() {
    const card = getCurrentCard();
    if (!card) return;

    const today = getTodayYMD();
    const tomorrow = addDaysYMD(today, 1);

    // 1. Reset chuỗi nhớ liên tiếp về 0 & đặt lịch ôn tiếp vào ngày mai
    state.recordsMap[card.id] = {
      cardId: card.id,
      level: state.activeLevel,
      reviewStep: 0,
      nextReviewDate: tomorrow,
      lastReviewedAt: new Date().toISOString(),
      status: 'forgot',
    };

    // 2. Đưa từ xuất hiện lại sau 3–5 thẻ khác trong phiên hiện tại (hoặc cuối phiên nếu còn ít hơn 3 thẻ)
    const remainingAfterCurrent = state.filteredCards.length - 1 - state.currentIndex;
    const offset = remainingAfterCurrent >= 3
      ? Math.min(remainingAfterCurrent, 3 + Math.floor(Math.random() * 3))
      : Math.max(1, remainingAfterCurrent + 1);

    const insertPos = Math.min(state.filteredCards.length, state.currentIndex + offset + 1);
    state.filteredCards.splice(insertPos, 0, card);

    saveProgress();
    showToast(`🔄 Quên rồi: "${card.word}" sẽ xuất hiện lại sau ${Math.min(offset, Math.max(1, remainingAfterCurrent))} thẻ & ôn lại ngày mai`);

    // Tự động chuyển sang thẻ kế tiếp nếu có nhiều hơn 1 thẻ
    if (state.currentIndex < state.filteredCards.length - 1) {
      state.currentIndex++;
    }
    renderCurrentCard();
  }

  function markCardRemembered() {
    const card = getCurrentCard();
    if (!card) return;

    const today = getTodayYMD();
    const prevRec = state.recordsMap[card.id];
    const prevStep = prevRec && prevRec.reviewStep > 0 ? prevRec.reviewStep : 0;
    const newStep = prevStep + 1;
    const dayIdx = Math.min(newStep - 1, FIXED_REVIEW_DAYS.length - 1);
    const intervalDays = FIXED_REVIEW_DAYS[dayIdx];
    const nextDate = addDaysYMD(today, intervalDays);

    state.recordsMap[card.id] = {
      cardId: card.id,
      level: state.activeLevel,
      reviewStep: newStep,
      nextReviewDate: nextDate,
      lastReviewedAt: new Date().toISOString(),
      status: 'remembered',
    };

    saveProgress();
    showToast(`✅ Nhớ rồi: "${card.word}" — Hẹn ôn lại sau ${intervalDays} ngày (${nextDate})`);

    if (state.currentIndex < state.filteredCards.length - 1) {
      state.currentIndex++;
      renderCurrentCard();
    } else {
      renderCurrentCard();
    }
  }

  function startTodayReview() {
    const dueCards = getDueCardsForCurrentLevel();
    if (dueCards.length > 0) {
      applyFilter('due');
      showToast(`🌱 Bắt đầu ôn ${dueCards.length} từ cần ôn hôm nay!`);
    } else {
      // Nếu chưa có từ nào đến hạn, gợi ý học nhẹ 8 từ chưa học thay vì bắt học cả 90 thẻ
      const unlearned = state.allCards.filter(c => !state.recordsMap[c.id]).slice(0, 8);
      if (unlearned.length > 0) {
        state.activeCategory = 'due';
        state.filteredCards = unlearned;
        state.currentIndex = 0;
        updateActiveNavChip('due');
        renderCurrentCard();
        showToast(`🌱 Khởi động nhẹ với ${unlearned.length} từ mới trong vài phút nhé!`);
      } else {
        applyFilter('all');
        showToast('🎉 Em đã hoàn thành xuất sắc lịch ôn hôm nay!');
      }
    }
  }

  // ==============================================================
  // CATEGORY & FILTER NAVIGATION
  // ==============================================================
  function getCategories() {
    const cats = new Set();
    state.allCards.forEach(c => {
      if (c.category) cats.add(c.category);
    });
    return Array.from(cats);
  }

  function renderCategoryNav() {
    if (!dom.categoryNav) return;
    dom.categoryNav.innerHTML = '';

    const dueCount = getDueCardsForCurrentLevel().length;
    const relearnCount = state.reviewSet.size;
    const rememberedCount = state.masteredSet.size;

    const allChip = createChip(`Tất cả (${state.allCards.length})`, 'all', state.activeCategory === 'all');
    const dueChip = createChip(`🌱 Hôm nay (${dueCount})`, 'due', state.activeCategory === 'due', 'nav-chip-due');
    const reviewChip = createChip(`🔄 Học lại (${relearnCount})`, 'review', state.activeCategory === 'review', 'nav-chip-review');
    const masteredChip = createChip(`✅ Đã nhớ (${rememberedCount})`, 'mastered', state.activeCategory === 'mastered', 'nav-chip-mastered');

    dom.categoryNav.appendChild(allChip);
    dom.categoryNav.appendChild(dueChip);
    dom.categoryNav.appendChild(reviewChip);
    dom.categoryNav.appendChild(masteredChip);

    getCategories().forEach(cat => {
      const count = state.allCards.filter(c => c.category === cat).length;
      const chip = createChip(`${cat} (${count})`, cat, state.activeCategory === cat);
      dom.categoryNav.appendChild(chip);
    });
  }

  function createChip(label, value, isActive, extraClass = '') {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `nav-chip ${extraClass} ${isActive ? 'active' : ''}`.trim();
    btn.textContent = label;
    btn.dataset.filter = value;
    btn.addEventListener('click', () => applyFilter(value));
    return btn;
  }

  function updateActiveNavChip(filterValue) {
    if (!dom.categoryNav) return;
    dom.categoryNav.querySelectorAll('.nav-chip').forEach(chip => {
      chip.classList.toggle('active', chip.dataset.filter === filterValue);
    });
  }

  function applyFilter(filterValue) {
    state.activeCategory = filterValue;

    if (filterValue === 'all') {
      state.filteredCards = [...state.allCards];
    } else if (filterValue === 'due') {
      const due = getDueCardsForCurrentLevel();
      if (due.length === 0) {
        showToast('🌱 Chưa có từ đến hạn hôm nay — hiển thị 8 từ gợi ý!');
        state.filteredCards = state.allCards.filter(c => !state.recordsMap[c.id]).slice(0, 8);
        if (state.filteredCards.length === 0) state.filteredCards = [...state.allCards];
      } else {
        state.filteredCards = due;
      }
    } else if (filterValue === 'review') {
      const rev = state.allCards.filter(c => state.reviewSet.has(c.id));
      if (rev.length === 0) {
        showToast('Chưa có từ nào trong mục Cần học lại!');
        state.activeCategory = 'all';
        state.filteredCards = [...state.allCards];
      } else {
        state.filteredCards = rev;
      }
    } else if (filterValue === 'mastered') {
      const mas = state.allCards.filter(c => state.masteredSet.has(c.id));
      if (mas.length === 0) {
        showToast('Chưa có từ nào trong mục Đã nhớ!');
        state.activeCategory = 'all';
        state.filteredCards = [...state.allCards];
      } else {
        state.filteredCards = mas;
      }
    } else {
      state.filteredCards = state.allCards.filter(c => c.category === filterValue);
    }

    state.currentIndex = 0;
    state.isFlipped = false;
    updateActiveNavChip(state.activeCategory);
    renderCurrentCard();
  }

  function updateStatusCounters() {
    const dueCount = getDueCardsForCurrentLevel().length;
    const rememberedCount = state.masteredSet.size;
    const relearnCount = state.reviewSet.size;

    if (dom.statDueCount) dom.statDueCount.textContent = String(dueCount);
    if (dom.statRememberedCount) dom.statRememberedCount.textContent = String(rememberedCount);
    if (dom.statRelearnCount) dom.statRelearnCount.textContent = String(relearnCount);
    if (dom.dueTodayBannerNum) dom.dueTodayBannerNum.textContent = String(dueCount);

    if (dom.todayReviewMessage) {
      if (dueCount > 0) {
        dom.todayReviewMessage.innerHTML = `🌱 Hôm nay em có <strong id="dueTodayBannerNum">${dueCount}</strong> từ cần ôn — Học trong vài phút nhé!`;
      } else if (rememberedCount > 0) {
        dom.todayReviewMessage.innerHTML = `🎉 Hôm nay em có <strong id="dueTodayBannerNum">0</strong> từ đến hạn — Đã nhớ <strong>${rememberedCount}</strong> từ!`;
      } else {
        const sugerCount = Math.min(8, state.allCards.length);
        dom.todayReviewMessage.innerHTML = `🌱 Hôm nay em có thể khởi động nhẹ <strong>${sugerCount}</strong> từ mới trong vài phút nhé!`;
      }
    }

    if (dom.categoryNav) {
      const allChip = dom.categoryNav.querySelector('[data-filter="all"]');
      const dueChip = dom.categoryNav.querySelector('[data-filter="due"]');
      const reviewChip = dom.categoryNav.querySelector('[data-filter="review"]');
      const masteredChip = dom.categoryNav.querySelector('[data-filter="mastered"]');
      if (allChip) allChip.textContent = `Tất cả (${state.allCards.length})`;
      if (dueChip) dueChip.textContent = `🌱 Hôm nay (${dueCount})`;
      if (reviewChip) reviewChip.textContent = `🔄 Học lại (${relearnCount})`;
      if (masteredChip) masteredChip.textContent = `✅ Đã nhớ (${rememberedCount})`;
    }

    // Update drawer filter chip labels
    const dAll = document.querySelector('[data-drawer-filter="all"]');
    const dDue = document.querySelector('[data-drawer-filter="due"]');
    const dRev = document.querySelector('[data-drawer-filter="review"]');
    const dMas = document.querySelector('[data-drawer-filter="mastered"]');
    if (dAll) dAll.textContent = `Tất cả (${state.allCards.length})`;
    if (dDue) dDue.textContent = `🌱 Hôm nay (${dueCount})`;
    if (dRev) dRev.textContent = `🔄 Học lại (${relearnCount})`;
    if (dMas) dMas.textContent = `✅ Đã nhớ (${rememberedCount})`;
  }

  function switchLevel(newLevel) {
    if (!LEVEL_LABELS[newLevel]) return;
    state.activeLevel = newLevel;
    localStorage.setItem('ktn_flashcard_active_level', newLevel);

    state.allCards = getLevelCards(newLevel);
    loadProgress();

    state.activeCategory = 'all';
    state.filteredCards = [...state.allCards];
    state.currentIndex = 0;
    state.isFlipped = false;

    if (dom.levelSelect) dom.levelSelect.value = newLevel;
    if (dom.drawerSubtitle) {
      dom.drawerSubtitle.textContent = LEVEL_LABELS[newLevel];
    }

    renderCategoryNav();
    updateStatusCounters();
    renderCurrentCard();
    renderDrawerList();
    showToast(`Đã chuyển sang ${LEVEL_LABELS[newLevel]}`);
  }

  // ==============================================================
  // RENDER CURRENT CARD & ADJACENT PRELOAD (Phase 4)
  // ==============================================================
  function getCurrentCard() {
    return state.filteredCards[state.currentIndex] || state.allCards[0];
  }

  const preloadedSet = new Set();
  function preloadAdjacentCards() {
    const indices = [state.currentIndex + 1, state.currentIndex - 1];
    indices.forEach(idx => {
      if (idx >= 0 && idx < state.filteredCards.length) {
        const c = state.filteredCards[idx];
        if (c && c.front_img && !preloadedSet.has(c.front_img)) {
          preloadedSet.add(c.front_img);
          const imgF = new Image();
          imgF.src = c.front_img;
          if (c.back_img) {
            const imgB = new Image();
            imgB.src = c.back_img;
          }
        }
      }
    });
  }

  function isCardAudioApproved(card) {
    if (!card) return false;
    if (card.audio_status) {
      return card.audio_status === 'APPROVED';
    }
    return card.audio_type === 'native_exact';
  }

  function updateAudioButtonsForCard(card) {
    const approved = isCardAudioApproved(card);
    clearAudioPlayingVisual();
    [dom.btnAudioFront, dom.btnAudioBack, dom.btnWriteAudio].forEach(btn => {
      if (!btn) return;
      btn.classList.toggle('is-unverified-audio', !approved);
      btn.setAttribute('aria-disabled', approved ? 'false' : 'true');
      btn.dataset.audioApproved = approved ? 'true' : 'false';
      btn.dataset.audioStatus = (card && card.audio_status) || (approved ? 'APPROVED' : 'PENDING_REVIEW');
      btn.title = approved
        ? 'Phát âm tiếng Trung bản xứ đã kiểm định'
        : 'Đang cập nhật phát âm chuẩn cho từ này';
    });
    if (dom.audioFrontLabel) {
      dom.audioFrontLabel.hidden = approved;
      dom.audioFrontLabel.textContent = 'Đang cập nhật phát âm';
    }
    if (dom.audioBackLabel) {
      dom.audioBackLabel.textContent = approved ? 'Cách đọc' : 'Đang cập nhật phát âm';
    }
  }

  function renderCurrentCard() {
    const card = getCurrentCard();
    if (!card) return;

    state.isFlipped = false;
    if (dom.flashcard) dom.flashcard.classList.remove('is-flipped');

    if (dom.cardFrontImg) {
      if (dom.cardFrontImg.getAttribute('src') !== card.front_img) {
        dom.cardFrontImg.src = card.front_img;
      }
      dom.cardFrontImg.alt = `${card.word} (${card.pinyin}) - Mặt trước`;
    }
    if (dom.cardBackImg) {
      if (dom.cardBackImg.getAttribute('src') !== card.back_img) {
        dom.cardBackImg.src = card.back_img;
      }
      dom.cardBackImg.alt = `${card.word} (${card.meaning_vi}) - Mặt sau`;
    }

    updateAudioButtonsForCard(card);

    const currentNum = state.currentIndex + 1;
    const totalNum = Math.max(1, state.filteredCards.length);
    const percent = Math.round((currentNum / totalNum) * 100);

    if (dom.progressBarFill) dom.progressBarFill.style.width = percent + '%';
    if (dom.currentCardIndexText) dom.currentCardIndexText.textContent = `Từ ${currentNum} / ${totalNum}`;
    if (dom.headerWordCount) dom.headerWordCount.textContent = `${currentNum}/${totalNum}`;

    const rec = state.recordsMap[card.id];
    const nextDays = getNextIntervalDaysForCard(card.id);
    if (dom.rememberedSubHint) {
      dom.rememberedSubHint.textContent = `+${nextDays} ngày`;
    }

    if (dom.currentCardStatus) {
      if (rec && rec.reviewStep >= 1) {
        const stepDays = FIXED_REVIEW_DAYS[Math.min(rec.reviewStep - 1, FIXED_REVIEW_DAYS.length - 1)];
        dom.currentCardStatus.textContent = `✅ Đã nhớ (bước ${rec.reviewStep} • ${stepDays} ngày)`;
        dom.currentCardStatus.className = 'status-chip status-mastered';
      } else if (rec && rec.status === 'forgot') {
        dom.currentCardStatus.textContent = '🔄 Cần học lại';
        dom.currentCardStatus.className = 'status-chip status-review';
      } else {
        dom.currentCardStatus.textContent = 'Chưa học';
        dom.currentCardStatus.className = 'status-chip';
      }
    }

    if (dom.btnMarkReview) {
      dom.btnMarkReview.classList.toggle('is-active', Boolean(rec && rec.status === 'forgot'));
    }
    if (dom.btnMarkMastered) {
      dom.btnMarkMastered.classList.toggle('is-active', Boolean(rec && rec.reviewStep >= 1));
    }

    // Highlight active item in sidebar/drawer without re-rendering full DOM if already rendered
    if (dom.drawerWordList) {
      dom.drawerWordList.querySelectorAll('.drawer-item').forEach(el => {
        el.classList.toggle('active', Number(el.dataset.cardId) === card.id);
      });
    }

    preloadAdjacentCards();
  }

  // ==============================================================
  // NAVIGATION & AUDIO (Phase 5)
  // ==============================================================
  function nextCard() {
    if (state.currentIndex < state.filteredCards.length - 1) {
      state.currentIndex++;
      renderCurrentCard();
    } else {
      state.currentIndex = 0;
      renderCurrentCard();
      showToast('Đã hoàn thành lượt xem! Quay lại từ đầu.');
    }
  }

  function prevCard() {
    if (state.currentIndex > 0) {
      state.currentIndex--;
      renderCurrentCard();
    } else {
      state.currentIndex = Math.max(0, state.filteredCards.length - 1);
      renderCurrentCard();
    }
  }

  function toggleFlip() {
    state.isFlipped = !state.isFlipped;
    if (dom.flashcard) dom.flashcard.classList.toggle('is-flipped', state.isFlipped);
  }

  function clearAudioPlayingVisual() {
    [dom.btnAudioFront, dom.btnAudioBack, dom.btnWriteAudio].forEach(btn => {
      if (btn) btn.classList.remove('is-playing');
    });
  }

  function playAudio(audioPath) {
    const card = getCurrentCard();
    if (!audioPath && card && !isCardAudioApproved(card)) {
      try {
        if (dom.nativeAudioPlayer) {
          dom.nativeAudioPlayer.pause();
          dom.nativeAudioPlayer.removeAttribute('src');
        }
      } catch (_) {}
      clearAudioPlayingVisual();
      showToast('⏳ Đang cập nhật phát âm chuẩn cho từ này — Em vẫn học hình, nghĩa và luyện viết bình thường nhé!');
      return false;
    }
    if (!audioPath) {
      audioPath = card ? card.audio : null;
    }
    if (!audioPath || !dom.nativeAudioPlayer) return false;

    // Ngăn phát chồng nhiều tệp âm thanh khi bấm liên tục
    try {
      dom.nativeAudioPlayer.pause();
      dom.nativeAudioPlayer.currentTime = 0;
    } catch (_) {}

    [dom.btnAudioFront, dom.btnAudioBack, dom.btnWriteAudio].forEach(btn => {
      if (btn) btn.classList.add('is-playing');
    });

    dom.nativeAudioPlayer.src = audioPath;
    const playPromise = dom.nativeAudioPlayer.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(err => {
        clearAudioPlayingVisual();
        console.warn('Audio play error:', err);
        showToast('⚠️ Chưa tải được âm thanh cho từ này');
      });
    }

    dom.nativeAudioPlayer.onended = clearAudioPlayingVisual;
    dom.nativeAudioPlayer.onerror = () => {
      clearAudioPlayingVisual();
      showToast('⚠️ Chưa tải được âm thanh cho từ này');
    };
    return true;
  }

  let toastTimer = null;
  function showToast(msg) {
    if (!dom.toastMessage) return;
    dom.toastMessage.textContent = msg;
    dom.toastMessage.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      dom.toastMessage.classList.remove('show');
    }, 2200);
  }

  // ==============================================================
  // HANZI WRITING & MỄ TỰ CÁCH (Phase 6)
  // ==============================================================
  function getOfflineStrokeData(ch) {
    if (window.HANZI_STROKE_DATA && window.HANZI_STROKE_DATA[ch]) {
      return window.HANZI_STROKE_DATA[ch];
    }
    if (window.HANZI_STROKES && window.HANZI_STROKES[ch]) {
      return window.HANZI_STROKES[ch];
    }
    return null;
  }

  function createCharDataLoader() {
    return function (ch, onComplete) {
      const local = getOfflineStrokeData(ch);
      if (local) {
        if (dom.strokeOfflineNotice) dom.strokeOfflineNotice.style.display = 'none';
        onComplete(local);
        return;
      }
      fetch(`https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0.1/${encodeURIComponent(ch)}.json`)
        .then(r => {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        })
        .then(data => {
          if (dom.strokeOfflineNotice) dom.strokeOfflineNotice.style.display = 'none';
          onComplete(data);
        })
        .catch(() => {
          if (dom.strokeOfflineNotice) {
            dom.strokeOfflineNotice.textContent = `⚠️ Chưa có dữ liệu nét viết offline cho chữ "${ch}". Vui lòng kiểm tra kết nối mạng.`;
            dom.strokeOfflineNotice.style.display = 'block';
          }
        });
    };
  }

  function openWriteModal() {
    const card = getCurrentCard();
    if (!card) return;

    const cleanChars = (card.hanzi_chars && card.hanzi_chars.length > 0)
      ? card.hanzi_chars
      : Array.from(card.word).filter(ch => ch >= '\u4e00' && ch <= '\u9fff');

    state.currentCharList = cleanChars.length > 0 ? cleanChars : [card.word];
    if (dom.strokeOfflineNotice) dom.strokeOfflineNotice.style.display = 'none';

    if (state.currentCharList.length > 1) {
      state.isCompoundMode = true;
      state.activeCharIdx = -1;
    } else {
      state.isCompoundMode = false;
      state.activeCharIdx = 0;
    }

    dom.writeWordTitle.textContent = card.word;
    dom.writePinyinTitle.textContent = `/${card.pinyin}/`;
    dom.writeModal.classList.add('open');

    renderWriteCharTabs();
    if (state.isCompoundMode) {
      initCompoundWriters(state.currentCharList);
    } else {
      initHanziWriter(state.currentCharList[0]);
    }
  }

  function closeWriteModal() {
    dom.writeModal.classList.remove('open');
    if (state.activeWriter) {
      try { state.activeWriter.cancelQuiz(); } catch (_) {}
    }
    if (state.compoundWriters && state.compoundWriters.length > 0) {
      state.compoundWriters.forEach(item => {
        try { item.writer.cancelQuiz(); } catch (_) {}
      });
    }
  }

  function renderWriteCharTabs() {
    dom.writeCharTabs.innerHTML = '';
    if (state.currentCharList.length <= 1) {
      dom.writeCharTabs.style.display = 'none';
      return;
    }

    dom.writeCharTabs.style.display = 'flex';

    const compoundBtn = document.createElement('button');
    compoundBtn.type = 'button';
    compoundBtn.className = `char-tab compound-tab ${state.isCompoundMode ? 'active' : ''}`;
    compoundBtn.innerHTML = `🀄 Ghép cả từ: <strong>${state.currentCharList.join('')}</strong>`;
    compoundBtn.addEventListener('click', () => {
      state.isCompoundMode = true;
      state.activeCharIdx = -1;
      renderWriteCharTabs();
      initCompoundWriters(state.currentCharList);
    });
    dom.writeCharTabs.appendChild(compoundBtn);

    state.currentCharList.forEach((ch, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `char-tab ${!state.isCompoundMode && idx === state.activeCharIdx ? 'active' : ''}`;
      btn.textContent = `Chữ ${idx + 1}: ${ch}`;
      btn.addEventListener('click', () => {
        state.isCompoundMode = false;
        state.activeCharIdx = idx;
        renderWriteCharTabs();
        initHanziWriter(state.currentCharList[state.activeCharIdx]);
      });
      dom.writeCharTabs.appendChild(btn);
    });
  }

  function initCompoundWriters(chars) {
    dom.quizSuccessOverlay.classList.remove('show');
    if (dom.singleMeiziContainer) dom.singleMeiziContainer.style.display = 'none';
    if (dom.compoundMeiziContainer) {
      dom.compoundMeiziContainer.style.display = 'flex';
      dom.compoundMeiziContainer.innerHTML = '';
    }

    state.activeWriter = null;
    state.compoundWriters = [];
    state.compoundQuizActiveIdx = 0;

    const svgGrid = `
      <svg class="meizi-grid-svg" viewBox="0 0 100 100">
        <line x1="0" y1="50" x2="100" y2="50" class="grid-line" />
        <line x1="50" y1="0" x2="50" y2="100" class="grid-line" />
        <line x1="0" y1="0" x2="100" y2="100" class="grid-line" />
        <line x1="100" y1="0" x2="0" y2="100" class="grid-line" />
        <path d="M 6 14 L 6 6 L 14 6" class="corner-bracket" />
        <path d="M 86 6 L 94 6 L 94 14" class="corner-bracket" />
        <path d="M 6 86 L 6 94 L 14 94" class="corner-bracket" />
        <path d="M 86 94 L 94 94 L 94 86" class="corner-bracket" />
      </svg>
    `;

    const isThreePlus = chars.length >= 3;
    const boxSizeClass = isThreePlus ? 'meizi-box-xs' : 'meizi-box-sm';
    const targetSize = isThreePlus ? 96 : 134;

    chars.forEach((ch, idx) => {
      if (idx > 0) {
        const conn = document.createElement('div');
        conn.className = 'meizi-connector';
        conn.innerHTML = '➔';
        dom.compoundMeiziContainer.appendChild(conn);
      }

      const box = document.createElement('div');
      box.className = `meizi-box ${boxSizeClass} ${idx === 0 ? 'quiz-active' : ''}`;
      box.id = `meiziBoxCompound_${idx}`;

      const badge = document.createElement('div');
      badge.className = 'meizi-box-step-badge';
      badge.textContent = `Chữ ${idx + 1}: ${ch}`;
      box.appendChild(badge);

      box.insertAdjacentHTML('beforeend', svgGrid);

      const canvasWrap = document.createElement('div');
      canvasWrap.className = 'hanzi-writer-canvas';
      canvasWrap.id = `hanziWriterCompoundTarget_${idx}`;
      box.appendChild(canvasWrap);

      dom.compoundMeiziContainer.appendChild(box);

      const writer = HanziWriter.create(canvasWrap, ch, {
        width: targetSize,
        height: targetSize,
        padding: 6,
        showOutline: state.showOutline,
        strokeColor: '#1F2421',
        outlineColor: '#DDD6C8',
        radicalColor: '#B9382B',
        highlightColor: '#2D7F58',
        drawingColor: '#1F2421',
        drawingWidth: 20,
        showHintAfterMisses: 2,
        highlightOnComplete: true,
        delayBetweenStrokes: 170,
        strokeAnimationSpeed: 1.35,
        charDataLoader: createCharDataLoader(),
      });

      state.compoundWriters.push({ writer, char: ch, box, badge });
    });

    setTimeout(() => {
      startAnimateStroke();
    }, 180);
  }

  function initHanziWriter(char) {
    if (!char) return;

    dom.quizSuccessOverlay.classList.remove('show');
    if (dom.singleMeiziContainer) dom.singleMeiziContainer.style.display = 'block';
    if (dom.compoundMeiziContainer) dom.compoundMeiziContainer.style.display = 'none';

    dom.hanziWriterTarget.innerHTML = '';

    state.activeWriter = HanziWriter.create(dom.hanziWriterTarget, char, {
      width: 244,
      height: 244,
      padding: 12,
      showOutline: state.showOutline,
      strokeColor: '#1F2421',
      outlineColor: '#DDD6C8',
      radicalColor: '#B9382B',
      highlightColor: '#2D7F58',
      drawingColor: '#1F2421',
      drawingWidth: 24,
      showHintAfterMisses: 2,
      highlightOnComplete: true,
      delayBetweenStrokes: 200,
      strokeAnimationSpeed: 1.25,
      charDataLoader: createCharDataLoader(),
    });

    setTimeout(() => {
      if (state.activeWriter) {
        state.activeWriter.animateCharacter();
      }
    }, 160);
  }

  function startAnimateStroke() {
    dom.quizSuccessOverlay.classList.remove('show');
    state.isQuizMode = false;

    if (state.isCompoundMode && state.compoundWriters.length > 0) {
      let i = 0;
      function animateNext() {
        if (i < state.compoundWriters.length) {
          const item = state.compoundWriters[i];
          item.box.classList.add('quiz-active');
          item.writer.showCharacter();
          item.writer.animateCharacter({
            onComplete: () => {
              item.box.classList.remove('quiz-active');
              item.box.classList.add('quiz-done');
              i++;
              setTimeout(animateNext, 160);
            },
          });
        } else {
          setTimeout(() => {
            state.compoundWriters.forEach(w => w.box.classList.remove('quiz-done', 'quiz-active'));
          }, 1200);
        }
      }
      state.compoundWriters.forEach(w => {
        w.box.classList.remove('quiz-done', 'quiz-active');
        try { w.writer.cancelQuiz(); } catch (_) {}
      });
      animateNext();
      return;
    }

    if (state.activeWriter) {
      try { state.activeWriter.cancelQuiz(); } catch (_) {}
      state.activeWriter.showCharacter();
      state.activeWriter.animateCharacter();
    }
  }

  function startQuizStroke() {
    dom.quizSuccessOverlay.classList.remove('show');
    state.isQuizMode = true;

    if (state.isCompoundMode && state.compoundWriters.length > 0) {
      state.compoundQuizActiveIdx = 0;
      let totalCompoundMistakes = 0;

      function runCompoundQuizStep(stepIdx) {
        state.compoundWriters.forEach((w, idx) => {
          w.box.classList.toggle('quiz-active', idx === stepIdx);
          w.box.classList.toggle('quiz-done', idx < stepIdx);
        });

        const currentItem = state.compoundWriters[stepIdx];
        showToast(`Bước ${stepIdx + 1}/${state.compoundWriters.length}: Bé hãy viết chữ "${currentItem.char}" nhé!`);

        currentItem.writer.quiz({
          showOutline: state.showOutline,
          onComplete: function (res) {
            totalCompoundMistakes += (res.totalMistakes || 0);
            currentItem.box.classList.remove('quiz-active');
            currentItem.box.classList.add('quiz-done');

            if (stepIdx < state.compoundWriters.length - 1) {
              setTimeout(() => runCompoundQuizStep(stepIdx + 1), 320);
            } else {
              setTimeout(() => {
                const word = state.currentCharList.join('');
                dom.quizMistakeFeedback.textContent = totalCompoundMistakes === 0
                  ? `Tuyệt vời! Bé đã ghép trọn vẹn cả từ "${word}" chuẩn 100%! ✨`
                  : `Bé đã ghép xong từ "${word}" rất giỏi! (Chỉ cần chú ý ${totalCompoundMistakes} nét)`;
                dom.btnNextCharOrClose.textContent = 'Hoàn thành từ này ✓';
                dom.quizSuccessOverlay.classList.add('show');
              }, 320);
            }
          },
          onMistake: function (strokeData) {
            showToast(`Nhắc nhẹ: nét thứ ${strokeData.strokeNum + 1} của chữ "${currentItem.char}", bé thử lại nhé!`);
          },
        });
      }

      runCompoundQuizStep(0);
      return;
    }

    if (state.activeWriter) {
      showToast('Bé hãy dùng ngón tay hoặc chuột viết theo thứ tự nét nhé!');
      state.activeWriter.quiz({
        showOutline: state.showOutline,
        onComplete: function (res) {
          handleQuizSuccess(res);
        },
        onMistake: function (strokeData) {
          showToast(`Nhắc nhẹ: chưa đúng nét thứ ${strokeData.strokeNum + 1}, bé thử lại nhé!`);
        },
      });
    }
  }

  function handleQuizSuccess(res) {
    const mistakes = res.totalMistakes || 0;
    dom.quizMistakeFeedback.textContent = mistakes === 0
      ? 'Tuyệt vời! Bé viết chuẩn 100% không sai nét nào! ✨'
      : `Bé viết rất tốt! (Chỉ cần chú ý ${mistakes} nét)`;

    if (!state.isCompoundMode && state.activeCharIdx < state.currentCharList.length - 1) {
      dom.btnNextCharOrClose.textContent = `Viết chữ "${state.currentCharList[state.activeCharIdx + 1]}" ➔`;
    } else {
      dom.btnNextCharOrClose.textContent = 'Hoàn thành từ này ✓';
    }
    dom.quizSuccessOverlay.classList.add('show');
  }

  function toggleOutlineStroke() {
    state.showOutline = !state.showOutline;
    dom.btnToggleOutline.classList.toggle('active', state.showOutline);

    if (state.isCompoundMode && state.compoundWriters.length > 0) {
      state.compoundWriters.forEach(item => {
        if (state.showOutline) item.writer.showOutline();
        else item.writer.hideOutline();
      });
      return;
    }

    if (state.activeWriter) {
      if (state.showOutline) state.activeWriter.showOutline();
      else state.activeWriter.hideOutline();
    }
  }

  function resetStroke() {
    dom.quizSuccessOverlay.classList.remove('show');
    if (state.isQuizMode) {
      startQuizStroke();
      showToast('Đã xóa nét — Bé bắt đầu viết lại nhé!');
      return;
    }
    startAnimateStroke();
  }

  // ==============================================================
  // WORD DRAWER / DESKTOP SIDEBAR (Phase 3 & Phase 4 Thumbnails)
  // ==============================================================
  function openWordDrawer() {
    dom.wordDrawerBackdrop.classList.add('open');
    renderDrawerList();
  }

  function closeWordDrawer() {
    dom.wordDrawerBackdrop.classList.remove('open');
  }

  function renderDrawerList() {
    if (!dom.drawerWordList) return;
    dom.drawerWordList.innerHTML = '';

    let list = state.allCards;
    if (state.drawerFilter === 'due') {
      list = getDueCardsForCurrentLevel();
    } else if (state.drawerFilter === 'review') {
      list = state.allCards.filter(c => state.reviewSet.has(c.id));
    } else if (state.drawerFilter === 'mastered') {
      list = state.allCards.filter(c => state.masteredSet.has(c.id));
    }

    const q = (state.drawerSearchQuery || '').trim().toLowerCase();
    if (q) {
      list = list.filter(c =>
        (c.word && c.word.toLowerCase().includes(q)) ||
        (c.pinyin && c.pinyin.toLowerCase().includes(q)) ||
        (c.meaning_vi && c.meaning_vi.toLowerCase().includes(q)) ||
        (c.meaning_en && c.meaning_en.toLowerCase().includes(q))
      );
    }

    if (list.length === 0) {
      dom.drawerWordList.innerHTML = '<div style="text-align:center;padding:24px;color:#8C827A;font-size:12.5px;">Chưa có từ nào trong mục này</div>';
      return;
    }

    const currentCard = getCurrentCard();
    const fragment = document.createDocumentFragment();

    list.forEach(card => {
      const item = document.createElement('div');
      item.className = `drawer-item ${currentCard && currentCard.id === card.id ? 'active' : ''}`;
      item.dataset.cardId = String(card.id);

      const rec = state.recordsMap[card.id];
      let badgeHtml = '';
      if (rec && rec.reviewStep >= 1) {
        const days = FIXED_REVIEW_DAYS[Math.min(rec.reviewStep - 1, FIXED_REVIEW_DAYS.length - 1)];
        badgeHtml = `<span class="drawer-item-badge status-mastered">✅ ${days}d</span>`;
      } else if (rec && rec.status === 'forgot') {
        badgeHtml = '<span class="drawer-item-badge status-review">🔄 Học lại</span>';
      }

      // Phase 4: Thư viện từ chỉ tải thumbnail nhẹ (~3KB) + lazy-load
      const thumbSrc = card.thumb_img || card.front_img;

      item.innerHTML = `
        <img class="drawer-item-img" src="${thumbSrc}" alt="${card.word}" loading="lazy" decoding="async" width="36" height="50">
        <div class="drawer-item-content">
          <div style="display:flex;align-items:center;gap:6px;">
            <span class="drawer-item-word">${card.word}</span>
            <span style="font-size:11px;color:#8C6D62;font-weight:700;">/${card.pinyin}/</span>
          </div>
          <span class="drawer-item-meaning">${card.meaning_vi}${card.meaning_en ? ' • ' + card.meaning_en : ''}</span>
        </div>
        ${badgeHtml}
      `;

      item.addEventListener('click', () => {
        const idxInFiltered = state.filteredCards.findIndex(c => c.id === card.id);
        if (idxInFiltered !== -1) {
          state.currentIndex = idxInFiltered;
        } else {
          state.activeCategory = 'all';
          state.filteredCards = [...state.allCards];
          updateActiveNavChip('all');
          state.currentIndex = state.allCards.findIndex(c => c.id === card.id);
        }
        renderCurrentCard();
        closeWordDrawer();
      });

      fragment.appendChild(item);
    });

    dom.drawerWordList.appendChild(fragment);
  }

  // ==============================================================
  // TOUCH SWIPE & NETWORK STATUS & PWA (Phase 3 & Phase 7)
  // ==============================================================
  let touchStartX = 0;
  let touchStartY = 0;

  function initTouchGestures() {
    if (!dom.cardScene) return;
    dom.cardScene.addEventListener('touchstart', e => {
      touchStartX = e.changedTouches[0].screenX;
      touchStartY = e.changedTouches[0].screenY;
    }, { passive: true });

    dom.cardScene.addEventListener('touchend', e => {
      const touchEndX = e.changedTouches[0].screenX;
      const touchEndY = e.changedTouches[0].screenY;
      const diffX = touchEndX - touchStartX;
      const diffY = touchEndY - touchStartY;
      if (Math.abs(diffX) > 45 && Math.abs(diffX) > Math.abs(diffY)) {
        if (diffX < 0) nextCard();
        else prevCard();
      }
    }, { passive: true });
  }

  function updateNetworkIndicator() {
    if (!dom.networkBadge) return;
    const online = navigator.onLine !== false;
    dom.networkBadge.textContent = online ? '● Online' : '⚡ Offline (Thẻ đã lưu)';
    dom.networkBadge.classList.toggle('is-offline', !online);
  }

  function registerFlashcardServiceWorker() {
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
      navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(err => {
        console.warn('[KTN Flashcards] SW registration skipped:', err.message);
      });
    }
  }

  // ==============================================================
  // EVENT LISTENERS & INITIALIZATION
  // ==============================================================
  function initEvents() {
    dom.cardScene.addEventListener('click', (e) => {
      if (e.target.closest('#btnAudioFront') || e.target.closest('#btnAudioBack')) return;
      toggleFlip();
    });

    dom.btnFlip.addEventListener('click', toggleFlip);
    dom.btnPrev.addEventListener('click', prevCard);
    dom.btnNext.addEventListener('click', nextCard);

    dom.btnAudioFront.addEventListener('click', (e) => {
      e.stopPropagation();
      playAudio();
    });
    dom.btnAudioBack.addEventListener('click', (e) => {
      e.stopPropagation();
      playAudio();
    });
    dom.btnWriteAudio.addEventListener('click', () => playAudio());

    // Phase 2: "Quên rồi" & "Nhớ rồi"
    dom.btnMarkReview.addEventListener('click', markCardForgot);
    dom.btnMarkMastered.addEventListener('click', markCardRemembered);

    if (dom.btnStartTodayReview) {
      dom.btnStartTodayReview.addEventListener('click', startTodayReview);
    }
    if (dom.statDuePill) dom.statDuePill.addEventListener('click', () => applyFilter('due'));
    if (dom.statRememberedPill) dom.statRememberedPill.addEventListener('click', () => applyFilter('mastered'));
    if (dom.statRelearnPill) dom.statRelearnPill.addEventListener('click', () => applyFilter('review'));

    if (dom.levelSelect) {
      dom.levelSelect.value = state.activeLevel;
      dom.levelSelect.addEventListener('change', (e) => switchLevel(e.target.value));
    }

    dom.btnOpenWrite.addEventListener('click', openWriteModal);
    dom.btnCloseWrite.addEventListener('click', closeWriteModal);
    dom.btnAnimateStroke.addEventListener('click', startAnimateStroke);
    dom.btnQuizStroke.addEventListener('click', startQuizStroke);
    dom.btnResetStroke.addEventListener('click', resetStroke);
    dom.btnToggleOutline.addEventListener('click', toggleOutlineStroke);

    dom.btnNextCharOrClose.addEventListener('click', () => {
      if (!state.isCompoundMode && state.activeCharIdx < state.currentCharList.length - 1) {
        state.activeCharIdx++;
        renderWriteCharTabs();
        initHanziWriter(state.currentCharList[state.activeCharIdx]);
      } else {
        closeWriteModal();
        showToast('Bé đã hoàn thành luyện viết từ này!');
      }
    });

    dom.btnDrawerOpen.addEventListener('click', openWordDrawer);
    dom.btnDrawerClose.addEventListener('click', closeWordDrawer);
    dom.wordDrawerBackdrop.addEventListener('click', (e) => {
      if (e.target === dom.wordDrawerBackdrop) closeWordDrawer();
    });

    if (dom.drawerSearchInput) {
      dom.drawerSearchInput.addEventListener('input', (e) => {
        state.drawerSearchQuery = e.target.value || '';
        renderDrawerList();
      });
    }

    dom.drawerFilterChips.forEach(chip => {
      chip.addEventListener('click', () => {
        dom.drawerFilterChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        state.drawerFilter = chip.dataset.drawerFilter;
        renderDrawerList();
      });
    });

    window.addEventListener('keydown', (e) => {
      if (dom.writeModal.classList.contains('open')) return;
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA')) return;
      if (e.key === 'ArrowRight') nextCard();
      else if (e.key === 'ArrowLeft') prevCard();
      else if (e.key === ' ') {
        e.preventDefault();
        toggleFlip();
      } else if (e.key === '1') {
        markCardForgot();
      } else if (e.key === '2') {
        markCardRemembered();
      }
    });

    window.addEventListener('online', updateNetworkIndicator);
    window.addEventListener('offline', updateNetworkIndicator);

    initTouchGestures();
  }

  function configurePortalBackLink() {
    if (!dom.btnBackToPortal) return;
    try {
      const params = new URLSearchParams(window.location.search);
      const ret = params.get('returnUrl') || '';
      if (/^https?:\/\/(www\.)?khongtunhi\.com(\/|$)/i.test(ret) || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(ret)) {
        dom.btnBackToPortal.href = ret;
        return;
      }
      if (document.referrer && (/^https?:\/\/(www\.)?khongtunhi\.com(\/|$)/i.test(document.referrer) || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(document.referrer))) {
        dom.btnBackToPortal.href = document.referrer;
      }
    } catch (_) {}
  }

  function init() {
    configurePortalBackLink();
    loadProgress();
    if (dom.levelSelect) dom.levelSelect.value = state.activeLevel;
    if (dom.drawerSubtitle) {
      dom.drawerSubtitle.textContent = LEVEL_LABELS[state.activeLevel];
    }
    updateNetworkIndicator();
    renderCategoryNav();
    updateStatusCounters();
    applyFilter('all');
    renderDrawerList();
    initEvents();
    registerFlashcardServiceWorker();
    console.log('[KTN Flashcard] Initialized Level:', state.activeLevel, '(' + state.allCards.length + ' cards)');
  }

  // Expose controlled API for testing & verification
  window.KTNFlashcardApp = {
    FIXED_REVIEW_DAYS,
    getState: () => state,
    switchLevel,
    markCardForgot,
    markCardRemembered,
    startTodayReview,
    getDueCardsForCurrentLevel,
    isCardDueToday,
    isCardAudioApproved,
    playAudio,
    loadProgress,
    saveProgress,
    addDaysYMD,
    getTodayYMD,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
