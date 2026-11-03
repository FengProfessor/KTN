/**
 * ============================================================================
 * KHỔNG TỬ NHÍ — LÕI KẾT NỐI WEB APP (CLOUDFLARE + SUPABASE + PWA PUSH)
 * ============================================================================
 * Phục vụ:
 * - Popup Đăng nhập trên Trang chủ (index.html) -> Tự chia về 3 trang con độc lập:
 *   1. Học sinh  -> /sll-hocsinh.html
 *   2. Giáo viên -> /sll-teacher.html
 *   3. Quản lý   -> /sll-admin.html
 * - Lưu phiên làm việc bền vững 365 ngày trong IndexedDB (không bị script ngoài xóa).
 * - Hệ thống chuông Thông báo đẩy PWA (/sw.js -> ktn_push_subscriptions).
 */
(function (window) {
  'use strict';

  const IDB_NAME = 'ktn_webapp_auth_db';
  const IDB_STORE = 'session_store';
  const SESSION_KEY = 'ktn_sll_persistent_auth_v2';
  const VAPID_PUBLIC_KEY = 'BFWxJ4T_sakVqTfRjAQOpN7RghDoQRo9owPWy_W1lvdoVYpqFdLJRmEOYgQEPPiEHpotoaixRt8oq2_R4VH8afM';

  function escapeHtml(val) {
    if (val === null || val === undefined) return '';
    return String(val)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function safeUrl(url) {
    if (!url) return '';
    const s = String(url).trim();
    if (/^(https?:\/\/|\/|blob:|data:audio\/|data:image\/)/i.test(s)) {
      return escapeHtml(s);
    }
    return '';
  }

  function stripForbiddenUrlParams() {
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has('ktn_user')) {
        url.searchParams.delete('ktn_user');
        window.history.replaceState(null, '', url.pathname + (url.search || '') + (url.hash || ''));
      }
    } catch {}
  }

  function openSessionIdb() {
    return new Promise((resolve) => {
      if (!window.indexedDB) return resolve(null);
      try {
        const req = window.indexedDB.open(IDB_NAME, 1);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(IDB_STORE)) {
            db.createObjectStore(IDB_STORE);
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  async function saveSessionToIdb(session) {
    if (window.__ktnLoggingOut) return false;
    const db = await openSessionIdb();
    if (!db) return false;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(session, 'active_session');
        tx.oncomplete = () => {
          try { db.close(); } catch {}
          resolve(true);
        };
        tx.onerror = () => {
          try { db.close(); } catch {}
          resolve(false);
        };
        tx.onabort = () => {
          try { db.close(); } catch {}
          resolve(false);
        };
      } catch {
        try { db.close(); } catch {}
        resolve(false);
      }
    });
  }

  async function readSessionFromIdb() {
    if (window.__ktnLoggingOut) return null;
    const db = await openSessionIdb();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const req = tx.objectStore(IDB_STORE).get('active_session');
        let resultVal = null;
        req.onsuccess = () => {
          resultVal = req.result || null;
        };
        tx.oncomplete = () => {
          try { db.close(); } catch {}
          resolve(window.__ktnLoggingOut ? null : resultVal);
        };
        tx.onerror = () => {
          try { db.close(); } catch {}
          resolve(null);
        };
        tx.onabort = () => {
          try { db.close(); } catch {}
          resolve(null);
        };
      } catch {
        try { db.close(); } catch {}
        resolve(null);
      }
    });
  }

  async function clearSessionFromIdb() {
    const db = await openSessionIdb();
    if (!db) return true;
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).delete('active_session');
        tx.oncomplete = () => {
          try { db.close(); } catch {}
          resolve(true);
        };
        tx.onerror = () => {
          try { db.close(); } catch {}
          reject(tx.error || new Error('Không xóa được phiên trong IndexedDB'));
        };
        tx.onabort = () => {
          try { db.close(); } catch {}
          reject(tx.error || new Error('Thao tác xóa IndexedDB bị hủy'));
        };
      } catch (err) {
        try { db.close(); } catch {}
        reject(err);
      }
    });
  }

  async function clearSessionFromCacheStorage() {
    if (!('caches' in window) || typeof window.caches.open !== 'function') return true;
    try {
      const c = await window.caches.open('ktn-sll-auth-v2');
      await c.delete('/__ktn_session__');
    } catch {}
    try {
      if (typeof window.caches.delete === 'function') {
        await window.caches.delete('ktn-sll-auth-v2');
      }
    } catch {}
    return true;
  }

  function getRolePageUrl(role) {
    if (role === 'admin') return '/sll-admin.html';
    if (role === 'teacher') return '/sll-teacher.html';
    return '/sll-hocsinh.html';
  }

  function detectUserRole(session) {
    if (!session) return null;
    if (session.role) return session.role === 'parent' ? 'student' : session.role;
    const roles = Array.isArray(session.roles) ? session.roles : [];
    if (roles.includes('admin') || roles.includes('root')) return 'admin';
    if (roles.includes('teacher')) return 'teacher';
    return 'student';
  }

  const KtnWebApp = {
    escapeHtml,
    safeUrl,

    getApiBase() {
      return window.KTN_WORKER_API_BASE || '';
    },

    getRolePageUrl,
    detectUserRole,

    async saveSession(session, signedToken) {
      if (!session || window.__ktnLoggingOut) return null;
      const role = detectUserRole(session);
      const record = {
        ...session,
        role,
        roles: [role],
        token: signedToken || session.token || session.accessToken || '',
        savedAt: Date.now()
      };
      window.__ktnActiveSessionEmail = String(record.email || '').trim().toLowerCase();
      try {
        localStorage.setItem(SESSION_KEY, JSON.stringify(record));
      } catch {}
      try {
        const mini = { email: record.email, name: record.name, id: record.id, role, roles: [role] };
        document.cookie = `ktn_sll_auth_v2=${encodeURIComponent(JSON.stringify(mini))}; path=/; max-age=31536000; SameSite=Lax`;
      } catch {}
      await saveSessionToIdb(record);
      return record;
    },

    async getSavedSession() {
      stripForbiddenUrlParams();
      if (window.__ktnLoggingOut) return null;
      try {
        const raw = localStorage.getItem(SESSION_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.email) {
            window.__ktnActiveSessionEmail = String(parsed.email || '').trim().toLowerCase();
            return parsed;
          }
        }
      } catch {}

      const idbSession = await readSessionFromIdb();
      if (window.__ktnLoggingOut) return null;
      if (idbSession && idbSession.email) {
        window.__ktnActiveSessionEmail = String(idbSession.email || '').trim().toLowerCase();
        try { localStorage.setItem(SESSION_KEY, JSON.stringify(idbSession)); } catch {}
        return idbSession;
      }

      try {
        const m = document.cookie.match(/(?:^|;\s*)ktn_sll_auth_v2=([^;]+)/);
        if (m && m[1]) {
          const cookieUser = JSON.parse(decodeURIComponent(m[1]));
          if (cookieUser && cookieUser.email) {
            window.__ktnActiveSessionEmail = String(cookieUser.email || '').trim().toLowerCase();
            return cookieUser;
          }
        }
      } catch {}

      return null;
    },

    /**
     * Bảo vệ nghiêm ngặt 3 trang con độc lập (sll-hocsinh, sll-teacher, sll-admin).
     * Ai thuộc vai trò nào chỉ được ở đúng trang của vai trò đó!
     */
    async enforceRolePage(requiredRole) {
      stripForbiddenUrlParams();
      const session = await this.getSavedSession();
      if (!session || !session.email) {
        try {
          if (window.location.hash && window.location.hash.length > 2) {
            localStorage.setItem('ktn_pending_target_hash', window.location.hash);
          }
        } catch {}
        window.location.replace('/?login=1');
        return null;
      }
      const userRole = detectUserRole(session);
      if (userRole !== requiredRole) {
        window.location.replace(getRolePageUrl(userRole));
        return null;
      }
      return session;
    },

    consumePendingTargetHash() {
      try {
        const h = localStorage.getItem('ktn_pending_target_hash') || '';
        if (h) localStorage.removeItem('ktn_pending_target_hash');
        return h;
      } catch {
        return '';
      }
    },

    async switchAccountPreservingTarget(targetHash) {
      try {
        const hashToKeep = targetHash || window.location.hash || '';
        if (hashToKeep && hashToKeep.length > 1 && hashToKeep !== '#/' && hashToKeep !== '#') {
          localStorage.setItem('ktn_pending_target_hash', hashToKeep);
        }
      } catch {}
      return await this.logout({ preservePendingHash: true });
    },

    async logout(opts = {}) {
      window.__ktnLoggingOut = true;
      window.__ktnAllowLogout = true;
      window.__ktnActiveSessionEmail = '';
      try {
        if (window.sllAuth) {
          window.sllAuth.session = null;
          window.sllAuth.activeRole = null;
          window.sllAuth.mode = 'locked';
        }
        if (window.IzTeachStore) {
          window.IzTeachStore.entitlement = null;
          window.IzTeachStore.entitlementUserId = null;
          window.IzTeachStore.homeworkMap = {};
          window.IzTeachStore.serviceToken = null;
        }
        try {
          localStorage.removeItem(SESSION_KEY);
          localStorage.removeItem('ol-credentials-auth-user');
          localStorage.removeItem('ktn_sll_view');
          localStorage.removeItem('ktn_sll_fresh_login');
          if (!opts || !opts.preservePendingHash) {
            localStorage.removeItem('ktn_pending_target_hash');
          }
          localStorage.setItem('ktn_logout_broadcast_ts', String(Date.now()));
          sessionStorage.removeItem('ktn_sll_view');
          sessionStorage.removeItem('ktn_sll_fresh_login');
        } catch {}
        try {
          document.cookie = 'ktn_sll_auth_v2=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax';
          document.cookie = 'ktn_sll_auth_v2=; domain=.khongtunhi.com; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax';
        } catch {}
        try {
          if (typeof BroadcastChannel !== 'undefined') {
            const bc = new BroadcastChannel('ktn_auth_bus');
            bc.postMessage({ type: 'LOGOUT', ts: Date.now() });
            bc.close();
          }
        } catch {}

        await clearSessionFromIdb();
        await clearSessionFromCacheStorage();

        const res = await fetch(this.getApiBase() + '/api/ktn/auth/logout', {
          method: 'POST',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' }
        });
        if (!res.ok) {
          throw new Error('Máy chủ chưa xác nhận xóa phiên đăng nhập (HTTP ' + res.status + ')');
        }

        if (!opts || opts.redirect !== false) {
          const redirectUrl = (opts && opts.redirectUrl) ? opts.redirectUrl : '/?login=1';
          window.location.replace(redirectUrl);
        }
        return { ok: true };
      } catch (err) {
        window.__ktnLoggingOut = false;
        window.__ktnAllowLogout = false;
        if (!opts || !opts.silentError) {
          window.alert('Chưa đăng xuất hoàn tất (' + (err && err.message ? err.message : 'lỗi kết nối') + '). Vui lòng bấm Đăng xuất lại.');
        }
        return { ok: false, error: err };
      }
    },

    async apiRequest(path, options = {}) {
      const session = await this.getSavedSession();
      const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      };
      const tok = session?.token || session?.accessToken || '';
      if (tok) {
        headers['Authorization'] = `Bearer ${tok}`;
      }
      const res = await fetch(this.getApiBase() + path, {
        credentials: 'same-origin',
        ...options,
        headers,
        body: options.body && typeof options.body === 'object' ? JSON.stringify(options.body) : options.body
      });
      const data = await res.json().catch(() => null);
      return { ok: res.ok, status: res.status, data };
    },

    /**
     * Hệ thống chuông Thông báo đẩy PWA (Dùng cho cả 3 trang sll-hocsinh, sll-teacher, sll-admin)
     */
    async registerPwaNotifications(notifySettings) {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        return { ok: false, reason: 'Thiết bị hoặc trình duyệt chưa hỗ trợ thông báo đẩy.' };
      }
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        return { ok: false, reason: 'Bạn cần cho phép quyền Thông báo trên điện thoại.' };
      }
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      const padding = '='.repeat((4 - (VAPID_PUBLIC_KEY.length % 4)) % 4);
      const base64 = (VAPID_PUBLIC_KEY + padding).replace(/-/g, '+').replace(/_/g, '/');
      const rawData = atob(base64);
      const appServerKey = new Uint8Array(rawData.length);
      for (let i = 0; i < rawData.length; ++i) appServerKey[i] = rawData.charCodeAt(i);

      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: appServerKey
        });
      }
      const session = await this.getSavedSession();
      await this.apiRequest('/api/ktn/push/subscribe', {
        method: 'POST',
        body: {
          email: session?.email || '',
          role: detectUserRole(session) || 'student',
          classCode: session?.classCode || null,
          subscription: sub.toJSON(),
          notifySettings
        }
      });
      return { ok: true, subscription: sub.toJSON() };
    }
  };

  function isProtectedPortalPath() {
    const p = String(window.location.pathname || '').toLowerCase();
    return p.includes('sll-hocsinh') || p.includes('sll-teacher') || p.includes('sll-admin') || p.includes('so-lien-lac');
  }

  window.addEventListener('pageshow', async (ev) => {
    if (!isProtectedPortalPath()) return;
    if (ev && ev.persisted) {
      const session = await KtnWebApp.getSavedSession();
      if (!session || !session.email) {
        window.location.replace('/?login=1');
      } else if (window.__ktnActiveSessionEmail && String(session.email).trim().toLowerCase() !== window.__ktnActiveSessionEmail) {
        window.location.reload();
      }
    }
  });

  window.addEventListener('storage', (ev) => {
    if (!ev || !isProtectedPortalPath()) return;
    if (ev.key === 'ktn_logout_broadcast_ts') {
      window.__ktnLoggingOut = true;
      window.location.replace('/?login=1');
      return;
    }
    if (ev.key === SESSION_KEY) {
      if (!ev.newValue) {
        window.__ktnLoggingOut = true;
        window.location.replace('/?login=1');
      } else {
        try {
          const next = JSON.parse(ev.newValue);
          const nextEm = String(next?.email || '').trim().toLowerCase();
          if (nextEm && window.__ktnActiveSessionEmail && nextEm !== window.__ktnActiveSessionEmail) {
            window.location.reload();
          }
        } catch {}
      }
    }
  });

  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const bc = new BroadcastChannel('ktn_auth_bus');
      bc.onmessage = (ev) => {
        if (ev && ev.data && ev.data.type === 'LOGOUT' && isProtectedPortalPath()) {
          window.__ktnLoggingOut = true;
          window.location.replace('/?login=1');
        }
      };
    }
  } catch {}

  stripForbiddenUrlParams();
  window.__ktnEscapeHtml = escapeHtml;
  window.__ktnSafeUrl = safeUrl;
  window.KtnWebApp = KtnWebApp;
})(window);
