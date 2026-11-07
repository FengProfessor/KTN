/**
 * KHỔNG TỬ NHÍ • Flashcard & Luyện Viết Hanzi
 * Client-side PWA / Mobile Web App (Zero server requirement, 100% offline & local audio)
 */

(function () {
  'use strict';

  // --- STATE ---
  const initialLevel = localStorage.getItem('ktn_active_level') || 'lo1';
  const state = {
    activeLevel: initialLevel,
    allCards: (window.FLASHCARDS_DATA_BY_LEVEL && window.FLASHCARDS_DATA_BY_LEVEL[initialLevel])
      ? window.FLASHCARDS_DATA_BY_LEVEL[initialLevel]
      : (window.FLASHCARDS_DATA || []),
    filteredCards: [],
    currentIndex: 0,
    isFlipped: false,
    currentFilter: 'all',
    drawerFilter: 'all',
    storageKey: 'ktn_flashcard_progress_' + initialLevel,
    reviewSet: new Set(),
    masteredSet: new Set(),
    // Writing modal state
    activeWriter: null,
    activeCharIdx: 0,
    currentCharList: [],
    showOutline: true,
    isQuizMode: false,
    isCompoundMode: false,
    compoundWriters: [],
    compoundQuizActiveIdx: 0,
  };

  // --- DOM ELEMENTS ---
  const dom = {
    // Header & counters
    levelSelect: document.getElementById('levelSelect'),
    headerWordCount: document.getElementById('headerWordCount'),
    progressBarFill: document.getElementById('progressBarFill'),
    currentCardIndexText: document.getElementById('currentCardIndexText'),
    currentCardStatus: document.getElementById('currentCardStatus'),
    reviewCount: document.getElementById('reviewCount'),
    masteredCount: document.getElementById('masteredCount'),

    // Category nav
    categoryNav: document.getElementById('categoryNav'),

    // Card scene & images
    cardScene: document.getElementById('cardScene'),
    flashcard: document.getElementById('flashcard'),
    cardFrontImg: document.getElementById('cardFrontImg'),
    cardBackImg: document.getElementById('cardBackImg'),
    btnAudioFront: document.getElementById('btnAudioFront'),
    btnAudioBack: document.getElementById('btnAudioBack'),

    // Bottom toolbar
    btnPrev: document.getElementById('btnPrev'),
    btnFlip: document.getElementById('btnFlip'),
    btnOpenWrite: document.getElementById('btnOpenWrite'),
    btnNext: document.getElementById('btnNext'),
    btnMarkReview: document.getElementById('btnMarkReview'),
    btnMarkMastered: document.getElementById('btnMarkMastered'),

    // Write modal
    writeModal: document.getElementById('writeModal'),
    btnCloseWrite: document.getElementById('btnCloseWrite'),
    writeWordTitle: document.getElementById('writeWordTitle'),
    writePinyinTitle: document.getElementById('writePinyinTitle'),
    btnWriteAudio: document.getElementById('btnWriteAudio'),
    writeCharTabs: document.getElementById('writeCharTabs'),
    singleMeiziContainer: document.getElementById('singleMeiziContainer'),
    compoundMeiziContainer: document.getElementById('compoundMeiziContainer'),
    hanziWriterTarget: document.getElementById('hanziWriterTarget'),
    btnAnimateStroke: document.getElementById('btnAnimateStroke'),
    btnQuizStroke: document.getElementById('btnQuizStroke'),
    btnResetStroke: document.getElementById('btnResetStroke'),
    btnToggleOutline: document.getElementById('btnToggleOutline'),
    quizSuccessOverlay: document.getElementById('quizSuccessOverlay'),
    quizMistakeFeedback: document.getElementById('quizMistakeFeedback'),
    btnNextCharOrClose: document.getElementById('btnNextCharOrClose'),

    // Word drawer
    btnDrawerOpen: document.getElementById('btnDrawerOpen'),
    btnDrawerClose: document.getElementById('btnDrawerClose'),
    drawerSubtitle: document.getElementById('drawerSubtitle'),
    wordDrawerBackdrop: document.getElementById('wordDrawerBackdrop'),
    drawerWordList: document.getElementById('drawerWordList'),
    drawerFilterChips: document.querySelectorAll('.drawer-filter-chips .drawer-chip'),

    // Toast & Audio
    toastMessage: document.getElementById('toastMessage'),
    nativeAudioPlayer: document.getElementById('nativeAudioPlayer'),
  };

  // --- LOCAL STORAGE SYNC ---
  function loadProgress() {
    try {
      const saved = localStorage.getItem(state.storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        state.reviewSet = new Set(parsed.review || []);
        state.masteredSet = new Set(parsed.mastered || []);
      } else {
        state.reviewSet = new Set();
        state.masteredSet = new Set();
      }
    } catch (e) {
      console.warn('LocalStorage error:', e);
      state.reviewSet = new Set();
      state.masteredSet = new Set();
    }
  }

  function saveProgress() {
    try {
      const data = {
        review: Array.from(state.reviewSet),
        mastered: Array.from(state.masteredSet),
      };
      localStorage.setItem(state.storageKey, JSON.stringify(data));
      updateStatusCounters();
    } catch (e) {
      console.warn('LocalStorage save error:', e);
    }
  }

  function updateStatusCounters() {
    if (dom.reviewCount) dom.reviewCount.textContent = state.reviewSet.size;
    if (dom.masteredCount) dom.masteredCount.textContent = state.masteredSet.size;
  }

  // --- DYNAMIC CATEGORY NAVIGATION ---
  const CATEGORY_EMOJIS = {
    'Chào hỏi': '💬',
    'Giới thiệu & Quốc gia': '🌏',
    'Địa điểm & Thành phố': '📍',
    'Đại từ chỉ định': '👉',
    'Gia đình': '👨‍👩‍👧',
    'Động vật & Sở hữu': '🐾',
    'Số đếm': '🔢',
    'Nhà ở & Phòng': '🏠',
    'Đồ uống & Trái cây': '🍎',
    'Sở thích & Mong muốn': '❤️',
    'Món ăn & Thực phẩm': '🍜',
    'Các thứ trong tuần': '📅',
    'Môn học & Ngôn ngữ': '📚',
    'Thời gian & Giờ giấc': '⏰',
    'Khuôn viên trường học': '🏫',
    'Động vật': '🐾',
    'Số & Đo lường': '🔢',
    'Giao tiếp & Đời sống': '💬'
  };

  function renderCategoryNav() {
    if (!dom.categoryNav) return;
    dom.categoryNav.innerHTML = '';

    const counts = {};
    state.allCards.forEach(c => {
      const cat = c.category || 'Khác';
      counts[cat] = (counts[cat] || 0) + 1;
    });

    // 1. Tất cả
    const allChip = document.createElement('button');
    allChip.className = `nav-chip ${state.currentFilter === 'all' ? 'active' : ''}`;
    allChip.dataset.filter = 'all';
    allChip.textContent = `Tất cả (${state.allCards.length})`;
    allChip.addEventListener('click', () => applyFilter('all'));
    dom.categoryNav.appendChild(allChip);

    // 2. Từng danh mục
    Object.keys(counts).forEach(cat => {
      const chip = document.createElement('button');
      chip.className = `nav-chip ${state.currentFilter === cat ? 'active' : ''}`;
      chip.dataset.filter = cat;
      const emoji = CATEGORY_EMOJIS[cat] || '🏷️';
      chip.textContent = `${emoji} ${cat} (${counts[cat]})`;
      chip.addEventListener('click', () => applyFilter(cat));
      dom.categoryNav.appendChild(chip);
    });

    // 3. Cần ôn
    const reviewChip = document.createElement('button');
    reviewChip.className = `nav-chip nav-chip-review ${state.currentFilter === 'review' ? 'active' : ''}`;
    reviewChip.dataset.filter = 'review';
    reviewChip.innerHTML = `⚠️ Cần ôn (<span id="reviewCount">${state.reviewSet.size}</span>)`;
    reviewChip.addEventListener('click', () => applyFilter('review'));
    dom.categoryNav.appendChild(reviewChip);

    // 4. Đã thuộc
    const masteredChip = document.createElement('button');
    masteredChip.className = `nav-chip nav-chip-mastered ${state.currentFilter === 'mastered' ? 'active' : ''}`;
    masteredChip.dataset.filter = 'mastered';
    masteredChip.innerHTML = `⭐ Đã thuộc (<span id="masteredCount">${state.masteredSet.size}</span>)`;
    masteredChip.addEventListener('click', () => applyFilter('mastered'));
    dom.categoryNav.appendChild(masteredChip);

    // Cập nhật lại DOM references cho số đếm
    dom.reviewCount = document.getElementById('reviewCount');
    dom.masteredCount = document.getElementById('masteredCount');
  }

  // --- FILTERING ---
  function applyFilter(filter) {
    state.currentFilter = filter;
    state.isFlipped = false;
    dom.flashcard.classList.remove('is-flipped');

    // Cập nhật trạng thái active của các nút filter
    if (dom.categoryNav) {
      const chips = dom.categoryNav.querySelectorAll('.nav-chip');
      chips.forEach(chip => {
        chip.classList.toggle('active', chip.dataset.filter === filter);
      });
    }

    if (filter === 'all') {
      state.filteredCards = [...state.allCards];
    } else if (filter === 'review') {
      state.filteredCards = state.allCards.filter(c => state.reviewSet.has(c.id));
    } else if (filter === 'mastered') {
      state.filteredCards = state.allCards.filter(c => state.masteredSet.has(c.id));
    } else {
      state.filteredCards = state.allCards.filter(c => c.category === filter);
    }

    if (state.filteredCards.length === 0) {
      showToast('Không có thẻ nào trong mục này');
      state.filteredCards = [...state.allCards];
      state.currentFilter = 'all';
      if (dom.categoryNav) {
        const chips = dom.categoryNav.querySelectorAll('.nav-chip');
        chips.forEach(chip => chip.classList.toggle('active', chip.dataset.filter === 'all'));
      }
    }

    state.currentIndex = 0;
    renderCurrentCard();
    renderDrawerList();
  }

  // --- LEVEL SWITCHING ---
  function switchLevel(newLevel) {
    if (!window.FLASHCARDS_DATA_BY_LEVEL || !window.FLASHCARDS_DATA_BY_LEVEL[newLevel]) {
      console.warn('Level not found:', newLevel);
      return;
    }
    state.activeLevel = newLevel;
    try {
      localStorage.setItem('ktn_active_level', newLevel);
    } catch(e) {}
    state.storageKey = 'ktn_flashcard_progress_' + newLevel;
    loadProgress();
    state.allCards = window.FLASHCARDS_DATA_BY_LEVEL[newLevel] || [];
    state.filteredCards = [...state.allCards];
    state.currentIndex = 0;
    state.currentFilter = 'all';
    state.isFlipped = false;

    if (dom.levelSelect) dom.levelSelect.value = newLevel;
    if (dom.drawerSubtitle) {
      const levelTitle = newLevel === 'lo1' ? 'Lộ 1 • 90 Thẻ Từ Vựng' : 'Lộ 7 • 30 Thẻ Từ Vựng';
      dom.drawerSubtitle.textContent = levelTitle;
    }

    renderCategoryNav();
    updateStatusCounters();
    renderCurrentCard();
    renderDrawerList();
    showToast(`Đã chuyển sang ${newLevel === 'lo1' ? 'Lộ 1 (90 thẻ)' : 'Lộ 7 (30 thẻ)'}`);
  }

  // --- RENDER CURRENT CARD ---
  function getCurrentCard() {
    return state.filteredCards[state.currentIndex] || state.allCards[0];
  }

  function renderCurrentCard() {
    const card = getCurrentCard();
    if (!card) return;

    // Reset flip
    state.isFlipped = false;
    dom.flashcard.classList.remove('is-flipped');

    // Update images
    dom.cardFrontImg.src = card.front_img;
    dom.cardBackImg.src = card.back_img;

    // Progress bar and indicators
    const currentNum = state.currentIndex + 1;
    const totalNum = state.filteredCards.length;
    const percent = Math.round((currentNum / totalNum) * 100);

    if (dom.progressBarFill) dom.progressBarFill.style.width = percent + '%';
    if (dom.currentCardIndexText) dom.currentCardIndexText.textContent = `Từ ${currentNum} / ${totalNum}`;
    if (dom.headerWordCount) dom.headerWordCount.textContent = `${currentNum}/${totalNum}`;

    // Card status indicator
    if (dom.currentCardStatus) {
      if (state.masteredSet.has(card.id)) {
        dom.currentCardStatus.textContent = '⭐ Đã thuộc';
        dom.currentCardStatus.className = 'status-chip status-mastered';
      } else if (state.reviewSet.has(card.id)) {
        dom.currentCardStatus.textContent = '⚠️ Cần ôn';
        dom.currentCardStatus.className = 'status-chip status-review';
      } else {
        dom.currentCardStatus.textContent = 'Chưa học';
        dom.currentCardStatus.className = 'status-chip';
      }
    }

    // Update bottom status buttons
    if (dom.btnMarkReview) {
      dom.btnMarkReview.classList.toggle('is-active', state.reviewSet.has(card.id));
    }
    if (dom.btnMarkMastered) {
      dom.btnMarkMastered.classList.toggle('is-active', state.masteredSet.has(card.id));
    }
  }

  // --- NAVIGATION ---
  function nextCard() {
    if (state.currentIndex < state.filteredCards.length - 1) {
      state.currentIndex++;
      renderCurrentCard();
    } else {
      // Loop back or show completion
      state.currentIndex = 0;
      renderCurrentCard();
      showToast('Đã xem hết danh sách!');
    }
  }

  function prevCard() {
    if (state.currentIndex > 0) {
      state.currentIndex--;
      renderCurrentCard();
    } else {
      state.currentIndex = state.filteredCards.length - 1;
      renderCurrentCard();
    }
  }

  function toggleFlip() {
    state.isFlipped = !state.isFlipped;
    dom.flashcard.classList.toggle('is-flipped', state.isFlipped);
  }

  // --- AUDIO PLAYBACK ---
  function playAudio(audioPath) {
    if (!audioPath) {
      const card = getCurrentCard();
      audioPath = card ? card.audio : null;
    }
    if (!audioPath) return;

    // Visual playing state
    [dom.btnAudioFront, dom.btnAudioBack, dom.btnWriteAudio].forEach(btn => {
      if (btn) btn.classList.add('is-playing');
    });

    dom.nativeAudioPlayer.src = audioPath;
    dom.nativeAudioPlayer.play().catch(err => {
      console.warn('Audio play prevented or file not found:', err);
    });

    dom.nativeAudioPlayer.onended = () => {
      [dom.btnAudioFront, dom.btnAudioBack, dom.btnWriteAudio].forEach(btn => {
        if (btn) btn.classList.remove('is-playing');
      });
    };
  }

  // --- STATUS TOGGLES ---
  function toggleMastered() {
    const card = getCurrentCard();
    if (!card) return;

    if (state.masteredSet.has(card.id)) {
      state.masteredSet.delete(card.id);
      showToast('Bỏ đánh dấu Đã thuộc');
    } else {
      state.masteredSet.add(card.id);
      state.reviewSet.delete(card.id); // Mutual exclusion
      showToast(`⭐ Đã thuộc: ${card.word}`);
    }
    saveProgress();
    renderCurrentCard();
  }

  function toggleReview() {
    const card = getCurrentCard();
    if (!card) return;

    if (state.reviewSet.has(card.id)) {
      state.reviewSet.delete(card.id);
      showToast('Bỏ đánh dấu Cần ôn');
    } else {
      state.reviewSet.add(card.id);
      state.masteredSet.delete(card.id); // Mutual exclusion
      showToast(`⚠️ Đã lưu vào Cần ôn: ${card.word}`);
    }
    saveProgress();
    renderCurrentCard();
  }

  // --- TOAST NOTIFICATION ---
  let toastTimer = null;
  function showToast(msg) {
    if (!dom.toastMessage) return;
    dom.toastMessage.textContent = msg;
    dom.toastMessage.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      dom.toastMessage.classList.remove('show');
    }, 1800);
  }

  // ==============================================================
  // HANZI WRITING & MỄ TỰ CÁCH (米字格)
  // ==============================================================
  function openWriteModal() {
    const card = getCurrentCard();
    if (!card) return;

    state.currentCharList = card.hanzi_chars || [card.word];

    // If compound word (2+ characters), default to "Ghép cả từ"
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
      try { state.activeWriter.cancelQuiz(); } catch (e) {}
    }
    if (state.compoundWriters && state.compoundWriters.length > 0) {
      state.compoundWriters.forEach(item => {
        try { item.writer.cancelQuiz(); } catch (e) {}
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

    // 1. Compound Tab: "🀄 Ghép cả từ: 猴子"
    const compoundBtn = document.createElement('button');
    compoundBtn.className = `char-tab compound-tab ${state.isCompoundMode ? 'active' : ''}`;
    compoundBtn.innerHTML = `🀄 Ghép cả từ: <strong>${state.currentCharList.join('')}</strong>`;
    compoundBtn.addEventListener('click', () => {
      state.isCompoundMode = true;
      state.activeCharIdx = -1;
      renderWriteCharTabs();
      initCompoundWriters(state.currentCharList);
    });
    dom.writeCharTabs.appendChild(compoundBtn);

    // 2. Individual Character Tabs: "[ Chữ 1: 猴 ]", "[ Chữ 2: 子 ]"
    state.currentCharList.forEach((ch, idx) => {
      const btn = document.createElement('button');
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

    chars.forEach((ch, idx) => {
      if (idx > 0) {
        const conn = document.createElement('div');
        conn.className = 'meizi-connector';
        conn.innerHTML = '➔';
        dom.compoundMeiziContainer.appendChild(conn);
      }

      const box = document.createElement('div');
      box.className = `meizi-box meizi-box-sm ${idx === 0 ? 'quiz-active' : ''}`;
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

      const targetSize = 135;
      const writer = HanziWriter.create(canvasWrap, ch, {
        width: targetSize,
        height: targetSize,
        padding: 8,
        showOutline: state.showOutline,
        strokeColor: '#1F2421',
        outlineColor: '#DDD6C8',
        radicalColor: '#B9382B',
        highlightColor: '#2D7F58',
        drawingColor: '#1F2421',
        drawingWidth: 20,
        showHintAfterMisses: 2,
        highlightOnComplete: true,
        delayBetweenStrokes: 180,
        strokeAnimationSpeed: 1.3,
        charDataLoader: function (c, onComplete) {
          if (window.HANZI_STROKES && window.HANZI_STROKES[c]) {
            onComplete(window.HANZI_STROKES[c]);
          } else {
            fetch(`https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0/${encodeURIComponent(c)}.json`)
              .then(r => r.json())
              .then(data => onComplete(data))
              .catch(err => console.error('Char load error:', err));
          }
        },
      });

      state.compoundWriters.push({ writer, char: ch, box, badge });
    });

    // Auto animate in sequence
    setTimeout(() => {
      startAnimateStroke();
    }, 250);
  }

  function initHanziWriter(char) {
    if (!char) return;

    // Reset overlay & show single container
    dom.quizSuccessOverlay.classList.remove('show');
    if (dom.singleMeiziContainer) dom.singleMeiziContainer.style.display = 'block';
    if (dom.compoundMeiziContainer) dom.compoundMeiziContainer.style.display = 'none';

    dom.hanziWriterTarget.innerHTML = '';

    const targetWidth = 250;
    const targetHeight = 250;

    // Create HanziWriter instance
    state.activeWriter = HanziWriter.create(dom.hanziWriterTarget, char, {
      width: targetWidth,
      height: targetHeight,
      padding: 14,
      showOutline: state.showOutline,
      strokeColor: '#1F2421',      // Mực đen thư pháp
      outlineColor: '#DDD6C8',     // Giấy xuyến chỉ
      radicalColor: '#B9382B',     // Chu sa đỏ cho bộ thủ
      highlightColor: '#2D7F58',   // Xanh ngọc nét đúng
      drawingColor: '#1F2421',     // Nét bút lông
      drawingWidth: 26,            // Nét dày đầm tay
      showHintAfterMisses: 2,      // Tự nhắc nét sau 2 lần vẽ sai
      highlightOnComplete: true,
      delayBetweenStrokes: 220,
      strokeAnimationSpeed: 1.2,
      charDataLoader: function (c, onComplete) {
        if (window.HANZI_STROKES && window.HANZI_STROKES[c]) {
          onComplete(window.HANZI_STROKES[c]);
        } else {
          // Fallback to jsdelivr CDN
          fetch(`https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0/${encodeURIComponent(c)}.json`)
            .then(r => r.json())
            .then(data => onComplete(data))
            .catch(err => console.error('Char data load error:', err));
        }
      },
    });

    // Auto animate on load
    setTimeout(() => {
      if (state.activeWriter) {
        state.activeWriter.animateCharacter();
      }
    }, 200);
  }

  function startAnimateStroke() {
    dom.quizSuccessOverlay.classList.remove('show');

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
              setTimeout(animateNext, 200);
            }
          });
        } else {
          setTimeout(() => {
            state.compoundWriters.forEach(w => w.box.classList.remove('quiz-done', 'quiz-active'));
          }, 1500);
        }
      }
      state.compoundWriters.forEach(w => {
        w.box.classList.remove('quiz-done', 'quiz-active');
        try { w.writer.cancelQuiz(); } catch (e) {}
      });
      animateNext();
      return;
    }

    if (state.activeWriter) {
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
              setTimeout(() => {
                runCompoundQuizStep(stepIdx + 1);
              }, 400);
            } else {
              setTimeout(() => {
                const word = state.currentCharList.join('');
                if (totalCompoundMistakes === 0) {
                  dom.quizMistakeFeedback.textContent = `Tuyệt vời! Bé đã ghép trọn vẹn cả từ "${word}" chuẩn 100%! ✨`;
                } else {
                  dom.quizMistakeFeedback.textContent = `Bé đã ghép xong từ "${word}" rất giỏi! (Chỉ cần chú ý ${totalCompoundMistakes} nét)`;
                }
                dom.btnNextCharOrClose.textContent = 'Hoàn thành từ này ✓';
                dom.quizSuccessOverlay.classList.add('show');
              }, 400);
            }
          },
          onMistake: function (strokeData) {
            showToast(`Chưa đúng nét thứ ${strokeData.strokeNum + 1} của chữ "${currentItem.char}", bé thử lại nhé!`);
          }
        });
      }

      runCompoundQuizStep(0);
      return;
    }

    if (state.activeWriter) {
      state.activeWriter.quiz({
        showOutline: state.showOutline,
        onComplete: function (res) {
          handleQuizSuccess(res);
        },
        onMistake: function (strokeData) {
          showToast(`Chưa đúng nét thứ ${strokeData.strokeNum + 1}, bé thử lại nhé!`);
        },
      });
    }
  }

  function handleQuizSuccess(res) {
    const mistakes = res.totalMistakes || 0;
    if (mistakes === 0) {
      dom.quizMistakeFeedback.textContent = 'Tuyệt vời! Bé vẽ chuẩn 100% không sai nét nào! ✨';
    } else {
      dom.quizMistakeFeedback.textContent = `Bé vẽ rất tốt! (Chỉ cần chú ý ${mistakes} nét)`;
    }

    if (state.activeCharIdx < state.currentCharList.length - 1) {
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

    if (state.isCompoundMode && state.compoundWriters.length > 0) {
      state.compoundWriters.forEach(item => {
        try { item.writer.cancelQuiz(); } catch (e) {}
        item.box.classList.remove('quiz-active', 'quiz-done');
        item.writer.showCharacter();
      });
      startAnimateStroke();
      return;
    }

    if (state.activeWriter) {
      try { state.activeWriter.cancelQuiz(); } catch (e) {}
      state.activeWriter.showCharacter();
      state.activeWriter.animateCharacter();
    }
  }

  // ==============================================================
  // WORD DRAWER (THƯ VIỆN 30 THẺ TỪ VỰNG)
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
    if (state.drawerFilter === 'review') {
      list = state.allCards.filter(c => state.reviewSet.has(c.id));
    } else if (state.drawerFilter === 'mastered') {
      list = state.allCards.filter(c => state.masteredSet.has(c.id));
    }

    if (list.length === 0) {
      dom.drawerWordList.innerHTML = '<div style="text-align:center;padding:24px;color:#8C827A;font-size:12.5px;">Chưa có từ nào trong danh sách này</div>';
      return;
    }

    const currentCard = getCurrentCard();

    list.forEach(card => {
      const item = document.createElement('div');
      item.className = `drawer-item ${currentCard && currentCard.id === card.id ? 'active' : ''}`;

      let badgeHtml = '';
      if (state.masteredSet.has(card.id)) {
        badgeHtml = '<span class="drawer-item-badge status-mastered">⭐ Đã thuộc</span>';
      } else if (state.reviewSet.has(card.id)) {
        badgeHtml = '<span class="drawer-item-badge status-review">⚠️ Cần ôn</span>';
      }

      item.innerHTML = `
        <img class="drawer-item-img" src="${card.front_img}" alt="${card.word}">
        <div class="drawer-item-content">
          <div style="display:flex;align-items:center;gap:6px;">
            <span class="drawer-item-word">${card.word}</span>
            <span style="font-size:11.5px;color:#8C6D62;font-weight:700;">/${card.pinyin}/</span>
          </div>
          <span class="drawer-item-meaning">${card.meaning_vi} • ${card.meaning_en}</span>
        </div>
        ${badgeHtml}
      `;

      item.addEventListener('click', () => {
        // Find index in current filtered list or switch filter
        const idxInFiltered = state.filteredCards.findIndex(c => c.id === card.id);
        if (idxInFiltered !== -1) {
          state.currentIndex = idxInFiltered;
        } else {
          // Switch to all cards and select
          applyFilter('all');
          state.currentIndex = state.allCards.findIndex(c => c.id === card.id);
        }
        renderCurrentCard();
        closeWordDrawer();
      });

      dom.drawerWordList.appendChild(item);
    });
  }

  // ==============================================================
  // TOUCH SWIPE GESTURES (Mobile Support)
  // ==============================================================
  let touchStartX = 0;
  let touchStartY = 0;

  function initTouchGestures() {
    dom.cardScene.addEventListener('touchstart', e => {
      touchStartX = e.changedTouches[0].screenX;
      touchStartY = e.changedTouches[0].screenY;
    }, { passive: true });

    dom.cardScene.addEventListener('touchend', e => {
      const touchEndX = e.changedTouches[0].screenX;
      const touchEndY = e.changedTouches[0].screenY;
      handleSwipe(touchStartX, touchStartY, touchEndX, touchEndY);
    }, { passive: true });
  }

  function handleSwipe(startX, startY, endX, endY) {
    const diffX = endX - startX;
    const diffY = endY - startY;

    // Minimum swipe threshold
    if (Math.abs(diffX) > 45 && Math.abs(diffX) > Math.abs(diffY)) {
      if (diffX < 0) {
        // Swipe Left -> Next
        nextCard();
      } else {
        // Swipe Right -> Prev
        prevCard();
      }
    }
  }

  // ==============================================================
  // EVENT LISTENERS INITIALIZATION
  // ==============================================================
  function initEvents() {
    // Card Scene tap to flip
    dom.cardScene.addEventListener('click', (e) => {
      // Ignore if clicking on speaker buttons
      if (e.target.closest('#btnAudioFront') || e.target.closest('#btnAudioBack')) {
        return;
      }
      toggleFlip();
    });

    // Flip button
    dom.btnFlip.addEventListener('click', toggleFlip);

    // Nav buttons
    dom.btnPrev.addEventListener('click', prevCard);
    dom.btnNext.addEventListener('click', nextCard);

    // Audio buttons
    dom.btnAudioFront.addEventListener('click', (e) => {
      e.stopPropagation();
      playAudio();
    });

    dom.btnAudioBack.addEventListener('click', (e) => {
      e.stopPropagation();
      playAudio();
    });

    dom.btnWriteAudio.addEventListener('click', () => {
      playAudio();
    });

    // Status buttons
    dom.btnMarkReview.addEventListener('click', toggleReview);
    dom.btnMarkMastered.addEventListener('click', toggleMastered);

    // Level Selector dropdown
    if (dom.levelSelect) {
      dom.levelSelect.value = state.activeLevel;
      dom.levelSelect.addEventListener('change', (e) => {
        switchLevel(e.target.value);
      });
    }

    // Luyện viết Hanzi modal
    dom.btnOpenWrite.addEventListener('click', openWriteModal);
    dom.btnCloseWrite.addEventListener('click', closeWriteModal);
    dom.btnAnimateStroke.addEventListener('click', startAnimateStroke);
    dom.btnQuizStroke.addEventListener('click', startQuizStroke);
    dom.btnResetStroke.addEventListener('click', resetStroke);
    dom.btnToggleOutline.addEventListener('click', toggleOutlineStroke);

    dom.btnNextCharOrClose.addEventListener('click', () => {
      if (state.activeCharIdx < state.currentCharList.length - 1) {
        state.activeCharIdx++;
        renderWriteCharTabs();
        initHanziWriter(state.currentCharList[state.activeCharIdx]);
      } else {
        closeWriteModal();
        showToast('Bé đã hoàn thành xuất sắc!');
      }
    });

    // Drawer events
    dom.btnDrawerOpen.addEventListener('click', openWordDrawer);
    dom.btnDrawerClose.addEventListener('click', closeWordDrawer);
    dom.wordDrawerBackdrop.addEventListener('click', (e) => {
      if (e.target === dom.wordDrawerBackdrop) {
        closeWordDrawer();
      }
    });

    dom.drawerFilterChips.forEach(chip => {
      chip.addEventListener('click', () => {
        dom.drawerFilterChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        state.drawerFilter = chip.dataset.drawerFilter;
        renderDrawerList();
      });
    });

    // Keyboard shortcuts (Desktop friendly)
    window.addEventListener('keydown', (e) => {
      if (dom.writeModal.classList.contains('open')) return;
      if (e.key === 'ArrowRight') nextCard();
      if (e.key === 'ArrowLeft') prevCard();
      if (e.key === ' ') {
        e.preventDefault();
        toggleFlip();
      }
    });

    initTouchGestures();
  }

  // --- BOOTSTRAP ---
  function init() {
    loadProgress();
    if (dom.levelSelect) dom.levelSelect.value = state.activeLevel;
    if (dom.drawerSubtitle) {
      dom.drawerSubtitle.textContent = state.activeLevel === 'lo1' ? 'Lộ 1 • 90 Thẻ Từ Vựng' : 'Lộ 7 • 30 Thẻ Từ Vựng';
    }
    renderCategoryNav();
    updateStatusCounters();
    applyFilter('all');
    initEvents();
    console.log('[Khổng Tử Nhí] Flashcards App initialized with Level:', state.activeLevel, '(' + state.allCards.length + ' cards)');
  }

  // Start app when DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
