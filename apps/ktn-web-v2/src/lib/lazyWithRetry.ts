import React, { lazy, type ComponentType, type LazyExoticComponent } from 'react';

const CHUNK_RELOAD_STORAGE_KEY = 'ktn_chunk_reload_ts';
const CHUNK_RELOAD_COOLDOWN_MS = 30_000;

export function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;
  const msg =
    error instanceof Error
      ? `${error.name} ${error.message}`
      : typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message?: unknown }).message || '')
      : String(error);
  return /ChunkLoadError|Loading chunk|Loading CSS chunk|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(
    msg
  );
}

export function tryAutoReloadOnChunkError(
  storageKey: string = CHUNK_RELOAD_STORAGE_KEY,
  reloadFn?: () => void
): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    const lastTs = raw ? Number(raw) : 0;
    const now = Date.now();
    if (Number.isFinite(lastTs) && lastTs > 0 && now - lastTs < CHUNK_RELOAD_COOLDOWN_MS) {
      return false;
    }
    window.sessionStorage.setItem(storageKey, String(now));
  } catch {
    // ignore storage errors in restricted WebViews
  }
  try {
    if (reloadFn) {
      reloadFn();
    } else if (typeof window.location?.reload === 'function') {
      window.location.reload();
    }
  } catch {
    // ignore reload failures in non-navigation environments
  }
  return true;
}

export function lazyWithRetry<T extends ComponentType<any>>(
  importer: () => Promise<{ default: T }>
): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      return await importer();
    } catch (firstErr) {
      if (isChunkLoadError(firstErr)) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        try {
          return await importer();
        } catch (retryErr) {
          tryAutoReloadOnChunkError();
          throw retryErr;
        }
      }
      throw firstErr;
    }
  });
}
