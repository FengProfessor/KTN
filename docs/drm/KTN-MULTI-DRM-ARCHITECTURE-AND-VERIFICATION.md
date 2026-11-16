# KTN Multi-DRM Architecture, Packaging & Screen-Capture Verification Matrix

> Last updated: 2026-11-16 | Base SHA: `7dbd6dd950e6` | Production policy default: `drmDisabled` (Zero learner disruption)

## 1. Real Media Audit (Empirical Findings on `media.izteach.vn`)

Probed `https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6adadc45f8c3c60002a2b3c1/playlist.m3u8` and `ffprobe` on upstream segment `85159d5ccd68446ca0ca5a38d40ae556_01_0000000.ts`:

| Field | Measured Result | Impact on Multi-DRM |
|---|---|---|
| Master HLS playlist | HTTP 200: 480p (`avc1.6e001f`) & 720p (`avc1.6e0020`) | Multi-bitrate source playlists exist |
| Raw `original.mp4` | HTTP 404 | Must ingest from HLS master / izTeach source archive |
| Video codec/pixel format | **10-bit H.264 `High 10` (`yuv420p10le`, level 32, 60000/1001 fps)** | **Critical**: Hardware DRM decoders (Apple FairPlay AVFoundation/EME, Android Widevine L1, Windows PlayReady SL3000) fail or fall back on 10-bit AVC. Mandatory **offline** 8-bit `yuv420p` transcode before packaging. |
| Audio stream | AAC-LC mono 44100 Hz | Normalize to stereo AAC-LC 44100 Hz for CMAF parity |
| Heavy transcoding in Cloudflare Worker | Forbidden | Worker only proxies manifests/segments & license challenges; `scripts/drm/package-ktn-drm.mjs` runs offline/CI |

## 2. Architecture & Security Boundaries

### 2.1 Server-Side Worker Contract (`cloudflare-worker-sw-proxy.js`)

1. `GET /api/ktn/drm/policy?courseId=...` / `POST /api/ktn/drm/policy` (Admin only, Supabase KV persistence + cache).
   - Policies: `drmDisabled` (Level 1 HLS AES-128), `drmPilot` (QA allowlist emails/units/videos), `drmRequired` (strict DRM only, zero non-DRM fallback), `drmFallbackAllowed` (Level 1 HLS fallback ONLY on unsupported browsers, explicitly tagged `captureProtectionGuaranteed: false`).
2. `GET /api/ktn/drm/playback?unitId=...&courseId=...`
   - Enforces all 6 checks before issuing a 120s license token (`k: 'drm_lic'`) + 2h stream token (`k: 'drm_stream'`):
     1. Authenticated session (`401 AUTH_REQUIRED`)
     2. Real server-side izTeach entitlement (`verifyStudentCourseAccessServerSide`, `403 COURSE_NOT_ENTITLED`)
     3. Course expiration (`403 COURSE_EXPIRED`)
     4. Unit belongs to course (`403 UNIT_COURSE_MISMATCH`)
     5. Session revocation / 3-device session limit (`isMediaSessionRevoked`, `401 SESSION_REVOKED`)
     6. Short-lived HMAC-SHA256 `drmToken` (`exp` 120s, bound to `user`, `jti`, `courseId`, `unitId`, `videoId`, `nonce`).
   - Rejects public test DRM license servers (`test.playready.microsoft.com`, `proxy.uat.widevine.com`, `fps.ezdrm.com/demo`, etc.).
   - Returns `licenseStatus: "BLOCKED_MISSING_CREDENTIALS"` when commercial credentials are absent; NEVER substitutes ClearKey.
3. `POST /api/ktn/drm/license/{drmSystem}` (`widevine` | `playready` | `fairplay`)
   - Validates Bearer session, `X-KTN-DRM-Token` (`k: 'drm_lic'`, `u === actorEmail`, `j === actorJti`), revocation, and student course access.
   - Injects commercial provider secrets (`KTN_DRM_PROVIDER_API_KEY` / `KTN_DRM_AUTH_HEADER` / `KTN_DRM_TENANT_ID`) **server-side only** — browser JavaScript never sees private keys or provider API secrets.
   - Returns HTTP `503 BLOCKED` when unconfigured.
4. Anti-HLS-Bypass Guard:
   - On `/api/ktn/courses/units`, `/api/ktn/media/hls-key`, and `/api/ktn/media/hls/*`, units with `drmRequired` or active `drmPilot` return `streamUrl: null`, `video: ""`, and HTTP `403 DRM_REQUIRED_NO_HLS_BYPASS` for full-lesson `k: 'hls'` tokens.
   - **90-second free trial (`k: 'demo'`) remains operational** and unaffected.

### 2.2 Client Player & Capability Detection (`HlsVideoPlayer.tsx`, `drmCapability.ts`, `shakaLoader.ts`)

- Lazy-loads `shaka-player@5.3.5` compiled bundle (`es2021`) via `/vendor/shaka-player.compiled-es2021.js` (dev/preview) or SRI-pinned CDN in production to respect the strict `<500 KiB` Vite asset chunk budget enforced by `deploy_ktn_react_v2_izteach.cjs`.
- Probes real CDM support via `navigator.requestMediaKeySystemAccess`:
  - FairPlay (`com.apple.fps` -> `com.apple.fps.1_0`)
  - PlayReady (`com.microsoft.playready.recommendation` SL3000 -> SL2000 -> `com.microsoft.playready`)
  - Widevine (`com.widevine.alpha` `HW_SECURE_ALL` -> `HW_SECURE_CRYPTO` -> `SW_SECURE_CRYPTO`)
  - `window.isSecureContext` + embedded WebView banner guidance (Zalo, Facebook, Instagram, LINE).
- Never concludes capture protection solely from `navigator.userAgent`; `captureProtectionGuaranteed` stays `false` until real-device capture verification passes.
- Verifies `player.drmInfo()?.keySystem` before transitioning to `ready`.
- Preserves play/pause, seek bar, speed (`0.75x..1.5x`), resolution selector (`Auto` + variants), native/pseudo fullscreen, self-healing anti-DOM-tamper watermark, ask-at-timestamp, and lesson completion.

## 3. Commercial License Provider & Real Cost Estimate (Required Before Production Pilot)

Current repository status: **BLOCKED** — `.env` contains **0** commercial DRM license credentials, and `shaka-packager` CLI is not installed on the build host.

Typical production commercial KMS options for KTN (~1,000–5,000 learners):

| Option | DRM Systems Covered | Indicative Commercial Cost (External Vendor Pricing) | Integration Fit |
|---|---|---|---|
| **Axinom DRM / EZDRM** | Widevine + PlayReady SL3000/SL2000 + Apple FairPlay | ~$300–$500/month minimum platform fee + ~$0.001–$0.005/license + Apple Developer FairPlay FPS Deployment Package ($99/yr) | Drop-in match for `POST /api/ktn/drm/license/{drmSystem}` & SPEKE keys |
| **BuyDRM (KeyOS)** | Widevine + PlayReady + FairPlay | ~$500+/month minimum + per-license overage | Enterprise; compatible via `KTN_DRM_*` headers |
| **Cloudflare Stream (DRM beta / Signed Tokens)** | FairPlay + Widevine (+ PlayReady depending on plan) | $5/1,000 stored min + $1/1,000 delivered min (storage/delivery hosted on CF) | Alternative if migrating video origin away from `media.izteach.vn` |

*(No vendor contract or invoice is active in `D:\Vibe\khongtunhi_sofl_style` yet; numbers above are vendor reference tiers to inform procurement, NOT billed spend.)*

## 4. Real-Device Screen-Capture Matrix

Status legend (strictly enforced):
- `PLAYBACK_PASS`: Authenticated DRM playback succeeded with real CDM session.
- `CAPTURE_BLACK_VERIFIED`: Screen recording video inspected manually on physical hardware and the `<video>` viewport is verified black.
- `CAPTURE_VISIBLE`: Screen recording still captured visible video frames.
- `UNSUPPORTED`: Browser/device lacks required CDM/EME support.
- `NOT_TESTED`: Hardware / commercial license not yet tested physically (Playwright headless screenshots NEVER count as `CAPTURE_BLACK_VERIFIED`).

| # | Device / Browser / Security Level | Playback | Tab Capture | Full Screen | OS / OBS Capture | Screenshot | Audio | HDCP / Ext Display | HW Accel Off Behavior | Error Fallback Leakage |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Windows 11 Edge · PlayReady SL2000 | `NOT_TESTED` (Env `BLOCKED` - no commercial license) | `NOT_TESTED` | `NOT_TESTED` | `NOT_TESTED` | `NOT_TESTED` | `NOT_TESTED` | `NOT_TESTED` | `NOT_TESTED` | `NOT_TESTED` on real device (unit/harness verifies `drmRequired` fails closed with no silent HLS fallback) |
| 2 | Windows 11 Edge · PlayReady SL3000 | `NOT_TESTED` | `NOT_TESTED` | `NOT_TESTED` | `NOT_TESTED` | `NOT_TESTED` | `NOT_TESTED` | `NOT_TESTED` | `NOT_TESTED` | `NOT_TESTED` on real device (unit/harness verifies `drmRequired` fails closed with no silent HLS fallback) |
| 3 | Windows Chrome · Widevine (L3 SW) | `NOT_TESTED` | `NOT_TESTED` | `NOT_TESTED` | `NOT_TESTED` | `NOT_TESTED` | `NOT_TESTED` | `NOT_TESTED` | Expected `SW_SECURE_CRYPTO` / `CAPTURE_VISIBLE` risk on desktop SW | `NOT_TESTED` on real device (unit/harness verifies `drmRequired` fails closed with no silent HLS fallback) |
| 4 | Windows Firefox · Widevine (L3 SW) | `NOT_TESTED` | `NOT_TESTED` | `NOT_TESTED` | `NOT_TESTED` | `NOT_TESTED` | `NOT_TESTED` | `NOT_TESTED` | Expected `SW_SECURE_CRYPTO` / `CAPTURE_VISIBLE` risk on desktop SW | `NOT_TESTED` on real device (unit/harness verifies `drmRequired` fails closed with no silent HLS fallback) |
| 5 | Android Chrome · Widevine L1 (HW) | `NOT_TESTED` | `NOT_TESTED` | `NOT_TESTED` | `NOT_TESTED` | `NOT_TESTED` | `NOT_TESTED` | `NOT_TESTED` | `NOT_TESTED` | `NOT_TESTED` on real device (unit/harness verifies `drmRequired` fails closed with no silent HLS fallback) |
| 6 | Android Chrome · Widevine L3 | `NOT_TESTED` | `NOT_TESTED` | `NOT_TESTED` | `NOT_TESTED` | `NOT_TESTED` | `NOT_TESTED` | `NOT_TESTED` | `NOT_TESTED` | `NOT_TESTED` on real device (unit/harness verifies `drmRequired` fails closed with no silent HLS fallback) |
| 7 | iPhone Safari · FairPlay | `NOT_TESTED` | `NOT_TESTED` | `NOT_TESTED` | `NOT_TESTED` | `NOT_TESTED` | `NOT_TESTED` | `NOT_TESTED` | `NOT_TESTED` | `NOT_TESTED` on real device (unit/harness verifies `drmRequired` fails closed with no silent HLS fallback) |
| 8 | iPad Safari · FairPlay | `NOT_TESTED` | `NOT_TESTED` | `NOT_TESTED` | `NOT_TESTED` | `NOT_TESTED` | `NOT_TESTED` | `NOT_TESTED` | `NOT_TESTED` | `NOT_TESTED` on real device (unit/harness verifies `drmRequired` fails closed with no silent HLS fallback) |
| 9 | macOS Safari · FairPlay | `NOT_TESTED` | `NOT_TESTED` | `NOT_TESTED` | `NOT_TESTED` | `NOT_TESTED` | `NOT_TESTED` | `NOT_TESTED` | `NOT_TESTED` | `NOT_TESTED` on real device (unit/harness verifies `drmRequired` fails closed with no silent HLS fallback) |
| 10 | Zalo / Facebook In-App WebView | `NOT_TESTED` | `NOT_TESTED` | `NOT_TESTED` | `NOT_TESTED` | `NOT_TESTED` | `NOT_TESTED` | `NOT_TESTED` | N/A | `NOT_TESTED` on real device (unit/harness verifies `DRM_EMBEDDED_WEBVIEW` guidance in `drmRequired` & watermarked fallback in `drmFallbackAllowed`) |

## 5. Rollback Procedure

1. Keep `KTN_DRM_*` course policy set to `drmDisabled` globally.
2. When piloting a QA unit (`drmPilot`), only `pilotEmails` see DRM; all other students remain on Level 1 HLS AES-128 (`/api/ktn/media/hls/*`).
3. Immediate rollback for any course: `POST /api/ktn/drm/policy` with `{ "courseId": "<id>", "policy": "drmDisabled" }` restores Level 1 HLS immediately without re-deploying assets.
