import React, { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, BookOpenCheck } from 'lucide-react';
import { useAuthStore } from '@/stores/useAuthStore';

export const FlashcardsPage: React.FC = () => {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const iframeSrc = useMemo(() => {
    if (typeof window !== 'undefined') {
      const winBase = (window as unknown as { __KTN_FLASHCARD_ASSET_BASE__?: string })
        .__KTN_FLASHCARD_ASSET_BASE__;
      if (
        typeof winBase === 'string' &&
        winBase.trim() &&
        !winBase.includes('github.io')
      ) {
        const cleanBase = winBase.trim().replace(/\/+$/, '');
        return `${cleanBase}/index.html?embed=ktn-react-v2`;
      }
    }
    return '/flashcards/index.html?embed=ktn-react-v2';
  }, []);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const data = event.data;
      if (data && typeof data === 'object' && data.type === 'KTN_FLASHCARD_BACK_HOME') {
        navigate('/');
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [navigate]);

  return (
    <div
      data-testid="flashcards-page"
      className="flex flex-col gap-1.5"
    >
      <div
        data-testid="flashcards-page-bar"
        className="flex items-center justify-between gap-2 rounded-xl border border-stone-200 bg-white px-2.5 py-1.5 shadow-2xs sm:px-3.5"
      >
        <button
          type="button"
          data-testid="flashcards-back-home-btn"
          onClick={() => navigate('/')}
          className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg bg-red-800 px-3 py-1 text-xs font-bold text-white shadow-2xs transition-colors hover:bg-red-900 active:scale-95"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Quay lại Trang chủ</span>
        </button>

        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-stone-600">
          <BookOpenCheck className="h-3.5 w-3.5 text-amber-700" />
          <span className="hidden sm:inline">
            {user?.name ? `${user.name} · ` : ''}
          </span>
          <span className="font-bold text-stone-800">605 thẻ · 7 Lộ</span>
        </div>
      </div>

      <iframe
        data-testid="flashcards-iframe"
        src={iframeSrc}
        title="Flashcard Từ Vựng Khổng Tử Nhí"
        allow="autoplay"
        className="h-[calc(100dvh-184px)] min-h-[460px] w-full rounded-2xl border border-stone-200 bg-[#FAF6F0] shadow-2xs md:h-[calc(100dvh-120px)]"
      />
    </div>
  );
};
