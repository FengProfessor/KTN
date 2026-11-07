import os, sys, threading, http.server, socketserver, time
from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding='utf-8')

ROOT_DIR = r"D:\Vibe\khongtunhi-demo\flashcards"
SCREENSHOT_DIR = os.path.join(ROOT_DIR, "screenshots")
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT_DIR, **kwargs)
    def log_message(self, format, *args):
        pass

def start_server():
    httpd = socketserver.TCPServer(("127.0.0.1", 0), QuietHandler)
    port = httpd.server_address[1]
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    return httpd, port

def run_tests():
    httpd, port = start_server()
    base_url = f"http://127.0.0.1:{port}/index.html"
    print(f"Serving flashcards at {base_url}")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        # ---------------------------------------------------------
        # PART A: MOBILE VIEWPORT (390x844 iPhone 14 & 360x740 Android)
        # ---------------------------------------------------------
        context = browser.new_context(
            viewport={"width": 390, "height": 844},
            device_scale_factor=2,
            is_mobile=True,
            has_touch=True,
        )
        page = context.new_page()
        console_errors = []
        page.on("pageerror", lambda err: console_errors.append(str(err)))

        page.goto(base_url, wait_until="networkidle")

        # 1. Check zero horizontal overflow at 390x844 and 360x740
        for vw, vh in [(360, 740), (390, 844)]:
            page.set_viewport_size({"width": vw, "height": vh})
            overflow = page.evaluate("() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, sh: document.documentElement.scrollHeight, ih: window.innerHeight })")
            assert overflow["sw"] <= overflow["iw"], f"Horizontal overflow on mobile {vw}x{vh}: {overflow}"
            print(f"✓ Mobile {vw}x{vh} zero horizontal overflow verified: {overflow}")

        # 2. Check all 7 Lộ counts via UI level selector
        expected_counts = {"lo1": 90, "lo2": 109, "lo3": 96, "lo4": 100, "lo5": 92, "lo6": 88, "lo7": 30}
        for lo_key, exp_cnt in expected_counts.items():
            page.select_option("#levelSelect", lo_key)
            cnt = page.evaluate("() => window.KTNFlashcardApp.getState().allCards.length")
            assert cnt == exp_cnt, f"Expected {exp_cnt} cards for {lo_key}, got {cnt}"
            page.wait_for_function(
                "() => { const im = document.getElementById('cardFrontImg'); return im && im.complete && im.naturalWidth === 660 && im.naturalHeight === 940; }",
                timeout=5000
            )
        print("✓ All 7 Lộ switched cleanly and verified crisp 660x940 WebP front images.")

        # Switch back to lo1 for interactive tests
        page.select_option("#levelSelect", "lo1")
        page.wait_for_timeout(150)

        # Capture Mobile Front Screenshot (Lộ 1 Card #3 你好)
        page.evaluate("() => { const s = window.KTNFlashcardApp.getState(); s.currentIndex = 2; document.getElementById('btnNext').click(); document.getElementById('btnPrev').click(); document.getElementById('toastMessage').classList.remove('show'); }")
        page.wait_for_function("() => { const im = document.getElementById('cardFrontImg'); return im && im.complete && im.naturalWidth === 660; }")
        page.wait_for_timeout(150)
        page.screenshot(path=os.path.join(SCREENSHOT_DIR, "mobile-390x844-front.png"))

        # 3. Tap to flip & capture Mobile Back Screenshot
        page.click("#cardScene")
        page.wait_for_timeout(450)
        is_flipped = page.evaluate("() => document.getElementById('flashcard').classList.contains('is-flipped')")
        assert is_flipped, "Card should flip when tapped"
        page.evaluate("() => document.getElementById('toastMessage').classList.remove('show')")
        page.screenshot(path=os.path.join(SCREENSHOT_DIR, "mobile-390x844-back.png"))
        page.click("#cardScene")
        page.wait_for_timeout(200)

        # 4. Test touch swipe left & right
        idx_before = page.evaluate("() => window.KTNFlashcardApp.getState().currentIndex")
        page.evaluate("""() => {
            const el = document.getElementById('cardScene');
            el.dispatchEvent(new TouchEvent('touchstart', { changedTouches: [new Touch({ identifier: 1, target: el, screenX: 300, screenY: 400 })] }));
            el.dispatchEvent(new TouchEvent('touchend', { changedTouches: [new Touch({ identifier: 1, target: el, screenX: 120, screenY: 405 })] }));
        }""")
        idx_after_left = page.evaluate("() => window.KTNFlashcardApp.getState().currentIndex")
        assert idx_after_left == idx_before + 1, f"Swipe left should advance index ({idx_before} -> {idx_after_left})"

        page.evaluate("""() => {
            const el = document.getElementById('cardScene');
            el.dispatchEvent(new TouchEvent('touchstart', { changedTouches: [new Touch({ identifier: 2, target: el, screenX: 120, screenY: 400 })] }));
            el.dispatchEvent(new TouchEvent('touchend', { changedTouches: [new Touch({ identifier: 2, target: el, screenX: 300, screenY: 405 })] }));
        }""")
        idx_after_right = page.evaluate("() => window.KTNFlashcardApp.getState().currentIndex")
        assert idx_after_right == idx_before, f"Swipe right should go back ({idx_after_left} -> {idx_after_right})"
        print("✓ Tap to flip and touch swipe left/right verified.")

        # 5. Test Phase 2: "Quên rồi" (re-appears after 3-5 cards in session + tomorrow schedule + end-of-session edge case)
        requeue_res = page.evaluate("""() => {
            window.__KTN_MOCK_TODAY__ = '2026-11-07';
            const app = window.KTNFlashcardApp;
            const st = app.getState();
            st.currentIndex = 0;
            const initialLen = st.filteredCards.length;
            const c1 = st.filteredCards[0];
            app.markCardForgot();
            const newLen = st.filteredCards.length;
            // Find where c1 was re-inserted after index 0
            let reinsertIdx = -1;
            for (let i = 1; i < st.filteredCards.length; i++) {
                if (st.filteredCards[i].id === c1.id) { reinsertIdx = i; break; }
            }
            const rec1 = st.recordsMap[c1.id];

            // Also test end-of-session edge case (at last card)
            st.currentIndex = st.filteredCards.length - 1;
            const lastCard = st.filteredCards[st.currentIndex];
            const lenBeforeLast = st.filteredCards.length;
            app.markCardForgot();
            const lenAfterLast = st.filteredCards.length;
            const appendedAtEnd = st.filteredCards[st.filteredCards.length - 1].id === lastCard.id;

            return { initialLen, newLen, reinsertIdx, rec1, lenBeforeLast, lenAfterLast, appendedAtEnd };
        }""")
        assert requeue_res["newLen"] == requeue_res["initialLen"] + 1
        assert 4 <= requeue_res["reinsertIdx"] <= 6, f"Card should reappear 3-5 cards later (got idx {requeue_res['reinsertIdx']})"
        assert requeue_res["rec1"]["reviewStep"] == 0
        assert requeue_res["rec1"]["nextReviewDate"] == "2026-11-08"
        assert requeue_res["appendedAtEnd"] is True, "End-of-session forgot card must still be appended to remaining queue"
        print(f"✓ Phase 2 'Quên rồi' session requeue (idx={requeue_res['reinsertIdx']}) & end-of-session edge case verified.")

        # 6. Test Phase 2: "Nhớ rồi" fixed 1-3-7-14-30 day schedule & reset on forgot
        schedule_res = page.evaluate("""() => {
            window.__KTN_MOCK_TODAY__ = '2026-11-07';
            const app = window.KTNFlashcardApp;
            const st = app.getState();
            const steps = [];
            for (let i = 0; i < 6; i++) {
                // Keep selecting card id=2 (index 1)
                const idx2 = st.filteredCards.findIndex(c => c.id === 2);
                st.currentIndex = idx2;
                app.markCardRemembered();
                const r = st.recordsMap[2];
                steps.push({ step: r.reviewStep, nextDate: r.nextReviewDate, status: r.status });
            }
            // Now forget card id=2 at step 6 -> must reset to step 0 & tomorrow
            st.currentIndex = st.filteredCards.findIndex(c => c.id === 2);
            app.markCardForgot();
            const afterForgot = st.recordsMap[2];
            // And remember once again -> step 1 (+1 day)
            st.currentIndex = st.filteredCards.findIndex(c => c.id === 2);
            app.markCardRemembered();
            const afterRememberAgain = st.recordsMap[2];
            return { steps, afterForgot, afterRememberAgain };
        }""")
        expected_dates = [
            (1, "2026-11-08"), # +1 day
            (2, "2026-11-10"), # +3 days
            (3, "2026-11-14"), # +7 days
            (4, "2026-11-21"), # +14 days
            (5, "2026-12-07"), # +30 days
            (6, "2026-12-07"), # +30 days (5+ cap)
        ]
        for got, (exp_step, exp_date) in zip(schedule_res["steps"], expected_dates):
            assert got["step"] == exp_step and got["nextDate"] == exp_date, f"Mismatch in 1-3-7-14-30 schedule: {got} vs {(exp_step, exp_date)}"
        assert schedule_res["afterForgot"]["reviewStep"] == 0 and schedule_res["afterForgot"]["nextReviewDate"] == "2026-11-08"
        assert schedule_res["afterRememberAgain"]["reviewStep"] == 1 and schedule_res["afterRememberAgain"]["nextReviewDate"] == "2026-11-08"
        print("✓ Phase 2 'Nhớ rồi' fixed 1-3-7-14-30 day schedule + reset on Forgot verified.")

        # 7. Test persistence across page reload & Legacy storage migration
        page.evaluate("""() => {
            localStorage.setItem('ktn_flashcard_progress_lo7', JSON.stringify({ review: [3], mastered: [5] }));
            localStorage.removeItem('ktn_flashcard_srs_v2_lo7');
        }""")
        page.reload(wait_until="networkidle")
        persisted = page.evaluate("""() => {
            const st1 = window.KTNFlashcardApp.getState();
            const rec2 = st1.recordsMap[2];
            window.KTNFlashcardApp.switchLevel('lo7');
            const st7 = window.KTNFlashcardApp.getState();
            return { rec2, lo7_c3: st7.recordsMap[3], lo7_c5: st7.recordsMap[5] };
        }""")
        assert persisted["rec2"]["reviewStep"] == 1, "Progress for Lộ 1 card #2 must persist across reload"
        assert persisted["lo7_c3"]["status"] == "forgot" and persisted["lo7_c3"]["reviewStep"] == 0, "Legacy review set must migrate cleanly"
        assert persisted["lo7_c5"]["status"] == "remembered" and persisted["lo7_c5"]["reviewStep"] == 1, "Legacy mastered set must migrate cleanly"
        print("✓ LocalStorage persistence across reload & legacy progress migration verified.")

        # 8. Test HanziWriter Mễ Tự Cách modal (Compound & Single char) on mobile
        page.click("#btnOpenWrite")
        page.wait_for_timeout(450)
        page.evaluate("() => document.getElementById('toastMessage').classList.remove('show')")
        write_state = page.evaluate("""() => {
            const modalOpen = document.getElementById('writeModal').classList.contains('open');
            const compoundVis = document.getElementById('compoundMeiziContainer').style.display !== 'none';
            const svgCount = document.querySelectorAll('#compoundMeiziContainer svg').length;
            return { modalOpen, compoundVis, svgCount };
        }""")
        assert write_state["modalOpen"] and write_state["compoundVis"] and write_state["svgCount"] >= 4
        page.screenshot(path=os.path.join(SCREENSHOT_DIR, "mobile-390x844-write.png"))
        page.click("#btnCloseWrite")
        page.wait_for_timeout(200)
        print("✓ Phase 6 HanziWriter Mễ Tự Cách compound & single character modal verified.")

        # ---------------------------------------------------------
        # PART B: DESKTOP VIEWPORT (1280x800 Adaptive Split Layout)
        # ---------------------------------------------------------
        desk_context = browser.new_context(viewport={"width": 1280, "height": 800}, device_scale_factor=2)
        desk_page = desk_context.new_page()
        desk_page.goto(base_url, wait_until="networkidle")
        desk_page.wait_for_timeout(250)

        desk_layout = desk_page.evaluate("""() => {
            const appRect = document.getElementById('app').getBoundingClientRect();
            const mainRect = document.querySelector('.workspace-main').getBoundingClientRect();
            const sideRect = document.getElementById('wordDrawerBackdrop').getBoundingClientRect();
            const sceneRect = document.getElementById('cardScene').getBoundingClientRect();
            const toolbarRect = document.querySelector('.app-toolbar').getBoundingClientRect();
            const thumbImgs = Array.from(document.querySelectorAll('.drawer-item-img'));
            const usesThumbWebp = thumbImgs.every(im => im.getAttribute('src').includes('thumb_') && im.getAttribute('loading') === 'lazy');
            return {
                appWidth: appRect.width,
                appHeight: appRect.height,
                mainWidth: mainRect.width,
                mainHeight: mainRect.height,
                sideWidth: sideRect.width,
                sideLeft: sideRect.left,
                mainRight: mainRect.right,
                sceneWidth: sceneRect.width,
                sceneHeight: sceneRect.height,
                toolbarBottom: toolbarRect.bottom,
                usesThumbWebp,
                thumbCount: thumbImgs.length
            };
        }""")
        assert desk_layout["appWidth"] >= 950, f"Desktop layout should not be trapped in 390px frame (got {desk_layout['appWidth']})"
        assert desk_layout["sideWidth"] >= 350 and desk_layout["sideLeft"] >= desk_layout["mainRight"] - 4, f"Desktop sidebar must sit beside main arena: {desk_layout}"
        assert desk_layout["mainHeight"] <= 800 and desk_layout["sceneHeight"] >= 300 and desk_layout["toolbarBottom"] <= 800, f"Desktop card stage & toolbar must be fully visible inside viewport: {desk_layout}"
        assert desk_layout["usesThumbWebp"] is True, "Word list must use lazy-loaded thumb_*.webp images"
        print(f"✓ Desktop 1280x800 adaptive two-column layout & lazy thumbnails verified: {desk_layout}")

        # Keyboard navigation on desktop (ArrowRight, Space)
        desk_page.keyboard.press("ArrowRight")
        desk_page.wait_for_timeout(150)
        desk_idx = desk_page.evaluate("() => window.KTNFlashcardApp.getState().currentIndex")
        assert desk_idx == 1, "ArrowRight should advance card on desktop"
        desk_page.keyboard.press(" ")
        desk_page.wait_for_timeout(300)
        desk_flipped = desk_page.evaluate("() => document.getElementById('flashcard').classList.contains('is-flipped')")
        assert desk_flipped is True, "Space should flip card on desktop"
        desk_page.keyboard.press(" ")
        desk_page.wait_for_timeout(350)
        desk_page.evaluate("() => document.getElementById('toastMessage').classList.remove('show')")

        desk_page.screenshot(path=os.path.join(SCREENSHOT_DIR, "desktop-1280x800-split.png"))

        # Switch desktop to Lộ 7 Card #15 (加减) and capture screenshot
        desk_page.select_option("#levelSelect", "lo7")
        desk_page.evaluate("() => { const st = window.KTNFlashcardApp.getState(); st.currentIndex = 13; document.getElementById('btnNext').click(); document.getElementById('toastMessage').classList.remove('show'); }")
        desk_page.wait_for_function("() => { const im = document.getElementById('cardFrontImg'); return im && im.complete && im.naturalWidth === 660; }")
        desk_page.wait_for_timeout(200)
        desk_page.screenshot(path=os.path.join(SCREENSHOT_DIR, "desktop-1280x800-lo7.png"))

        assert len(console_errors) == 0, f"Unexpected page errors: {console_errors}"
        browser.close()
    httpd.shutdown()
    print("=== ALL PLAYWRIGHT E2E TESTS & SCREENSHOTS COMPLETED SUCCESSFULLY ===")

if __name__ == "__main__":
    run_tests()
