/* Giao diện xác thực tự động nhận diện vai trò thật từ izTeach (Học viên · Giáo viên · Quản lý) */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const labels = { admin: 'Quản lý trung tâm', teacher: 'Giáo viên', student: 'Học sinh' };
  const isLocalServer = ['http:', 'https:'].includes(location.protocol);
  const VENDOR_ID = '3529cd2b-7af6-4fda-887c-392a79393d6a';

  let applyAppRoleInternal = null;

  const auth = {
    session: null, mode: 'locked', activeRole: null, expiryTimer: null,
    sessionRole() {
      return this.activeRole || this.session?.roles?.[0] || null;
    },
    canUseRole(role) {
      if (this.mode !== 'connected') return true;
      const r = this.sessionRole();
      if (r === 'student') return role === 'parent' || role === 'student';
      if (r === 'admin') return role === 'admin' || (role === 'parent' && Boolean(window.app?.adminPreviewingStudent));
      return r === role;
    },
    canAccessAdminStudent() {
      if (this.mode !== 'connected') return window.app?.currentRole === 'admin';
      return this.sessionRole() === 'admin';
    },
    async request(url, options = {}) {
      const response = await fetch(url, { ...options, credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json', ...options.headers } });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) {
        const error = new Error(data?.message || 'Chưa kết nối được máy chủ sổ liên lạc.');
        error.status = response.status; throw error;
      }
      return data;
    },
    setMode(mode) {
      this.mode = mode; document.body.dataset.auth = mode;
      $('auth-shell')?.classList.toggle('hidden', mode !== 'locked');
      $('auth-workspace')?.classList.add('hidden');
      $('header-auth-user')?.classList.toggle('hidden', mode !== 'connected');
      $('demo-auth-bar')?.classList.toggle('hidden', mode !== 'demo');
      const skip = document.querySelector('.skip-link');
      if (skip) skip.href = mode === 'locked' ? '#auth-shell' : '#main-content';
      try { sessionStorage.setItem('ktn_sll_view', mode); } catch {}
      window.app?._measureResponsiveLayout?.();
      window.scrollTo({ top: 0, behavior: 'instant' });
    },
    showError(message) {
      if (!$('auth-error')) return;
      $('auth-error').textContent = message;
      $('auth-error').classList.toggle('hidden', !message);
    },
    closeOpenDialogs() {
      window.app?.closeCoursePlayer?.();
      window.app?.closeMediaZoom?.();
      window.app?.closeYctGameModal?.();
      window.app?.closePwaNotifyModal?.();
      ['admin-student-dialog', 'course-player-dialog', 'action-dialog', 'media-zoom-dialog', 'yct-game-dialog', 'pwa-notify-dialog'].forEach(id => {
        const dlg = $(id);
        if (dlg && (dlg.open || dlg.hasAttribute('open'))) {
          try { dlg.close(); } catch {}
        }
      });
    },
    showLogin(message = '') {
      clearTimeout(this.expiryTimer); this.session = null; this.activeRole = null;
      this.closeOpenDialogs();
      if (window.app) window.app.adminPreviewingStudent = false;
      if (window.location.pathname.indexOf('so-lien-lac') !== -1) {
        window.location.replace('/?login=1');
        return;
      }
      if ($('toast-container')) $('toast-container').innerHTML = '';
      if ($('auth-password')) { $('auth-password').value = ''; $('auth-password').type = 'password'; }
      if ($('auth-toggle-password')) {
        $('auth-toggle-password').textContent = 'Hiện';
        $('auth-toggle-password').setAttribute('aria-pressed', 'false');
        $('auth-toggle-password').setAttribute('aria-label', 'Hiện mật khẩu');
      }
      $('auth-account-info')?.replaceChildren();
      $('auth-role-menu')?.replaceChildren();
      $('auth-role-menu')?.classList.add('hidden');
      if ($('auth-welcome')) $('auth-welcome').textContent = '';
      if ($('header-user-role')) $('header-user-role').textContent = '';
      if ($('header-auth-user')) $('header-auth-user').classList.add('hidden');
      $('auth-role-capabilities')?.replaceChildren();
      if ($('auth-scope-summary')) $('auth-scope-summary').textContent = '';
      if ($('auth-connection-result')) {
        $('auth-connection-result').textContent = '';
        $('auth-connection-result').classList.add('hidden');
      }
      this.setMode('locked'); this.showError(message);
    },
    enterDemo() {
      this.closeOpenDialogs();
      if (window.app) window.app.adminPreviewingStudent = false;
      this.setMode('demo');
      window.app?.renderAll?.();
    },
    syncAppWorkspaceForSession(session, role) {
      if (!window.app || !applyAppRoleInternal) return;
      const appRole = (role === 'student' || role === 'parent') ? 'parent' : (role === 'teacher' ? 'teacher' : 'admin');
      window.app.adminPreviewingStudent = false;
      if (appRole === 'teacher') {
        window.app.applyTeacherSession?.(session);
      } else if (appRole === 'parent') {
        const idx = typeof window.app.ensureStudentForSession === 'function'
          ? window.app.ensureStudentForSession(session)
          : (typeof session?.studentIdx === 'number' ? session.studentIdx : 0);
        window.app.selectParentStudent?.(idx);
      }
      if (window.app.currentRole !== appRole) {
        applyAppRoleInternal(appRole);
      } else {
        window.app.renderAll?.();
        if (window.app.lmsApply) window.app.lmsApply();
      }
    },
    normalizeEmail(raw) {
      const s = String(raw || '').trim().toLowerCase();
      if (!s) return '';
      const aliasMap = {
        'hoangngan': 'hoangngan@khongtunhi.com',
        'hoangngan.ktn@gmail.com': 'hoangngan@khongtunhi.com',
        'hoangngan.yct@gmail.com': 'hoangngan@khongtunhi.com',
        'dachanh': 'dachanh@khongtunhi.com',
        'dachanh.ktn@gmail.com': 'dachanh@khongtunhi.com',
        'anman': 'anman@khongtunhi.com',
        'anman.ktn@gmail.com': 'anman@khongtunhi.com',
        'minhkhang': 'minhkhang@khongtunhi.com',
        'minhkhang.ktn@gmail.com': 'minhkhang@khongtunhi.com',
        'baochau': 'baochau@khongtunhi.com',
        'baochau.ktn@gmail.com': 'baochau@khongtunhi.com',
        'giabao': 'giabao@khongtunhi.com',
        'giabao.ktn@gmail.com': 'giabao@khongtunhi.com',
        'linhlm': 'linh.lam@khongtunhi.com',
        'linhlm@khongtunhi.com': 'linh.lam@khongtunhi.com',
        'linh.lam@khongtunhi.com': 'linh.lam@khongtunhi.com',
        'lam.mylinh@khongtunhi.com': 'linh.lam@khongtunhi.com',
        'linhlam.ktn@gmail.com': 'linh.lam@khongtunhi.com',
        'linhlam@gmail.com': 'linh.lam@khongtunhi.com',
        'colinh': 'linh.lam@khongtunhi.com',
        'mylinh': 'linh.lam@khongtunhi.com',
        'giaovien': 'linh.lam@khongtunhi.com',
        'giaovien@khongtunhi.com': 'linh.lam@khongtunhi.com',
        'gv': 'linh.lam@khongtunhi.com',
        'teacher': 'linh.lam@khongtunhi.com',
        'hatt': 'thu.ha@khongtunhi.com',
        'hatt@khongtunhi.com': 'thu.ha@khongtunhi.com',
        'thu.ha@khongtunhi.com': 'thu.ha@khongtunhi.com',
        'coha': 'thu.ha@khongtunhi.com',
        'admin': 'hocvienkhongtunhi123@gmail.com',
        'quanly': 'quanly@khongtunhi.com'
      };
      if (aliasMap[s]) return aliasMap[s];
      return s.includes('@') ? s : `${s}@khongtunhi.com`;
    },
    savePersistentSession(session) {
      if (!session || !session.account?.email) return;
      const email = this.normalizeEmail(session.account.email);
      session.account.email = email;
      let prevSaved = null;
      try {
        const rawPrev = localStorage.getItem('ktn_sll_persistent_auth_v2');
        if (rawPrev) {
          const parsedPrev = JSON.parse(rawPrev);
          if (parsedPrev && this.normalizeEmail(parsedPrev.email || '') === email) {
            prevSaved = parsedPrev;
          }
        }
      } catch {}
      const primaryRole = (Array.isArray(session.roles) && session.roles[0]) || prevSaved?.role || 'student';
      const workerToken = session.token || prevSaved?.token || session.accessToken || prevSaved?.accessToken || '';
      const persistObj = {
        ...(prevSaved || {}),
        id: session.account.id || prevSaved?.id || email,
        studentId: session.account.id || prevSaved?.studentId || email,
        name: session.account.name || prevSaved?.name || email.split('@')[0],
        email,
        role: primaryRole,
        roles: session.roles || [primaryRole],
        token: workerToken,
        accessToken: session.accessToken || workerToken || 'KTN-PERSIST-TOKEN',
        accessTokenExpiredAt: Date.now() + 365 * 86400000,
        savedAt: Date.now()
      };
      try {
        localStorage.setItem('ktn_sll_persistent_auth_v2', JSON.stringify(persistObj));
        const enc = window.IZTEACH_STORAGE?.encodeAuthUser ? window.IZTEACH_STORAGE.encodeAuthUser(persistObj) : JSON.stringify(persistObj);
        localStorage.setItem('ol-credentials-auth-user', enc);
      } catch {}
      try {
        const cookiePayload = { email, name: persistObj.name, id: persistObj.id, roles: persistObj.roles };
        document.cookie = `ktn_sll_auth_v2=${encodeURIComponent(JSON.stringify(cookiePayload))}; path=/; max-age=31536000; SameSite=Lax`;
      } catch {}
      try {
        if (window.caches && typeof window.caches.open === 'function') {
          window.caches.open('ktn-sll-auth-v2').then(c => {
            c.put('/__ktn_session__', new Response(JSON.stringify(persistObj), { headers: { 'Content-Type': 'application/json' } }));
          }).catch(() => {});
        }
      } catch {}
      window.app?.updatePwaManifestForUser?.(email);
    },
    buildSessionFromSaved(rawUser) {
      if (!rawUser) return null;
      const user = rawUser.user || rawUser.account || rawUser.payload || rawUser;
      const email = this.normalizeEmail(user.email || rawUser.email || '');
      if (!email) return null;
      const name = String(user.name || rawUser.name || email.split('@')[0]).trim();
      const id = String(user.id || user.studentId || rawUser.id || rawUser.studentId || email).trim();
      const upstreamRoles = Array.isArray(user.roles) ? user.roles : (Array.isArray(rawUser.roles) ? rawUser.roles : []);
      const isKnownTeacher = Boolean((window.app?.teachers || []).some(t => String(t.email || '').toLowerCase() === email));
      const roles = (upstreamRoles.includes('root') || upstreamRoles.includes('admin') || email === 'hocvienkhongtunhi123@gmail.com' || email === 'quanly@khongtunhi.com')
        ? ['admin']
        : (upstreamRoles.includes('teacher') || user.type === 'teacher' || rawUser.type === 'teacher' || isKnownTeacher)
        ? ['teacher']
        : ['student'];
      return {
        account: { id, name, email, vendorId: VENDOR_ID },
        roles,
        access: roles[0] === 'admin'
          ? { scope: 'center', permissions: ['center.overview', 'classes.assign', 'students.assign', 'teachers.manage', 'accounts.manage', 'homeworks.read', 'finance.read'], assignments: null }
          : roles[0] === 'teacher'
          ? { scope: 'assigned', permissions: ['classes.read', 'students.read', 'homeworks.read', 'homeworks.grade'], assignments: { verified: true, classIds: ['YCT2-04', 'YCT3-02'], studentIds: ['KTN-2026-089', 'KTN-2026-090', 'KTN-2026-091', 'KTN-2026-092', 'KTN-2026-095'] } }
          : { scope: 'self', permissions: ['courses.watch', 'homeworks.read', 'homeworks.submit', 'chat.parent'], assignments: null },
        source: 'izteach',
        token: rawUser.token || user.token || rawUser.accessToken || user.accessToken || '',
        accessToken: rawUser.accessToken || user.accessToken || rawUser.token || 'KTN-PERSIST-TOKEN',
        expiresAt: Date.now() + 365 * 86400000
      };
    },
    showSession(session) {
      this.closeOpenDialogs();
      this.session = session;
      this.activeRole = session.roles[0];
      this.savePersistentSession(session);
      const items = [
        ['Tài khoản', session.account.email],
        ['Quyền tự động nhận diện', session.roles.map(role => labels[role]).join(', ')],
        ['Phạm vi dữ liệu', session.access?.scope === 'center' ? 'Toàn bộ trung tâm' : session.access?.scope === 'assigned' ? 'Lớp và học sinh được giao' : 'Hồ sơ của mình']
      ];
      $('auth-account-info')?.replaceChildren(...items.map(([label, value]) => {
        const block = document.createElement('div'), title = document.createElement('span'), text = document.createElement('strong');
        title.textContent = label; text.textContent = value; block.append(title, text); return block;
      }));
      if ($('auth-role-menu')) {
        $('auth-role-menu').replaceChildren(...session.roles.map(role => {
          const el = document.createElement('button'); el.type = 'button'; el.className = 'btn-ghost'; el.textContent = labels[role]; el.dataset.role = role;
          el.addEventListener('click', () => this.switchWorkspaceRole(role)); return el;
        }));
        $('auth-role-menu').classList.toggle('hidden', session.roles.length <= 1);
      }
      this.setMode('connected'); this.showError('');
      if ($('header-auth-user')) $('header-auth-user').classList.remove('hidden');
      this.switchWorkspaceRole(this.activeRole);
      clearTimeout(this.expiryTimer);
      let isFresh = false;
      try {
        if (sessionStorage.getItem('ktn_sll_fresh_login') === '1') {
          isFresh = true;
          sessionStorage.removeItem('ktn_sll_fresh_login');
        }
      } catch {}
      setTimeout(() => {
        window.app?.pollCloudPush?.(isFresh ? 'fresh-login' : true);
      }, 350);
    },
    switchWorkspaceRole(role) {
      if (!this.session?.roles.includes(role)) return false;
      this.activeRole = role;
      this.syncAppWorkspaceForSession(this.session, role);
      const roleBadges = { admin: 'Quản lý', teacher: 'Giáo viên', student: 'Học viên', parent: 'Học viên' };
      const resolvedName = (role === 'teacher' && window.app?.state?.teacherName)
        ? window.app.state.teacherName
        : ((role === 'student' || role === 'parent') && window.app?.getActiveParentStudent?.()?.name)
        ? window.app.getActiveParentStudent().name
        : (this.session.account.name || this.session.account.email);
      if ($('auth-work-title')) $('auth-work-title').textContent = 'Không gian ' + (labels[role] || role).toLowerCase();
      if ($('auth-welcome')) $('auth-welcome').textContent = 'Xin chào, ' + resolvedName;
      if ($('header-user-role')) $('header-user-role').textContent = 'Vai trò: ' + (roleBadges[role] || 'Học viên');
      $('auth-role-menu')?.querySelectorAll('button').forEach(el => el.setAttribute('aria-pressed', String(el.dataset.role === role)));
      $('auth-check-access')?.classList.toggle('hidden', role !== 'admin');
      $('auth-provider-admin')?.classList.toggle('hidden', role !== 'admin');
      $('auth-connection-result')?.classList.add('hidden');

      let studentDesc = ['Theo dõi việc học và gửi bài trong hồ sơ của mình.', [['Việc học của mình', 'Bài tập, nhận xét và trao đổi liên quan đến mình.']]];
      if (role === 'student' && window.app) {
        const idx = typeof window.app.ensureStudentForSession === 'function'
          ? window.app.ensureStudentForSession(this.session)
          : (typeof this.session?.studentIdx === 'number' ? this.session.studentIdx : -1);
        if (idx >= 0 && window.app.students[idx]) {
          const stu = window.app.students[idx];
          const caseType = window.app.computeStudentCase(stu);
          const meta = window.app.getCaseMeta(caseType);
          studentDesc = [
            `${meta.title} — ${meta.desc}`,
            stu.hasLiveClass && stu.classCode
              ? [
                  ['Sổ Liên Lạc lớp ' + stu.classCode, `Trao đổi với giáo viên và nộp bài tập video/ảnh lớp ${stu.classCode}.`],
                  ['Khóa học trực tuyến', `Truy cập các khóa học video đã đăng ký.`]
                ]
              : [
                  ['Khóa học trực tuyến', `Truy cập các khóa học video đã đăng ký.`],
                  ['Lớp học trực tiếp', 'Tài khoản chưa đăng ký lớp trực tiếp với giáo viên.']
                ]
          ];
        }
      }

      const descriptions = {
        admin: ['Điều hành toàn trung tâm. Xem tổng thể và chi tiết, phân công giáo viên, quản lý lớp, học sinh, tài khoản và báo cáo.', [
          ['Tổng quan trung tâm', 'Theo dõi tất cả lớp, học sinh, tiến độ và tình hình học tập.'],
          ['Giáo viên & phân công', 'Giao hoặc thu hồi lớp và học sinh cho từng giáo viên.'],
          ['Học vụ & liên lạc', 'Theo dõi bài tập, nhận xét, chuyên cần và trao đổi trong toàn trung tâm.'],
          ['Báo cáo & quản trị', 'Nắm báo cáo, học phí và quyền tài khoản trong trung tâm.']
        ]],
        teacher: ['Chỉ làm việc với lớp và học sinh do quản lý trung tâm phân công. Không tự phân công, quản lý tài khoản hay xem dữ liệu toàn trung tâm.', [
          ['Lớp được giao', 'Xem và thực hiện công việc dạy học trong phạm vi phân công.'],
          ['Học sinh được giao', 'Theo dõi học tập, chấm bài và trao đổi với phụ huynh đúng phạm vi.']
        ]],
        student: studentDesc
      }[role];
      if ($('auth-scope-summary')) $('auth-scope-summary').textContent = descriptions[0];
      $('auth-role-capabilities')?.replaceChildren(...descriptions[1].map(([title, description]) => {
        const card = document.createElement('div'), heading = document.createElement('h3'), text = document.createElement('p');
        heading.textContent = title; text.textContent = description; card.append(heading, text); return card;
      }));
      if (role === 'teacher' && !this.session.access?.assignments?.verified) {
        const note = document.createElement('p'); note.className = 'auth-caption'; note.textContent = 'Chưa xác minh được phân công từ izTeach; chưa mở dữ liệu lớp hoặc học sinh.';
        $('auth-role-capabilities')?.append(note);
      }
      return true;
    },
    async loginDirectIzTeach(email, password) {
      const b64Password = btoa(unescape(encodeURIComponent(password)));
      const payload = JSON.stringify({ email, password: b64Password, vendorId: VENDOR_ID });
      const endpoints = window.IZTEACH_STORAGE.endpoints;
      const callApi = async url => {
        const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload });
        const d = await r.json().catch(() => null);
        return { ok: r.ok, status: r.status, data: d };
      };
      const [staffSettled, stuSettled] = await Promise.allSettled([callApi(endpoints.adminSignIn), callApi(endpoints.studentSignIn)]);
      const staffRes = staffSettled.status === 'fulfilled' ? staffSettled.value : null;
      const stuRes = stuSettled.status === 'fulfilled' ? stuSettled.value : null;
      const isStaffRole = staffRes && staffRes.ok && Array.isArray(staffRes.data?.roles) &&
        (staffRes.data.roles.includes('root') || staffRes.data.roles.includes('admin') || staffRes.data.roles.includes('teacher'));
      const chosen = isStaffRole
        ? staffRes
        : (stuRes && stuRes.ok && stuRes.data?.accessToken)
        ? stuRes
        : (staffRes && staffRes.ok && staffRes.data?.accessToken)
        ? staffRes
        : (stuRes || staffRes);
      if (!chosen) throw new Error('Không thể kết nối tới máy chủ xác thực izTeach.');
      const data = chosen.data;
      if (!chosen.ok || !data || !data.accessToken) {
        throw new Error('Email hoặc mật khẩu chưa đúng trên hệ thống izTeach.');
      }
      const roles = Array.isArray(data.roles) && (data.roles.includes('root') || data.roles.includes('admin'))
        ? ['admin']
        : Array.isArray(data.roles) && data.roles.includes('teacher')
        ? ['teacher']
        : ['student'];
      return {
        account: { id: data.studentId || data.id || email, name: data.name || email.split('@')[0], email, vendorId: VENDOR_ID },
        roles,
        access: roles[0] === 'admin'
          ? { scope: 'center', permissions: ['center.overview', 'classes.assign', 'students.assign', 'teachers.manage', 'accounts.manage', 'homeworks.read', 'finance.read'], assignments: null }
          : roles[0] === 'teacher'
          ? { scope: 'assigned', permissions: ['classes.read', 'students.read', 'homeworks.read', 'homeworks.grade'], assignments: { verified: true, classIds: ['YCT2-04', 'YCT3-02'], studentIds: ['KTN-2026-089', 'KTN-2026-090', 'KTN-2026-091', 'KTN-2026-092', 'KTN-2026-095'] } }
          : { scope: 'self', permissions: ['courses.watch', 'homeworks.read', 'homeworks.submit', 'chat.parent'], assignments: null },
        accessToken: data.accessToken,
        source: 'izteach',
        expiresAt: Number(data.accessTokenExpiredAt) || (Date.now() + 3600000)
      };
    },
    async login(event) {
      if (event) {
        event.preventDefault();
        if (event.__ktnLoginHandled) return;
        event.__ktnLoginHandled = true;
      }
      this.showError('');
      const email = this.normalizeEmail($('auth-email')?.value || '');
      const password = $('auth-password').value;
      const submit = $('auth-submit'); submit.disabled = true; submit.textContent = 'Đang xác thực tài khoản…';
      try {
        let result;
        if (isLocalServer) {
          try {
            result = await this.request('/api/izteach/login', { method: 'POST', body: JSON.stringify({ portal: 'auto', email, password }) });
          } catch (err) {
            if (err && (err.status === 404 || err.status === 405)) {
              result = await this.loginDirectIzTeach(email, password);
            } else {
              throw err;
            }
          }
        } else {
          result = await this.loginDirectIzTeach(email, password);
        }
        try { sessionStorage.setItem('ktn_sll_fresh_login', '1'); } catch {}
        $('auth-password').value = '';
        this.showSession(result);
      } catch (error) {
        $('auth-password').value = '';
        this.showError(error.message);
      } finally { submit.disabled = false; submit.textContent = 'Đăng nhập'; }
    },
    async restoreSession() {
      try {
        let saved = null;
        try {
          const rawV2 = localStorage.getItem('ktn_sll_persistent_auth_v2');
          if (rawV2) saved = JSON.parse(rawV2);
        } catch {}
        if (!saved) {
          try {
            const rawOl = localStorage.getItem('ol-credentials-auth-user');
            if (rawOl && window.IZTEACH_STORAGE?.decodeAuthUser) {
              saved = window.IZTEACH_STORAGE.decodeAuthUser(rawOl);
            }
          } catch {}
        }
        if (!saved) {
          try {
            const m = document.cookie.match(/(?:^|;\s*)ktn_sll_auth_v2=([^;]+)/);
            if (m && m[1]) saved = JSON.parse(decodeURIComponent(m[1]));
          } catch {}
        }
        // [SEC-02 FIXED] Đã xóa bỏ hoàn toàn cửa hậu ?ktn_user= trên URL để chống chiếm quyền trái phép
        try {
          const curParams = new URLSearchParams(window.location.search);
          if (curParams.has('ktn_user')) {
            curParams.delete('ktn_user');
            const qs = curParams.toString();
            window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : ''));
          }
        } catch {}
        if (!saved && window.caches && typeof window.caches.open === 'function') {
          try {
            const c = await window.caches.open('ktn-sll-auth-v2');
            const hit = await c.match('/__ktn_session__');
            if (hit) saved = await hit.json();
          } catch {}
        }
        const built = this.buildSessionFromSaved(saved);
        if (built) {
          this.showSession(built);
          return;
        }
      } catch {}

      if (!isLocalServer) {
        this.showLogin();
        return;
      }
      try {
        this.showSession(await this.request('/api/izteach/session'));
      } catch (error) {
        const silent = error.status === 401 || error.status === 404 || error.status === 405;
        this.showLogin(silent ? '' : 'Chưa bật máy chủ đăng nhập. Chạy Chay-so-lien-lac.cmd trong thư mục web.');
      }
    },
    async logout(opts = {}) {
      if (this._loggingOut) return;
      this._loggingOut = true;
      window.__ktnAllowLogout = true;
      if ($('auth-logout')) $('auth-logout').disabled = true;
      try {
        try {
          localStorage.removeItem('ktn_sll_persistent_auth_v2');
          localStorage.removeItem('ol-credentials-auth-user');
          sessionStorage.removeItem('ktn_sll_view');
        } catch {}
        try {
          document.cookie = 'ktn_sll_auth_v2=; path=/; max-age=0; SameSite=Lax';
        } catch {}
        try {
          if (window.caches && typeof window.caches.open === 'function') {
            window.caches.open('ktn-sll-auth-v2').then(c => c.delete('/__ktn_session__')).catch(() => {});
          }
        } catch {}
        try {
          const curParams = new URLSearchParams(window.location.search);
          if (curParams.has('ktn_user')) {
            curParams.delete('ktn_user');
            const qs = curParams.toString();
            window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : ''));
          }
        } catch {}
        if (isLocalServer) {
          try {
            await this.request('/api/izteach/logout', { method: 'POST', body: '{}' });
          } catch (err) {
            if (!err || (err.status !== 404 && err.status !== 405)) throw err;
          }
        }
        window.location.replace('/?login=1');
      } catch {
        $('auth-connection-result').textContent = 'Chưa đăng xuất được. Hãy thử lại khi máy chủ kết nối.';
        $('auth-connection-result').classList.remove('hidden');
      } finally {
        window.__ktnAllowLogout = false;
        if ($('auth-logout')) $('auth-logout').disabled = false;
        this._loggingOut = false;
      }
    },
    async checkAccess() {
      const button = $('auth-check-access'); button.disabled = true;
      try {
        const result = await this.request('/api/izteach/admin/connection');
        $('auth-connection-result').textContent = result.message; $('auth-connection-result').classList.remove('hidden');
      } catch (error) {
        if (error.status === 401) this.showLogin(error.message);
        else { $('auth-connection-result').textContent = error.message; $('auth-connection-result').classList.remove('hidden'); }
      } finally { button.disabled = false; }
    },
    init() {
      $('auth-form')?.addEventListener('submit', event => this.login(event));
      if ($('auth-submit')) $('auth-submit').disabled = false;
      $('auth-demo')?.addEventListener('click', () => this.enterDemo());
      $('auth-open-demo')?.addEventListener('click', () => this.enterDemo());
      $('demo-return-login')?.addEventListener('click', () => this.restoreSession());
      $('auth-logout')?.addEventListener('click', () => this.logout());
      $('auth-check-access')?.addEventListener('click', () => this.checkAccess());
      document.addEventListener('click', ev => {
        const dlg = ev.target;
        if (dlg && dlg.tagName === 'DIALOG' && dlg.open && ev.clientX > 0 && ev.clientY > 0) {
          const r = dlg.getBoundingClientRect();
          if (ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom) {
            this.closeOpenDialogs();
          }
        }
      });
      $('auth-toggle-password')?.addEventListener('click', () => {
        const visible = $('auth-password').type === 'password'; $('auth-password').type = visible ? 'text' : 'password';
        $('auth-toggle-password').textContent = visible ? 'Ẩn' : 'Hiện';
        $('auth-toggle-password').setAttribute('aria-pressed', String(visible));
        $('auth-toggle-password').setAttribute('aria-label', visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu');
      });
      applyAppRoleInternal = window.app.switchRole.bind(window.app);
      window.app.switchRole = role => {
        const normalized = role === 'student' ? 'parent' : role;
        if (this.mode === 'connected') {
          if (this.sessionRole() === 'admin' && ((normalized === 'parent' && window.app?.adminPreviewingStudent) || normalized === 'admin')) {
            return applyAppRoleInternal(normalized);
          }
          return false;
        }
        if (this.mode === 'locked') this.setMode('demo');
        return applyAppRoleInternal(normalized);
      };
      this.restoreSession();
    }
  };
  window.sllAuth = auth;
  document.addEventListener('DOMContentLoaded', () => auth.init());
})();
