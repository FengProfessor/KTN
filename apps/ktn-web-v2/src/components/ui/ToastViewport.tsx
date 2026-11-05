import React from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';
import { useUiStore } from '@/stores/useUiStore';
import { cn } from '@/lib/utils';

export const ToastViewport: React.FC = () => {
  const { toasts, dismissToast } = useUiStore();

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-label="Thông báo hệ thống"
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-[calc(100vw-2rem)] pointer-events-none"
    >
      {toasts.map((t) => {
        const Icon =
          t.variant === 'success'
            ? CheckCircle2
            : t.variant === 'warning'
              ? AlertTriangle
              : t.variant === 'error'
                ? XCircle
                : Info;
        return (
          <div
            key={t.id}
            role="status"
            data-testid="toast-item"
            className={cn(
              'pointer-events-auto flex items-start gap-3 rounded-xl border p-3.5 shadow-float transition-all bg-white',
              t.variant === 'success' && 'border-emerald-200 bg-emerald-50/95 text-emerald-950',
              t.variant === 'warning' && 'border-amber-200 bg-amber-50/95 text-amber-950',
              t.variant === 'error' && 'border-red-200 bg-red-50/95 text-red-950',
              t.variant === 'default' && 'border-zinc-200 bg-white text-zinc-900'
            )}
          >
            <Icon className="h-5 w-5 shrink-0 mt-0.5" />
            <div className="flex-1 text-sm">
              <p className="font-semibold leading-snug">{t.title}</p>
              {t.description && <p className="mt-0.5 text-xs opacity-90">{t.description}</p>}
            </div>
            <button
              type="button"
              onClick={() => dismissToast(t.id)}
              aria-label="Đóng thông báo"
              className="rounded-lg p-1 hover:bg-black/5"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
