import React, { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { ToastViewport } from '@/components/ui/ToastViewport';

declare global {
  interface Window {
    __KTN_EMBED_MODE__?: boolean;
  }
}

export function shouldUseHashRouter(): boolean {
  if (import.meta.env.VITE_ROUTER_MODE === 'hash') return true;
  if (typeof window !== 'undefined') {
    if (window.__KTN_EMBED_MODE__ === true) return true;
    if (window.location.pathname.includes('/custom-page/')) return true;
    if (window.location.hash.startsWith('#/')) return true;
    try {
      if (new URLSearchParams(window.location.search).get('router') === 'hash') return true;
    } catch {
      // ignore URLSearchParams error
    }
    if (document.querySelector('[data-ktn-router="hash"]')) {
      return true;
    }
    if (document.getElementById('ktn-react-v2-root') && !document.getElementById('root')) {
      return true;
    }
  }
  return false;
}

export const AppProviders: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      })
  );

  const [useHash] = useState(() => shouldUseHashRouter());
  const RouterComponent = useHash ? HashRouter : BrowserRouter;

  return (
    <QueryClientProvider client={queryClient}>
      <RouterComponent>
        {children}
        <ToastViewport />
      </RouterComponent>
    </QueryClientProvider>
  );
};

