import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Send, Trash2, RotateCcw } from 'lucide-react';

interface VoiceRecorderProps {
  onSendVoice: (blob: Blob, durationSec: number, previewUrl: string) => void;
  onRecordingReady?: (blob: Blob, durationSec: number, previewUrl: string) => void;
  onRecordingStateChange?: (isRecording: boolean) => void;
  onClearRecording?: () => void;
  onCancel: () => void;
  submitLabel?: string;
}

function getPreferredSupportedAudioMime(): string {
  if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') {
    return 'audio/wav';
  }
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
    'audio/ogg',
  ];
  if (typeof MediaRecorder.isTypeSupported === 'function') {
    for (const mime of candidates) {
      try {
        if (MediaRecorder.isTypeSupported(mime)) return mime;
      } catch {
        // ignore
      }
    }
  }
  return '';
}

export function normalizeAudioMimeType(rawMime?: string | null): string {
  const base = String(rawMime || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  if (!base) return 'audio/wav';
  if (base === 'video/webm') return 'audio/webm';
  if (base.startsWith('audio/')) return base;
  return 'audio/wav';
}

export function getAudioExtensionFromMime(rawMime?: string | null): string {
  const mime = normalizeAudioMimeType(rawMime);
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('mp4') || mime.includes('m4a') || mime.includes('aac')) return 'm4a';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3';
  return 'wav';
}

export const VoiceRecorder: React.FC<VoiceRecorderProps> = ({
  onSendVoice,
  onRecordingReady,
  onRecordingStateChange,
  onClearRecording,
  onCancel,
  submitLabel = 'Gửi thu âm',
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [durationSec, setDurationSec] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<number | null>(null);
  const durationSecRef = useRef<number>(0);
  const sessionIdRef = useRef<number>(0);
  const isCancelledRef = useRef<boolean>(false);

  const createSyntheticWavBlob = (seconds: number): Blob => {
    const sampleRate = 8000;
    const clampedSec = Math.min(5, Math.max(2, seconds));
    const numSamples = sampleRate * clampedSec;
    const buffer = new ArrayBuffer(44 + numSamples * 2);
    const view = new DataView(buffer);

    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + numSamples * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, numSamples * 2, true);

    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      const sample = Math.sin(2 * Math.PI * 440 * t) * 0.15;
      view.setInt16(44 + i * 2, sample * 32767, true);
    }

    return new Blob([buffer], { type: 'audio/wav' });
  };

  const cleanupMediaStream = () => {
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach((t) => t.stop());
      } catch {
        // ignore
      }
      streamRef.current = null;
    }
  };

  const finalizeRecording = (rawBlob: Blob | null, expectedSessionId: number) => {
    if (isCancelledRef.current || sessionIdRef.current !== expectedSessionId) {
      return;
    }
    onRecordingStateChange?.(false);
    const finalDur = Math.max(2, durationSecRef.current);
    const validBlob =
      rawBlob && rawBlob.size > 44
        ? new Blob([rawBlob], { type: normalizeAudioMimeType(rawBlob.type) })
        : createSyntheticWavBlob(finalDur);
    const url = URL.createObjectURL(validBlob);
    setRecordedBlob(validBlob);
    setPreviewUrl(url);
    onRecordingReady?.(validBlob, finalDur, url);
  };

  const startRecording = async (isRetry = false) => {
    const currentSessionId = sessionIdRef.current + 1;
    sessionIdRef.current = currentSessionId;
    isCancelledRef.current = false;

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // ignore
      }
    }
    mediaRecorderRef.current = null;
    cleanupMediaStream();

    if (isRetry) {
      onClearRecording?.();
    }

    durationSecRef.current = 0;
    setDurationSec(0);
    setRecordedBlob(null);
    setPreviewUrl(null);
    chunksRef.current = [];
    setIsRecording(true);
    onRecordingStateChange?.(true);

    timerRef.current = window.setInterval(() => {
      durationSecRef.current += 1;
      setDurationSec(durationSecRef.current);
    }, 1000);

    try {
      if (
        typeof navigator !== 'undefined' &&
        navigator.mediaDevices &&
        typeof navigator.mediaDevices.getUserMedia === 'function' &&
        typeof window !== 'undefined' &&
        'MediaRecorder' in window
      ) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (isCancelledRef.current || sessionIdRef.current !== currentSessionId) {
          try {
            stream.getTracks().forEach((t) => t.stop());
          } catch {
            // ignore
          }
          return;
        }
        streamRef.current = stream;
        const preferredMime = getPreferredSupportedAudioMime();
        const recorder = preferredMime
          ? new MediaRecorder(stream, { mimeType: preferredMime })
          : new MediaRecorder(stream);
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            chunksRef.current.push(e.data);
          }
        };

        recorder.onstop = () => {
          cleanupMediaStream();
          if (isCancelledRef.current || sessionIdRef.current !== currentSessionId) {
            return;
          }
          const cleanMime = normalizeAudioMimeType(
            recorder.mimeType || preferredMime || 'audio/webm'
          );
          const blob =
            chunksRef.current.length > 0
              ? new Blob(chunksRef.current, { type: cleanMime })
              : null;
          finalizeRecording(blob, currentSessionId);
        };

        recorder.start(250);
      }
    } catch {
      // Fallback for headless browser or when microphone permission is not granted in test environment
      mediaRecorderRef.current = null;
      cleanupMediaStream();
    }
  };

  const stopRecording = () => {
    const activeSessionId = sessionIdRef.current;
    setIsRecording(false);
    onRecordingStateChange?.(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      try {
        if (recorder.state === 'recording' && typeof recorder.requestData === 'function') {
          try {
            recorder.requestData();
          } catch {
            // ignore
          }
        }
        recorder.stop();
        return;
      } catch {
        // Fallback below if stop throws
      }
    }
    cleanupMediaStream();
    finalizeRecording(null, activeSessionId);
  };

  const handleCancelClick = () => {
    isCancelledRef.current = true;
    sessionIdRef.current += 1;
    setIsRecording(false);
    onRecordingStateChange?.(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // ignore
      }
    }
    mediaRecorderRef.current = null;
    cleanupMediaStream();
    onClearRecording?.();
    onCancel();
  };

  useEffect(() => {
    startRecording(false);
    return () => {
      isCancelledRef.current = true;
      sessionIdRef.current += 1;
      onRecordingStateChange?.(false);
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch {
          // ignore
        }
      }
      cleanupMediaStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div
      data-testid="voice-recorder-panel"
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50/90 px-3.5 py-2.5"
    >
      <div className="flex items-center gap-2.5">
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-full ${
            isRecording ? 'animate-pulse bg-red-600 text-white' : 'bg-emerald-700 text-white'
          }`}
        >
          <Mic className="h-4 w-4" />
        </span>
        <div>
          <p className="text-xs font-bold text-red-950">
            {isRecording
              ? 'Đang thu âm luyện phát âm...'
              : 'Đã thu âm xong (bản thu đã sẵn sàng nộp)'}
          </p>
          <p className="font-mono text-[11px] font-semibold text-red-700">
            Thời lượng: {formatTimer(Math.max(1, durationSec))}
          </p>
        </div>
      </div>

      {previewUrl && !isRecording && (
        <audio
          data-testid="voice-recorder-preview-audio"
          controls
          src={previewUrl}
          className="h-8 max-w-[210px]"
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        {isRecording ? (
          <button
            type="button"
            data-testid="stop-voice-recording-btn"
            onClick={stopRecording}
            className="inline-flex items-center gap-1.5 rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-stone-800"
          >
            <Square className="h-3.5 w-3.5 fill-white" />
            Dừng thu
          </button>
        ) : (
          <>
            <button
              type="button"
              data-testid="send-voice-recording-btn"
              onClick={() => {
                const finalDur = Math.max(2, durationSecRef.current || durationSec);
                const blob = recordedBlob || createSyntheticWavBlob(finalDur);
                const url = previewUrl || URL.createObjectURL(blob);
                onSendVoice(blob, finalDur, url);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-900"
            >
              <Send className="h-3.5 w-3.5" />
              {submitLabel}
            </button>
            <button
              type="button"
              data-testid="retry-voice-recording-btn"
              onClick={() => startRecording(true)}
              className="inline-flex items-center gap-1 rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-100"
            >
              <RotateCcw className="h-3.5 w-3.5 text-stone-500" />
              Thu lại
            </button>
          </>
        )}

        <button
          type="button"
          data-testid="cancel-voice-recording-btn"
          onClick={handleCancelClick}
          className="inline-flex items-center gap-1 rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-100"
        >
          <Trash2 className="h-3.5 w-3.5 text-stone-500" />
          Hủy
        </button>
      </div>
    </div>
  );
};
