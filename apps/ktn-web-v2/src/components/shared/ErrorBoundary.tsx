import React from 'react';
import { RefreshCw, Home, AlertTriangle } from 'lucide-react';
import { isChunkLoadError, tryAutoReloadOnChunkError } from '@/lib/lazyWithRetry';
import { trStatic } from '@/i18n';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  scope?: 'root' | 'route';
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  isChunkError: boolean;
  errorMessage: string;
}

class BaseErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      isChunkError: false,
      errorMessage: '',
    };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    const isChunk = isChunkLoadError(error);
    const msg = error instanceof Error ? error.message : String(error || '');
    return {
      hasError: true,
      isChunkError: isChunk,
      errorMessage: msg.slice(0, 240),
    };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo): void {
    console.error(`[KTN ErrorBoundary:${this.props.scope || 'route'}]`, error, info?.componentStack);
    if (isChunkLoadError(error)) {
      tryAutoReloadOnChunkError();
    }
  }

  private handleReload = (): void => {
    try {
      window.sessionStorage.setItem('ktn_chunk_reload_ts', String(Date.now()));
    } catch {
      // ignore
    }
    try {
      window.location.reload();
    } catch {
      this.setState({ hasError: false, isChunkError: false, errorMessage: '' });
    }
  };

  private handleGoHome = (): void => {
    this.setState({ hasError: false, isChunkError: false, errorMessage: '' });
    this.props.onReset?.();
    if (typeof window !== 'undefined') {
      if (window.location.pathname.includes('/custom-page/') || window.location.hash.startsWith('#/')) {
        window.location.hash = '#/';
      } else {
        window.location.assign('/');
      }
    }
  };

  render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const isRoot = this.props.scope === 'root';
    const title = this.state.isChunkError
      ? trStatic('Hệ thống vừa được cập nhật phiên bản mới', 'A new version is available')
      : trStatic('Đã xảy ra sự cố hiển thị tạm thời', 'Something went wrong while displaying this view');
    const description = this.state.isChunkError
      ? trStatic(
          'Vui lòng bấm Tải lại trang để đồng bộ giao diện mới nhất.',
          'Please reload the page to load the latest update.'
        )
      : trStatic(
          'Dữ liệu học tập của bạn vẫn an toàn. Bạn có thể thử tải lại trang hoặc quay về trang chủ.',
          'Your learning data is safe. You can reload the page or return to the home screen.'
        );

    return (
      <div
        role="alert"
        data-testid={isRoot ? 'ktn-root-error-fallback' : 'ktn-route-error-fallback'}
        className={`flex w-full items-center justify-center p-4 ${
          isRoot ? 'min-h-screen bg-[#FFFDF9]' : 'min-h-[320px] py-10'
        }`}
      >
        <div className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-6 text-center shadow-sm">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-[#8B0000]">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h2 className="text-base font-bold text-stone-900">{title}</h2>
          <p className="mt-1.5 text-sm text-stone-600">{description}</p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
            <button
              type="button"
              onClick={this.handleReload}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#8B0000] px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-red-900"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {trStatic('Tải lại trang', 'Reload page')}
            </button>
            <button
              type="button"
              onClick={this.handleGoHome}
              className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-100"
            >
              <Home className="h-3.5 w-3.5" />
              {trStatic('Về trang chủ', 'Go Home')}
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export const RootErrorBoundary: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <BaseErrorBoundary scope="root">{children}</BaseErrorBoundary>
);

export const RouteErrorBoundary: React.FC<{ children: React.ReactNode; onReset?: () => void }> = ({
  children,
  onReset,
}) => (
  <BaseErrorBoundary scope="route" onReset={onReset}>
    {children}
  </BaseErrorBoundary>
);
