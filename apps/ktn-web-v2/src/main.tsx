import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/globals.css';

let mountedContainer: HTMLElement | null = null;
let reactRoot: ReactDOM.Root | null = null;

function ensureKtnMounted(): boolean {
  const mountNode =
    document.getElementById('ktn-react-v2-root') || document.getElementById('root');
  if (!mountNode) return false;
  if (mountedContainer === mountNode && mountNode.childElementCount > 0 && reactRoot) {
    return true;
  }
  mountedContainer = mountNode;
  reactRoot = ReactDOM.createRoot(mountNode);
  reactRoot.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
  return true;
}

ensureKtnMounted();

if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__mountKtnReactV2 = ensureKtnMounted;
  if (typeof MutationObserver !== 'undefined' && document.body) {
    const observer = new MutationObserver(() => {
      const node = document.getElementById('ktn-react-v2-root');
      if (node && (node !== mountedContainer || node.childElementCount === 0)) {
        ensureKtnMounted();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
}

