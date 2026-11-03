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
    return new Promise((resolve, reject) => {
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
      } catch {
        resolve(null);
      }
    });
  }

  async function saveSessionToIdb(session) {
    const db = await openSessionIdb();
    if (!db) return false;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(session, 'active_session');
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  }

  async function readSessionFromIdb() {
    const db = await openSessionIdb();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const req = tx.objectStore(IDB_STORE).get('active_session');
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  async function clearSessionFromIdb() {
    const db = await openSessionIdb();
    if (!db) return;
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete('active_session');
    } catch {}
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
    getApiBase() {
      return window.KTN_WORKER_API_BASE || '';
    },

    getRolePageUrl,
    detectUserRole,

    async saveSession(session, signedToken) {
      if (!session) return;
      const role = detectUserRole(session);
      const record = {
        ...session,
        role,
        roles: [role],
        token: signedToken || session.token || session.accessToken || '',
        savedAt: Date.now()
      };
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
      try {
        const raw = localStorage.getItem(SESSION_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.email) return parsed;
        }
      } catch {}

      const idbSession = await readSessionFromIdb();
      if (idbSession && idbSession.email) {
        try { localStorage.setItem(SESSION_KEY, JSON.stringify(idbSession)); } catch {}
        return idbSession;
      }

      try {
        const m = document.cookie.match(/(?:^|;\s*)ktn_sll_auth_v2=([^;]+)/);
        if (m && m[1]) {
          const cookieUser = JSON.parse(decodeURIComponent(m[1]));
          if (cookieUser && cookieUser.email) return cookieUser;
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
        if (hashToKeep && hashToKeep.length > 1) {
          localStorage.setItem('ktn_pending_target_hash', hashToKeep);
        }
      } catch {}
      await this.logout({ preservePendingHash: true });
    },

    async logout(opts = {}) {
      window.__ktnAllowLogout = true;
      try {
        localStorage.removeItem(SESSION_KEY);
        localStorage.removeItem('ol-credentials-auth-user');
        if (!opts || !opts.preservePendingHash) {
          localStorage.removeItem('ktn_pending_target_hash');
        }
        sessionStorage.removeItem('ktn_sll_view');
      } catch {}
      try {
        document.cookie = 'ktn_sll_auth_v2=; path=/; max-age=0; SameSite=Lax';
      } catch {}
      await clearSessionFromIdb();
      try {
        await fetch(this.getApiBase() + '/api/ktn/auth/logout', { method: 'POST' });
      } catch {}
      window.__ktnAllowLogout = false;
      window.location.replace('/?login=1');
    },

    async apiRequest(path, options = {}) {
      const session = await this.getSavedSession();
      const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      };
      if (session?.token) {
        headers['Authorization'] = `Bearer ${session.token}`;
      }
      const res = await fetch(this.getApiBase() + path, {
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

  stripForbiddenUrlParams();
  window.KtnWebApp = KtnWebApp;
})(window);
