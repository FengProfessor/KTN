import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { tryAutoReloadOnChunkError } from './lib/lazyWithRetry';
import './styles/globals.css';

const mountedRootsMap = new WeakMap<Element, ReactDOM.Root>();
let mountedContainer: HTMLElement | null = null;

function ensureKtnMounted(): boolean {
  const mountNode =
    document.getElementById('ktn-react-v2-root') || document.getElementById('root');
  if (!mountNode) return false;
  const existingRoot = mountedRootsMap.get(mountNode);
  if (mountedContainer === mountNode && mountNode.childElementCount > 0 && existingRoot) {
    return true;
  }
  mountedContainer = mountNode;
  const root = existingRoot || ReactDOM.createRoot(mountNode);
  mountedRootsMap.set(mountNode, root);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
  return true;
}

ensureKtnMounted();

if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault();
    tryAutoReloadOnChunkError();
  });
  (window as unknown as Record<string, unknown>).__mountKtnReactV2 = ensureKtnMounted;
  if (typeof MutationObserver !== 'undefined') {
    const currentMount =
      document.getElementById('ktn-react-v2-root') || document.getElementById('root');
    const observeTarget = currentMount?.parentElement || document.body;
    if (observeTarget) {
      const observer = new MutationObserver(() => {
        const node = document.getElementById('ktn-react-v2-root');
        if (node && (node !== mountedContainer || node.childElementCount === 0)) {
          ensureKtnMounted();
        }
      });
      observer.observe(observeTarget, { childList: true, subtree: false });
    }
  }
}

