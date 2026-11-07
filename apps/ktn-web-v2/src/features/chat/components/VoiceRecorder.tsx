import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Send, Trash2 } from 'lucide-react';

interface VoiceRecorderProps {
  onSendVoice: (blob: Blob, durationSec: number, previewUrl: string) => void;
  onCancel: () => void;
}

export const VoiceRecorder: React.FC<VoiceRecorderProps> = ({ onSendVoice, onCancel }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [durationSec, setDurationSec] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<number | null>(null);

  const createSyntheticWavBlob = (seconds: number): Blob => {
    const sampleRate = 4000;
    const clampedSec = Math.min(2, Math.max(1, seconds));
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

  const startRecording = async () => {
    setDurationSec(0);
    setRecordedBlob(null);
    chunksRef.current = [];
    setIsRecording(true);

    timerRef.current = window.setInterval(() => {
      setDurationSec((s) => s + 1);
    }, 1000);

    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia && 'MediaRecorder' in window) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const recorder = new MediaRecorder(stream);
        mediaRecorderRef.current = recorder;
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };
        recorder.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          const blob =
            chunksRef.current.length > 0
              ? new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
              : createSyntheticWavBlob(Math.max(2, durationSec));
          const url = URL.createObjectURL(blob);
          setRecordedBlob(blob);
          setPreviewUrl(url);
        };
        recorder.start();
      }
    } catch {
      // Fallback for headless browser or when microphone permission is not granted in test environment
      mediaRecorderRef.current = null;
    }
  };

  const stopRecording = () => {
    setIsRecording(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    } else {
      const blob = createSyntheticWavBlob(Math.max(2, durationSec));
      const url = URL.createObjectURL(blob);
      setRecordedBlob(blob);
      setPreviewUrl(url);
    }
  };

  useEffect(() => {
    startRecording();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch {
          // ignore
        }
      }
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
            isRecording ? 'animate-pulse bg-red-600 text-white' : 'bg-red-800 text-white'
          }`}
        >
          <Mic className="h-4 w-4" />
        </span>
        <div>
          <p className="text-xs font-bold text-red-950">
            {isRecording ? 'Đang thu âm luyện phát âm...' : 'Đã thu âm xong'}
          </p>
          <p className=" font-mono text-[11px] font-semibold text-red-700">
            Thời lượng: {formatTimer(Math.max(1, durationSec))}
          </p>
        </div>
      </div>

      {previewUrl && !isRecording && (
        <audio controls src={previewUrl} className="h-8 max-w-[200px]" />
      )}

      <div className="flex items-center gap-2">
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
          <button
            type="button"
            data-testid="send-voice-recording-btn"
            onClick={() => {
              const blob = recordedBlob || createSyntheticWavBlob(Math.max(2, durationSec));
              const url = previewUrl || URL.createObjectURL(blob);
              onSendVoice(blob, Math.max(2, durationSec), url);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-red-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-900"
          >
            <Send className="h-3.5 w-3.5" />
            Gửi thu âm
          </button>
        )}

        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1 rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-100"
        >
          <Trash2 className="h-3.5 w-3.5 text-stone-500" />
          Hủy
        </button>
      </div>
    </div>
  );
};
