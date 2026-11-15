/**
 * Audio Service for KTN Chinese Interactive Games
 * Provides synthesized Web Audio sound effects (0 external audio assets required)
 * and Web Speech API Chinese TTS pronunciation with fallback.
 */

type SfxKind = 'flip' | 'ok' | 'err' | 'pop' | 'shoot' | 'hit' | 'win' | 'gameover';

const STORAGE_KEY_MUTED = 'ktn_games_sound_muted';

const PENTATONIC_HZ = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5];

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  if (audioContext && audioContext.state === 'closed') {
    audioContext = null;
  }
  if (!audioContext) {
    try {
      audioContext = new AudioCtx();
    } catch {
      return null;
    }
  }
  if (audioContext.state === 'suspended') {
    audioContext.resume().catch(() => null);
  }
  return audioContext;
}

function attachNodeCleanup(osc: OscillatorNode, gain: GainNode): void {
  osc.onended = () => {
    try {
      osc.disconnect();
      gain.disconnect();
    } catch {
      // ignore disconnect errors
    }
  };
}

export function isSoundMuted(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY_MUTED) === 'true';
  } catch {
    return false;
  }
}

export function setSoundMuted(muted: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY_MUTED, muted ? 'true' : 'false');
  } catch {
    // ignore
  }
}

export function toggleSound(): boolean {
  const current = isSoundMuted();
  const next = !current;
  setSoundMuted(next);
  return next;
}

/**
 * Play procedural sound effects using Web Audio API
 */
export function playSfx(kind: SfxKind): void {
  if (isSoundMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;

    if (kind === 'flip') {
      // Subtle card flip whoosh
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(420, now);
      osc.frequency.exponentialRampToValueAtTime(680, now + 0.06);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
      osc.connect(gain);
      gain.connect(ctx.destination);
      attachNodeCleanup(osc, gain);
      osc.start(now);
      osc.stop(now + 0.07);
    } else if (kind === 'ok') {
      // Joyful chime chord C5-E5-G5
      [523.25, 659.25, 783.99].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.04);
        gain.gain.setValueAtTime(0.12, now + idx * 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.04 + 0.22);
        osc.connect(gain);
        gain.connect(ctx.destination);
        attachNodeCleanup(osc, gain);
        osc.start(now + idx * 0.04);
        osc.stop(now + idx * 0.04 + 0.23);
      });
    } else if (kind === 'err') {
      // Soft error tone (downward ramp)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.linearRampToValueAtTime(140, now + 0.18);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.19);
      osc.connect(gain);
      gain.connect(ctx.destination);
      attachNodeCleanup(osc, gain);
      osc.start(now);
      osc.stop(now + 0.19);
    } else if (kind === 'pop') {
      // Balloon pop burst
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(260, now);
      osc.frequency.exponentialRampToValueAtTime(920, now + 0.08);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      osc.connect(gain);
      gain.connect(ctx.destination);
      attachNodeCleanup(osc, gain);
      osc.start(now);
      osc.stop(now + 0.09);
    } else if (kind === 'shoot') {
      // Quick arrow/laser shot
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(320, now + 0.12);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      attachNodeCleanup(osc, gain);
      osc.start(now);
      osc.stop(now + 0.12);
    } else if (kind === 'hit') {
      // Impact thud
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.exponentialRampToValueAtTime(45, now + 0.15);
      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      osc.connect(gain);
      gain.connect(ctx.destination);
      attachNodeCleanup(osc, gain);
      osc.start(now);
      osc.stop(now + 0.16);
    } else if (kind === 'win') {
      // Fanfare arpeggio C-E-G-C'
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        const start = now + idx * 0.08;
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0.15, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        attachNodeCleanup(osc, gain);
        osc.start(start);
        osc.stop(start + 0.36);
      });
    } else if (kind === 'gameover') {
      // Low descending minor phrase
      [330, 311.13, 293.66, 261.63].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        const start = now + idx * 0.12;
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0.12, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        attachNodeCleanup(osc, gain);
        osc.start(start);
        osc.stop(start + 0.26);
      });
    }
  } catch {
    // Ignore audio graph errors
  }
}

/**
 * Play ascending pentatonic combo chime with optional octave shimmer on high streaks
 */
export function playComboSfx(streak: number): void {
  if (isSoundMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const freq =
      PENTATONIC_HZ[Math.min(PENTATONIC_HZ.length - 1, Math.max(0, Math.floor(streak) - 1))];

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.connect(gain);
    gain.connect(ctx.destination);
    attachNodeCleanup(osc, gain);
    osc.start(now);
    osc.stop(now + 0.17);

    if (streak >= 4) {
      const shimmerOsc = ctx.createOscillator();
      const shimmerGain = ctx.createGain();
      const shimmerStart = now + 0.035;
      shimmerOsc.type = 'sine';
      shimmerOsc.frequency.setValueAtTime(freq * 2, shimmerStart);
      shimmerGain.gain.setValueAtTime(0.08, shimmerStart);
      shimmerGain.gain.exponentialRampToValueAtTime(0.001, shimmerStart + 0.16);
      shimmerOsc.connect(shimmerGain);
      shimmerGain.connect(ctx.destination);
      attachNodeCleanup(shimmerOsc, shimmerGain);
      shimmerOsc.start(shimmerStart);
      shimmerOsc.stop(shimmerStart + 0.17);
    }
  } catch {
    // Ignore audio graph errors
  }
}

/**
 * Pronounce Chinese text with Web Speech API
 */
export function speakChinese(text: string, rate = 0.88): void {
  if (isSoundMuted()) return;
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.rate = rate;
    utterance.pitch = 1.05;

    // Pick a Chinese voice if available
    const voices = window.speechSynthesis.getVoices?.() || [];
    const zhVoice = voices.find((v) => v.lang.startsWith('zh') || v.lang.includes('cmn'));
    if (zhVoice) {
      utterance.voice = zhVoice;
    }

    window.speechSynthesis.speak(utterance);
  } catch {
    // Ignore TTS speech errors
  }
}
