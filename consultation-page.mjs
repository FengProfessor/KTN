// Trang tư vấn giữ cùng origin với website và API. Toàn bộ nội dung chat đi qua textContent.
function browser(staffMode, full) {
  const root = document.querySelector('#content');
  const status = document.querySelector('#status');
  const dollars = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' });
  const dates = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' });
  const fmt = value => value ? dates.format(new Date(value)) : '—';
  const channels = { web: 'Web', messenger: 'Messenger', zalo_oa: 'Zalo OA' };
  const states = { bot: 'Bot đang hỗ trợ', waiting: 'Chờ nhận', open: 'Đang tư vấn', closed: 'Đã đóng' };
  const outcomes = { registered:'Đã đăng ký', declined:'Từ chối', no_response:'Không phản hồi', other:'Khác' };
  const senders = { customer: 'Khách', advisor: 'Tư vấn viên', manager: 'Quản lý', bot: 'Bot', system: 'KTN', external: 'Fanpage' };
  const api = '/api/ktn/consultations/';
  let token = '';
  let actor;
  let advisors = [];
  let activeId = '';
  let filter = '';
  let requestId = '';
  let checkoutOrder = '';
  let rendering = false;
  const nonce = new URLSearchParams(location.hash.slice(1));
  if (nonce.get('checkout')) sessionStorage.setItem('ktn_consult_checkout', nonce.get('checkout'));
  else if (sessionStorage.getItem('ktn_consult_checkout')) nonce.set('checkout', sessionStorage.getItem('ktn_consult_checkout'));
  const consultOnly = full && Boolean(nonce.get('checkout'));
  if (consultOnly) history.replaceState(null, '', location.pathname + location.search);
  let generation = 0;

  function node(tag, text = '', attrs = {}) {
    const element = document.createElement(tag);
    element.textContent = text;
    Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, value));
    return element;
  }

  function notify(text = '') {
    status.textContent = text;
  }

  async function call(path, method = 'GET', data) {
    const headers = {};
    if (token) headers.Authorization = 'Bearer ' + token;
    if (data) headers['Content-Type'] = 'application/json';
    const response = await fetch(api + path, { method, headers, body: data ? JSON.stringify(data) : undefined, cache: 'no-store' });
    const result = await response.json();
    if (!response.ok) {
      if (response.status === 401 && staffMode) {
        sessionStorage.removeItem('ktn_consult_staff');
      }
      throw Object.assign(new Error(result.message || 'Không tải được dữ liệu.'), { status: response.status });
    }
    return result;
  }

  function button(text, fn, attributes = {}) {
    const item = node('button', text, { type: 'button', ...attributes });
    item.addEventListener('click', async () => {
      item.disabled = true;
      notify();
      try { await fn(); } catch (error) { notify(error.message); } finally { item.disabled = false; }
    });
    return item;
  }

  function input(name, type, placeholder, attrs = {}) {
    return node('input', '', { name, type, placeholder, 'aria-label': placeholder, ...attrs });
  }

  function options(values, label, name) {
    const select = node('select', '', { 'aria-label': label, name: name || label });
    for (const [key, text] of values) select.append(node('option', text, { value: key }));
    return select;
  }

  function form(submit, fields, fn) {
    const element = node('form');
    const action = node('button', submit, { type: 'submit' });
    element.append(...fields, action);
    element.addEventListener('submit', async event => {
      event.preventDefault();
      action.disabled = true;
      notify();
      try { await fn(Object.fromEntries(new FormData(element).entries()), element); }
      catch (error) { notify(error.message); }
      finally { action.disabled = false; }
    });
    return element;
  }

  function showMessages(target, messages, channel = 'web') {
    target.replaceChildren(...messages.map(message => {
      const item = node('article', '', { class: 'message ' + message.sender });
      if (message.id) item.id = 'message-' + message.id;
      const senderLabel = message.sender === 'external' ? (channel === 'zalo_oa' ? 'Zalo OA' : 'Fanpage') : senders[message.sender];
      item.append(node('small', [senderLabel, message.actor_email, fmt(message.created_at),
        message.delivery && message.delivery !== 'sent' ? (message.delivery_note || 'Đang gửi') : ''].filter(Boolean).join(' · ')),
      node('p', message.body));
      // QR có thể mở lại từ lịch sử hội thoại phía quản lý.
      const qr = message.sender === 'system' && /\nVietQR: (https:\/\/img\.vietqr\.io\/\S+)$/.exec(message.body);
      if (qr) item.append(link('Xem mã VietQR', qr[1]));
      const checkoutMatch = /(?:https?:\/\/[^\s]+)?(\/tu-van#checkout=[^\s]+)/.exec(message.body || '');
      if (checkoutMatch) {
        try {
          const parsed = new URL(checkoutMatch[0], location.origin);
          if (parsed.origin === location.origin && parsed.pathname === '/tu-van') {
            item.append(link('Mở trang thanh toán VietQR', parsed.pathname + parsed.hash));
          }
        } catch { /* Bỏ qua URL không hợp lệ. */ }
      }
      return item;
    }));
  }

  function link(text, path) {
    return node('a', text, { href: path });
  }

  function paymentBox(container, result) {
    const payment = result.payment;
    if (!payment) return;
    const qr = new URL(payment.qrUrl);
    if (qr.origin !== 'https://img.vietqr.io') return;
    const paid = result.paymentStatus === 'paid';
    container.replaceChildren(node('h2', 'Đơn ' + result.id),
      node('p', paid ? (result.accessStatus === 'approved' ? 'Đã mở khóa. Kiểm tra email để vào học.' : 'Đã nhận tiền. KTN đang mở khóa.') :
        result.paymentStatus === 'refunded' ? 'Đơn đã hoàn tiền.' : result.paymentStatus === 'cancelled' ? 'Đơn đã hủy.' : 'Chờ thanh toán'));
    if (!paid && !['refunded','cancelled'].includes(result.paymentStatus)) {
      container.append(node('img', '', { src: qr.href, alt: 'Mã VietQR', width: '230', height: '260' }),
        node('p', payment.bankName + ' · ' + payment.accountNo + ' · ' + payment.accountName),
        node('p', dollars.format(result.amount) + ' · ' + payment.transferContent));
    }
    if (result.accessStatus === 'approved') container.append(link('Đăng nhập học', '/?login=1'));
  }

  async function checkout(container) {
    const { courses, checkoutEnabled } = await call('web/catalog');
    const picker = options([['','Chọn khóa video'], ...courses.map(course => [course.id, [course.title, dollars.format(course.price), course.duration].filter(Boolean).join(' · ')])],
      'Khóa học', 'courseId');
    picker.required = true;
    picker.value = courses.some(course => course.id === nonce.get('course')) ? nonce.get('course') : '';
    const payment = node('section');
    const fields = [picker, input('name','text','Họ tên học viên',{ required:'', maxlength:120 }),
      input('email','email','Email tài khoản học',{ required:'', maxlength:254 }),
      input('phone','tel','Số điện thoại phụ huynh',{ required:'', maxlength:30 }),
      node('small','KTN dùng thông tin để ghi nhận học phí, mở khóa và gửi hướng dẫn đăng nhập.')];
    let previous = '';
    const orderStorage = 'ktn_consult_order:' + token.split('.')[1];
    const refreshPayment = async () => {
      const result = await call('web/status?id=' + checkoutOrder);
      paymentBox(payment, result);
    };
    const buy = form('Tạo mã VietQR', fields, async data => {
      const key = JSON.stringify(data);
      if (key !== previous) requestId = crypto.randomUUID();
      previous = key;
      const result = await call('web/order', 'POST', { ...data, requestId });
      checkoutOrder = result.id;
      sessionStorage.setItem(orderStorage, result.id);
      paymentBox(payment, result);
    });
    checkoutOrder = sessionStorage.getItem(orderStorage) || '';
    const details = node('details', '', consultOnly ? { open:'' } : {});
    details.append(node('summary', 'Đăng ký khóa video'), buy);
    container.append(payment);
    if (checkoutEnabled && courses.length) container.prepend(details);
    else if (consultOnly && !checkoutOrder) container.append(node('p','Thanh toán trực tuyến đang tạm ngưng. Liên hệ tư vấn viên KTN.'));
    if (checkoutOrder) await refreshPayment();
    setInterval(() => {
      if (checkoutOrder && !document.hidden) void refreshPayment().catch(() => {});
    }, 6500);
  }

  async function customer() {
    token = (consultOnly ? nonce.get('checkout') : localStorage.getItem('ktn_consult_web')) || '';
    const chat = node('section', '', { class: 'panel' });
    const registration = node('section', '', { class: 'panel' });
    const stateBadge = node('p', '', { class: 'status-badge' });
    const messages = node('div', '', { class: 'messages', 'aria-live': 'polite' });
    const quickBar = node('div', '', { class: 'quick-replies', role: 'group', 'aria-label': 'Menu tư vấn nhanh' });
    let quickSignature = '';
    let sendQuickHandler = null;
    const syncQuickBar = data => {
      if (data?.status && data.status !== 'bot') {
        quickBar.hidden = true;
        if (quickSignature !== 'hidden') {
          quickSignature = 'hidden';
          quickBar.replaceChildren();
        }
        return;
      }
      quickBar.hidden = false;
      if (!Array.isArray(data?.quickReplies)) return;
      if (!data.quickReplies.length) {
        quickBar.hidden = true;
        if (quickSignature !== 'empty') {
          quickSignature = 'empty';
          quickBar.replaceChildren();
        }
        return;
      }
      const sig = JSON.stringify(data.quickReplies);
      if (sig === quickSignature) return;
      quickSignature = sig;
      quickBar.replaceChildren(...data.quickReplies.map(item => {
        const label = item.label || item.title || '';
        const cmd = item.payload || item.id || 'MENU_ROOT';
        const next = cmd === 'MENU_FAQ' ? 'MENU_FAQ' : cmd === 'MENU_ROOT' ? 'MENU_ROOT' : null;
        return button(label, () => sendQuickHandler && sendQuickHandler(label, cmd, next), { class: 'chip', 'data-menu': cmd });
      }));
    };
    let snapshot = '';
    const begin = async () => {
      const result = await call('web/start', 'POST');
      token = result.token;
      localStorage.setItem('ktn_consult_web', token);
    };
    const refresh = async () => {
      const data = await call('web/thread');
      stateBadge.textContent = states[data.status] || '';
      syncQuickBar(data);
      const next = JSON.stringify(data.messages);
      if (next !== snapshot) {
        snapshot = next;
        showMessages(messages, data.messages, 'web');
        if (!data.messages.length) messages.append(node('p','Bạn muốn tìm khóa học nào cho con?'));
        messages.scrollTop = messages.scrollHeight;
      }
      return data;
    };
    if (!consultOnly) {
      root.replaceChildren(chat);
      const leadDetails = node('details', '', { class: 'lead-capture' });
      const phoneInput = input('phone', 'tel', 'Số điện thoại (VD: 0901234567)', { required: '', maxlength: 30 });
      const leadForm = form('Gửi thông tin liên hệ', [
        input('name', 'text', 'Họ tên phụ huynh / học viên', { maxlength: 120 }),
        phoneInput,
        options([
          ['Mầm non (4–6 tuổi)', 'Mầm non (4–6 tuổi)'],
          ['Tiểu học (7–11 tuổi)', 'Tiểu học (7–11 tuổi)'],
          ['Thiếu niên (12–17 tuổi)', 'Thiếu niên (12–17 tuổi)'],
          ['Người đi làm 1:1', 'Người đi làm 1:1']
        ], 'Đối tượng học', 'targetGroup'),
        input('goal', 'text', 'Mục tiêu học (giao tiếp, HSK/YCT, công việc...)', { maxlength: 200 }),
        input('timeslot', 'text', 'Khung giờ tiện liên hệ / học thử', { maxlength: 100 })
      ], async (data, element) => {
        const cleanedPhone = String(data.phone || '').trim().replace(/[ .-]/g, '');
        if (!/^(0|\+84)[35789]\d{8}$/.test(cleanedPhone)) {
          throw new Error('Nhập số điện thoại Việt Nam hợp lệ (10 số bắt đầu bằng 03, 05, 07, 08, 09 hoặc +84).');
        }
        const summary = ['Nhu cầu: ' + (data.targetGroup || 'Tư vấn khóa học'),
          data.name && 'Họ tên: ' + data.name,
          'SĐT: ' + cleanedPhone,
          data.goal && 'Mục tiêu: ' + data.goal,
          data.timeslot && 'Khung giờ: ' + data.timeslot].filter(Boolean).join(' · ');
        await call('web/message', 'POST', {
          body: summary,
          requestId: crypto.randomUUID(),
          menuCommand: 'MENU_NEED_PHONE',
          lead: { name: data.name || '', phone: cleanedPhone, targetGroup: data.targetGroup || '', goal: data.goal || '', timeslot: data.timeslot || '' }
        });
        element.reset();
        leadDetails.open = false;
        await refresh();
      });
      leadDetails.append(node('summary', 'Để lại nhu cầu & số điện thoại'), leadForm);
      const sendQuick = async (label, menuCommand, nextMenu) => {
        if (menuCommand === 'OPEN_ORDER_FORM') {
          const orderDetails = registration.querySelector('details');
          if (orderDetails) {
            orderDetails.open = true;
            orderDetails.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
          return;
        }
        if (nextMenu) renderQuickMenu(nextMenu);
        if (menuCommand === 'MENU_NEED_PHONE') {
          leadDetails.open = true;
          phoneInput.focus();
        }
        await call('web/message', 'POST', { body: label, requestId: crypto.randomUUID(), menuCommand });
        await refresh();
      };
      sendQuickHandler = sendQuick;
      const menuItems = {
        MENU_ROOT: [
          ['Chọn khóa học', 'MENU_FAQ', 'MENU_FAQ'],
          ['Học phí & Ưu đãi', 'MENU_FAQ', 'MENU_FAQ'],
          ['Hướng dẫn thanh toán VietQR', 'MENU_PAYMENT', null],
          ['Để lại nhu cầu & SĐT', 'MENU_NEED_PHONE', null],
          ['Gặp tư vấn viên', 'MENU_HANDOFF', null]
        ],
        MENU_FAQ: [
          ['Lộ trình trẻ em (4–15 tuổi)', 'MENU_FAQ', null],
          ['Tiếng Trung người đi làm 1:1', 'MENU_FAQ', null],
          ['Hình thức học & thiết bị', 'MENU_FAQ', null],
          ['Lịch thi HSK / YCT', 'MENU_FAQ', null],
          ['← Menu chính', 'MENU_ROOT', 'MENU_ROOT']
        ]
      };
      function renderQuickMenu(mode) {
        const entries = menuItems[mode] || menuItems.MENU_ROOT;
        quickSignature = mode;
        quickBar.hidden = false;
        quickBar.replaceChildren(...entries.map(([label, cmd, next]) =>
          button(label, () => sendQuick(label, cmd, next), { class: 'chip', 'data-menu': cmd })));
      }
      renderQuickMenu('MENU_ROOT');
      if (!token) await begin();
      try { await refresh(); } catch (error) {
        if (![401,404].includes(error.status)) throw error;
        await begin();
        await refresh();
      }
      let messageId = '';
      let lastBody = '';
      const composer = form('Gửi', [node('textarea','',{ name:'body', 'aria-label':'Nội dung tư vấn', placeholder:'Nhập câu hỏi', maxlength:4000, required:'' })], async (data, element) => {
        if (lastBody !== data.body || !messageId) messageId = crypto.randomUUID();
        lastBody = data.body;
        await call('web/message','POST',{ body:data.body, requestId:messageId });
        element.reset();
        messageId = '';
        await refresh();
      });
      chat.append(stateBadge, messages, quickBar, leadDetails, composer);
      setInterval(() => { if (!document.hidden) void refresh().catch(() => {}); }, 4500);
      root.append(registration);
    } else {
      root.replaceChildren(registration);
    }
    if (consultOnly) {
      const exit = button('Bắt đầu tư vấn trên web',async () => {
        sessionStorage.removeItem('ktn_consult_checkout');
        location.reload();
      });
      root.append(exit);
    }
    if (full) await checkout(registration);
  }

  function staffLogin() {
    root.replaceChildren(form('Đăng nhập', [input('email','email','Email tư vấn viên',{ required:'', autocomplete:'username' }),
      input('password','password','Mật khẩu',{ required:'', autocomplete:'current-password' })], async credentials => {
      const result = await call('staff/login','POST',credentials);
      token = result.token;
      actor = result.actor;
      sessionStorage.setItem('ktn_consult_staff', token);
      await staffWorkspace();
    }), link('Quản lý đăng nhập KTN', '/?login=1'));
  }

  async function staffWorkspace() {
    if (actor.admin) ({ advisors } = await call('staff/advisors'));
    const toolbar = node('nav');
    const pane = node('section');
    root.replaceChildren(toolbar, pane);
    toolbar.append(node('span', actor.name || actor.email), button('Hộp thư', async () => inbox(pane)),
      ...actor.admin ? [button('Báo cáo', async () => dashboard(pane)), button('Dữ liệu chatbot', async () => settings(pane))] : []);
    if (!actor.admin) toolbar.append(button('Đăng xuất', async () => {
      sessionStorage.removeItem('ktn_consult_staff');
      location.reload();
    }));
    await inbox(pane);
  }

  function managerOwner() {
    return options([['','Mọi người'], ['unassigned','Chưa giao'], ...advisors.map(advisor => [advisor.email, advisor.name])], 'Tư vấn viên','owner');
  }

  function channelSelect() {
    return options([['','Mọi kênh'], ...Object.entries(channels)], 'Kênh','channel');
  }

  async function inbox(pane, focusId = '') {
    const version = ++generation;
    const filters = node('div','',{ class:'controls' });
    const grid = node('div','',{ class:'workspace' });
    const list = node('section','',{ class:'panel list' });
    const detail = node('section','',{ class:'panel thread' });
    const state = options([['','Mọi trạng thái'], ['waiting','Chưa nhận'], ['unanswered','Chờ trả lời'], ['overdue','Quá hẹn'],
      ['closed','Đã đóng'], ['open','Đang tư vấn'],
      ...(full ? [['paid_pending','Đã trả tiền, chờ mở khóa'], ['bot','Bot đang hỗ trợ']] : [])], 'Trạng thái');
    state.value = filter;
    const channel = channelSelect();
    const owner = actor.admin ? managerOwner() : null;
    let offset = 0;
    let listSignature = '';
    activeId = focusId;
    pane.replaceChildren(filters, grid);
    grid.append(list, detail);
    filters.append(state, ...(full ? [channel] : []), ...(owner ? [owner] : []));
    const load = async () => {
      const params = new URLSearchParams({ status: state.value, channel: channel.value, owner: owner?.value || '', offset: String(offset) });
      const result = await call('staff/inbox?' + params);
      if (generation !== version) return;
      const next = JSON.stringify([result, activeId, offset]);
      if (next === listSignature) return;
      listSignature = next;
      list.replaceChildren(node('h2','Hội thoại'));
      if (!result.conversations.length) list.append(node('p','Chưa có hội thoại.'));
      for (const conversation of result.conversations) {
        const row = node('div','',{ class:'list-row' });
        const label = channels[conversation.channel] + ' · ' + conversation.id.slice(0,8);
        const caption = [states[conversation.status], conversation.owner_email,
          conversation.follow_up_at && 'Hẹn ' + fmt(conversation.follow_up_at)].filter(Boolean).join(' · ');
        if (!actor.admin && !conversation.owner_email) row.append(node('span',label), button('Nhận ca', async () => {
          await call('staff/thread/' + conversation.id + '/claim','POST',{});
          await select(conversation.id);
          await load();
        }));
        else row.append(button(label, async () => select(conversation.id), { 'aria-pressed': String(activeId === conversation.id) }));
        row.append(node('small',caption));
        list.append(row);
      }
      if (offset) list.append(button('Trang trước', async () => { offset -= 50; await load(); }));
      if (result.hasMore) list.append(button('Trang sau', async () => { offset += 50; await load(); }));
    };
    const select = async id => {
      activeId = id;
      if (window.matchMedia('(max-width: 690px)').matches) detail.scrollIntoView({ block:'start' });
      await showThread(detail, id, version);
      await load();
    };
    for (const field of [state,channel,owner].filter(Boolean)) field.addEventListener('change', () => {
      filter = state.value;
      offset = 0;
      void load().catch(error => notify(error.message));
    });
    filters.append(button('Làm mới', async () => {
      await load();
      if (activeId) await showThread(detail, activeId, version);
    }));
    detail.append(node('p','Chọn một cuộc tư vấn.'));
    await load();
    if (focusId) await select(focusId);
    const timer = setInterval(() => {
      if (generation !== version) { clearInterval(timer); return; }
      if (document.hidden) return;
      void load().then(() => {
        if (activeId && !rendering && !detail.contains(document.activeElement) && ![...detail.querySelectorAll('textarea')].some(item => item.value)) {
          return showThread(detail, activeId, version, false);
        }
      }).catch(() => {});
    }, 7000);
  }

  async function showThread(target, id, version, force = true, offset = 0) {
    rendering = true;
    const base = 'staff/thread/' + id;
    try {
      const result = await call(base + '?offset=' + offset);
      if (generation !== version || activeId !== id) return;
      const next = JSON.stringify(result);
      if (!force && (target.dataset.snapshot === next || target.dataset.offset !== '0')) return;
      target.dataset.snapshot = next;
      target.dataset.offset = String(offset);
      const c = result.conversation;
      const who = advisors.find(advisor => advisor.email === c.owner_email)?.name || c.owner_email || 'Chưa giao';
      const changed = async (action, data) => {
        await call(base + '/' + action, 'POST',data);
        if (generation !== version || activeId !== id) return;
        await showThread(target,id,version);
      };
      const header = node('div','',{ class:'controls' });
      header.append(node('h2',channels[c.channel] + ' · ' + id.slice(0,8)), node('small',states[c.status] + ' · ' + who));
      if (actor.admin && c.status !== 'closed') {
        const picker = options([['','Để hàng chờ'], ...advisors.filter(advisor => advisor.active).map(advisor => [advisor.email,advisor.name])], 'Giao cho','email');
        picker.value = c.owner_email || '';
        header.append(form('Giao ca',[picker],data => changed('assign',data)));
      }
      const messages = node('div','',{ class:'messages' });
      showMessages(messages,result.messages,c.channel);
      target.replaceChildren(header);
      if (result.hasEarlier) target.append(button('Tin cũ hơn', async () => showThread(target,id,version,true,offset+50)));
      if (offset) target.append(button('Tin mới hơn', async () => showThread(target,id,version,true,offset-50)));
      target.append(messages);
      if (!offset) messages.scrollTop = messages.scrollHeight;
      if (c.status === 'closed') target.append(button('Mở lại',async () => changed('reopen',{})));
      else {
        if (c.status !== 'bot') {
          let replyId = '';
          let last = '';
          target.append(form('Gửi trả lời',[node('textarea','',{ name:'body', 'aria-label':'Tin trả lời', placeholder:'Trả lời khách', maxlength:1900, required:'' })], data => {
            if (last !== data.body || !replyId) replyId = crypto.randomUUID();
            last = data.body;
            return changed('reply',{ ...data, request_id:replyId });
          }));
        }
        const tools = node('details');
        const at = input('at','datetime-local','Lịch hẹn giờ Việt Nam');
        if (c.follow_up_at) at.value = new Date(Date.parse(c.follow_up_at) + 7 * 3600000).toISOString().slice(0,16);
        const outcome = options([['','Chọn kết quả'],...Object.entries(outcomes)], 'Kết quả','outcome');
        outcome.required = true;
        tools.append(node('summary','Ghi chú, hẹn lại và đóng ca'),
          form('Lưu ghi chú',[node('textarea','',{ name:'body', 'aria-label':'Ghi chú nội bộ', placeholder:'Ghi chú nội bộ', required:'', maxlength:1900 })],data => changed('note',data)),
          form('Lưu lịch hẹn',[at],data => changed('follow_up',{ at:data.at ? data.at + ':00+07:00' : null })),
          form('Đóng ca',[outcome],data => changed('close',data)));
        target.append(tools);
        if (full) target.append(button('Tạo link đăng ký', async () => {
          const result = await call(base + '/checkout_link','POST',{});
          const box = input('url','url','Link đăng ký',{ readonly:'', value:result.url });
          target.append(box);
          box.select();
          notify('Sao chép link để gửi cho khách.');
        }));
      }
      const history = node('details');
      const names = { assigned:'Phân công',note:'Ghi chú',follow_up:'Lịch hẹn',close:'Đóng ca',reopen:'Mở lại',order:'Tạo đơn',review:'Duyệt chất lượng',queued:'Vào hàng chờ',payment_retry:'Thử lại thanh toán' };
      history.append(node('summary','Lịch sử xử lý'));
      for (const event of result.events) {
        const info = event.detail || {};
        const data = info.body || (info.at ? fmt(info.at) : '') || info.order_id || info.outcome ||
          (event.kind === 'assigned' ? (info.from || 'Hàng chờ') + ' → ' + (info.to || 'Hàng chờ') : '') || info.decision || '';
        history.append(node('p',[fmt(event.created_at),event.actor_email,names[event.kind] || event.kind,data].filter(Boolean).join(' · ')));
      }
      target.append(history);
      if (result.orders.length) target.append(node('h3','Đơn hàng'));
      for (const item of result.orders) {
        const order = item.ktn_orders;
        const block = node('article','',{ class:'record' });
        const paid = order.payment_status === 'paid';
        if (actor.admin) {
          block.append(link(item.order_id,'/custom-page/so-lien-lac-test#/admin/orders?orderId=' + item.order_id));
        } else {
          block.append(node('strong',item.order_id));
        }
        block.append(node('p',order.course_name + ' · ' + dollars.format(order.amount) + ' · ' +
          (paid ? (order.approval_status === 'approved' ? 'Đã mở khóa' : 'Đã nhận tiền, chờ mở khóa') : 'Chưa xác nhận tiền')));
        const transactionLabels = { mismatch:'Lệch số tiền', duplicate:'Nhận thêm giao dịch, cần đối soát',
          accepted:'Đã nhận tiền', done:'Đã mở khóa và gửi email', needs_review:'Cần kiểm tra' };
        for (const payment of order.ktn_consultation_payments || []) {
          block.append(node('small',[dollars.format(payment.amount),transactionLabels[payment.status],payment.error].filter(Boolean).join(' · ')));
          if (actor.admin && paid && payment.status === 'needs_review') block.append(button('Thử lại mở khóa',async () =>
            changed('retry_payment',{ order_id:item.order_id, transaction_id:payment.transaction_id })));
        }
        target.append(block);
      }
      if (result.flags.length) target.append(node('h3','Kiểm tra chất lượng'));
      for (const flag of result.flags) {
        const block = node('article','',{ class:'record' });
        const labels = { price:'Học phí',promotion:'Ưu đãi',fit:'Nhu cầu' };
        const decisions = { pending:'Chờ duyệt',confirmed:'Đã xác nhận',dismissed:'Đã bỏ cờ' };
        block.append(node('strong',labels[flag.category] + ' · ' + decisions[flag.status]), node('blockquote',flag.excerpt),
          node('p',flag.reason), node('small',[flag.reviewed_by,flag.review_note].filter(Boolean).join(' · ')));
        if (flag.status === 'pending') {
          const note = input('note','text','Góp ý cho tư vấn viên',{ maxlength:2000 });
          block.append(note, ...[['confirmed','Xác nhận'],['dismissed','Bỏ cờ']].map(([status,label]) =>
            button(label,async () => changed('review',{ message_id:flag.message_id,status,note:note.value }))));
        }
        target.append(block);
      }
    } finally {
      rendering = false;
    }
  }

  async function dashboard(pane) {
    const version = ++generation;
    const from = input('from','date','Từ ngày');
    const to = input('to','date','Đến ngày');
    const owner = managerOwner();
    const channel = channelSelect();
    const results = node('section');
    const search = form('Xem báo cáo',[from,to,owner,...(full ? [channel] : [])],render);
    pane.replaceChildren(search,results);
    function group(label, collection, labelFor, idFor) {
      const block = node('details','',{ class:'panel' });
      block.append(node('summary',label));
      for (const item of collection) block.append(button(labelFor(item),async () => inbox(pane,idFor(item))));
      return block;
    }
    function cell(value) {
      const text = String(value ?? '');
      return '"' + (/^[=+\-@\t\r]/.test(text) ? "'" : '') + text.replace(/"/g,'""') + '"';
    }
    async function render(params = {}) {
      const data = await call('staff/report?' + new URLSearchParams(params));
      if (generation !== version) return;
      from.value = data.start;
      to.value = data.end;
      const needReply = data.conversations.filter(item => ['waiting','open'].includes(item.status) && item.reply_pending);
      const closed = data.conversations.filter(item => item.status === 'closed');
      const matchLabel = item => channels[item.channel] + ' · ' + item.id.slice(0,8);
      results.replaceChildren(node('p','Bình quân phản hồi đầu tiên của người thật: ' + (data.responseMinutes === null ? '—' : data.responseMinutes + ' phút')),
        group('Cuộc tư vấn mới (' + data.conversations.length + ')',data.conversations,matchLabel,item => item.id),
        group('Đang chờ trả lời (' + needReply.length + ')',needReply,matchLabel,item => item.id),
        group('Đã đóng (' + closed.length + ')',closed,
          item => matchLabel(item) + (outcomes[item.outcome] ? ' · ' + outcomes[item.outcome] : ''),item => item.id),
        group('Cuộc giao cho nhân viên (' + data.assigned.length + ')',data.assigned,
          item => item.consultation_id.slice(0,8) + ' · ' + item.owner_email,item => item.consultation_id),
        group('Cuộc quá hẹn (' + data.overdue.length + ')',data.overdue,
          item => item.id.slice(0,8) + ' · ' + fmt(item.follow_up_at),item => item.id),
        ...(full ? [
          group('Lỗi đã xác nhận (' + data.flags.length + ')',data.flags,
            item => item.consultation_id.slice(0,8),item => item.consultation_id),
          group('Đơn đã trả tiền (' + data.paid.length + ') · ' + dollars.format(data.revenue),data.paid,
            item => item.order_id + ' · ' + dollars.format(item.amount),item => item.consultation_id)
        ] : []),
        button('Xuất CSV',async () => {
          const table = [['Loại','Mã hội thoại','Nhân viên','Kênh','Thời điểm','Chi tiết',...(full ? ['Học phí'] : [])],
            ...data.conversations.map(item => ['Tư vấn',item.id,item.owner_email,item.channel,item.created_at,
              [states[item.status],outcomes[item.outcome]].filter(Boolean).join(' · '),'']),
            ...data.assigned.map(item => ['Giao ca',item.consultation_id,item.owner_email,item.channel,item.assigned_at,'','']),
            ...data.overdue.map(item => ['Quá hẹn',item.id,item.owner_email,item.channel,item.follow_up_at,'','']),
            ...data.flags.map(item => ['Lỗi xác nhận',item.consultation_id,item.ktn_consultation_messages?.actor_email,item.ktn_consultations?.channel,item.reviewed_at,item.category,'']),
            ...data.paid.map(item => ['Thanh toán',item.consultation_id,item.owner_email,item.channel,item.paid_at,item.order_id,item.amount])];
          const blob = new Blob(['\uFEFF',table.map(row => row.slice(0,full ? 7 : 6).map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});
          const path = URL.createObjectURL(blob);
          const download = link('CSV',path);
          download.download = 'ktn-tu-van-' + data.start + '.csv';
          download.click();
          setTimeout(() => URL.revokeObjectURL(path),1000);
        }));
    }
    await render();
  }

  async function settings(pane) {
    const version = ++generation;
    const { config } = await call('staff/guidance');
    if (generation !== version) return;
    const courses = input('course_ids','text','Mã khóa:thời hạn, phân cách bằng dấu phẩy',{
      value:config.course_ids.map(id => id + ':' + (config.duration_presets?.[id] || '')).join(', ')
    });
    const policy = node('textarea',config.policy,{ name:'policy', 'aria-label':'Chính sách được duyệt', rows:7, placeholder:'Chính sách đã duyệt, thời hạn học và điều kiện chuyển người thật' });
    const examples = node('textarea',JSON.stringify(config.examples,null,2),{ name:'examples', 'aria-label':'Ví dụ đã ẩn danh dạng JSON', rows:12 });
    const enabled = node('label',' Bật chatbot');
    const box = input('bot_enabled','checkbox','Bật chatbot');
    box.checked = config.bot_enabled;
    enabled.prepend(box);
    const checkout = node('label',' Mở thanh toán VietQR');
    const checkoutToggle = input('checkout_enabled','checkbox','Mở thanh toán VietQR');
    checkoutToggle.checked = config.checkout_enabled;
    checkout.prepend(checkoutToggle);
    const name = input('name','text','Tên tư vấn viên',{ required:'' });
    const email = input('email','email','Email Supabase Auth',{ required:'' });
    const current = node('section');
    const members = async () => {
      ({ advisors } = await call('staff/advisors'));
      current.replaceChildren(...advisors.map(advisor => {
        const line = node('div','',{class:'controls'});
        line.append(node('span',advisor.name + ' · ' + advisor.email),button(advisor.active ? 'Ngừng quyền' : 'Bật lại',async () => {
          await call('staff/advisors','PUT',{ ...advisor, active:!advisor.active });
          await members();
        }));
        return line;
      }));
    };
    pane.replaceChildren(node('h2','Dữ liệu chatbot'),
      node('p','Dùng hội thoại cũ đã ẩn danh để rút các cặp câu hỏi và cách trả lời. Kiểm tra giá, chính sách và xóa thông tin nhận dạng trước khi lưu.'),
      button('Nạp mẫu để rà soát', async () => {
        let existing;
        try { existing = JSON.parse(examples.value); } catch { throw new Error('Sửa JSON hiện tại trước khi nạp mẫu.'); }
        if (!Array.isArray(existing)) throw new Error('Ví dụ phải là danh sách.');
        const draft = await call('staff/guidance/draft');
        const questions = new Set(existing.map(item => item?.question));
        const additions = draft.examples.filter(item => !questions.has(item.question)).slice(0, Math.max(0, draft.maxExamples - existing.length));
        examples.value = JSON.stringify([...existing, ...additions], null, 2);
        if (!policy.value.trim()) policy.value = draft.policy;
        notify(additions.length ? 'Đã thêm ' + additions.length + ' mẫu vào bản nháp. Rà lại trước khi lưu.' : 'Kho ví dụ đã đủ hoặc đã có các mẫu này.');
      }),
      node('p','Mỗi mục có question, answer và hints tùy chọn để tìm theo cách phụ huynh hay hỏi.'),
      ...(full ? [node('p','Thời hạn khóa: 1w, 2w, 1m, 2m, 3m hoặc unlimited. Nhập theo dạng mã-khóa:1m.')] : []),
      form('Lưu dữ liệu',[...(full ? [courses] : []),policy,examples,...(full ? [enabled,checkout] : [])],async data => {
        let parsed;
        try { parsed = JSON.parse(data.examples); } catch { throw new Error('Ví dụ phải là JSON hợp lệ.'); }
        if (!Array.isArray(parsed)) throw new Error('Ví dụ phải là danh sách.');
        const pairs = (data.course_ids || '').split(',').map(value => value.trim()).filter(Boolean).map(value => value.split(':').map(part => part.trim()));
        if (pairs.some(pair => pair.length !== 2)) throw new Error('Nhập khóa theo dạng mã-khóa:thời-hạn.');
        await call('staff/guidance','PUT',{ policy:data.policy, examples:parsed, course_ids:pairs.map(([id]) => id),
          duration_presets:Object.fromEntries(pairs), bot_enabled:full && box.checked, checkout_enabled:full && checkoutToggle.checked });
        notify('Đã lưu dữ liệu tư vấn.');
      }),
      node('h2','Tư vấn viên'), current,form('Cấp quyền',[name,email],async (data,element) => {
        await call('staff/advisors','PUT',data);
        element.reset();
        await members();
      }));
    await members();
  }

  async function initialize() {
    if (!staffMode) return customer();
    token = sessionStorage.getItem('ktn_consult_staff') || '';
    if (!token) {
      for (const storage of [localStorage, sessionStorage]) {
        try {
          const data = JSON.parse(storage.getItem('ktn_sll_persistent_auth_v2') || '{}');
          if (data.token) { token = data.token; break; }
        } catch { /* Thử nguồn phiên còn lại. */ }
      }
    }
    try {
      ({ actor } = await call('staff/profile'));
    } catch (error) {
      if (![401,403].includes(error.status)) throw error;
      token = '';
      staffLogin();
      return;
    }
    await staffWorkspace();
  }

  void initialize().catch(error => notify(error.message));
}

const styles = `
:root{font-family:system-ui,sans-serif;color:#261b16;background:#fbf7f0;line-height:1.5}
*{box-sizing:border-box}body{margin:0}header{background:#781f25;color:white}header div,main{max-width:1160px;margin:auto;padding:16px}
header a{color:inherit;font-weight:650;text-decoration:none}h1{margin:6px 0;font-size:clamp(1.4rem,4vw,2rem)}h2{font-size:1.13rem;margin:0 0 8px}
h3{font-size:1rem;margin:18px 0 7px}a{color:#781f25}button,input,textarea,select{font:inherit;border-radius:8px;padding:8px 11px}
button{background:#781f25;color:#fff;border:0;cursor:pointer;min-height:40px}button:disabled{opacity:.5}button[aria-pressed=true]{background:#381012}
input,textarea,select{border:1px solid #b9a69f;background:white;color:#261b16;max-width:100%;min-width:0}textarea{width:100%;min-height:76px;resize:vertical}
small{color:#6a5750;display:block;overflow-wrap:anywhere}nav,.controls,form{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:0 0 12px}
form textarea{flex-basis:100%}.panel{border:1px solid #e7dad1;border-radius:12px;background:#fff;padding:13px;margin-bottom:12px;min-width:0}
.workspace{display:grid;grid-template-columns:minmax(228px,32%) minmax(0,1fr);gap:12px}.list-row,.record{border-bottom:1px solid #eee3dc;padding:7px 0}
.messages{max-height:52vh;overflow:auto;min-height:80px;margin:8px 0}.message{padding:7px 9px;background:#f7f0e9;border-radius:8px;margin:6px 0;overflow-wrap:anywhere}
.status-badge{display:inline-block;padding:2px 9px;border-radius:999px;background:#f7f0e9;color:#781f25;font-size:.82rem;font-weight:600;margin:0 0 8px}
.quick-replies{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}.quick-replies[hidden]{display:none}.chip{background:#f7f0e9;color:#781f25;border:1px solid #d9c5b8;border-radius:999px;padding:6px 12px;min-height:36px;font-size:.9rem}.chip:hover{background:#efe2d7}
.lead-capture{background:#fbf7f0;border:1px solid #e7dad1;border-radius:10px;padding:8px 10px;margin:8px 0}
.message.customer{background:#edf3ee}.message p{margin:3px 0;white-space:pre-wrap}.message small{font-size:.78rem}.list-row button{max-width:100%;margin:0 4px 3px 0}
details{margin:8px 0}summary{cursor:pointer;font-weight:650;color:#781f25}details button{margin:4px 5px 4px 0}
blockquote{margin:4px 0;border-left:3px solid #d0a4a5;padding-left:10px}img{max-width:100%;height:auto}#status{color:#8b2424;margin:0 0 8px}
@media(max-width:690px){.workspace{grid-template-columns:minmax(0,1fr)}.list{max-height:43vh;overflow:auto}main{padding:12px}nav{gap:6px}}
body.embed{background:#fff}body.embed header{display:none}body.embed main{max-width:none;padding:10px 12px}body.embed .messages{max-height:52vh}
`;

export function consultationPage(staff, full, embed = false) {
  const nonce = crypto.randomUUID().replace(/-/g,'');
  const title = staff ? 'Hộp thư tư vấn' : 'Tư vấn khóa học';
  const bodyAttr = embed ? ' class="embed"' : '';
  return new Response(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex"><title>${title} · KTN</title><style nonce="${nonce}">${styles}</style></head><body${bodyAttr}>
  <header><div><a href="/">Học Viện Khổng Tử Nhí</a><h1>${title}</h1></div></header>
  <main><p id="status" role="status"></p><div id="content"></div></main>
  <script nonce="${nonce}">(function(){const __name=fn=>fn;(${browser.toString()})(${Boolean(staff)},${Boolean(full)});})();</script></body></html>`, { headers: {
    'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store', 'Referrer-Policy':'no-referrer',
    'Content-Security-Policy':`default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; img-src https://img.vietqr.io; base-uri 'none'; frame-ancestors 'self'; form-action 'self'`
  } });
}

export function consultationPublicWidgetScript() {
  return `(function(){
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__ktnPublicChatWidgetLoaded) return;
  window.__ktnPublicChatWidgetLoaded = true;

  var DISALLOWED_PREFIXES = ['/custom-page/so-lien-lac', '/so-lien-lac', '/sll-', '/flashcards', '/tu-van', '/api/'];
  function isAllowedPath(pathname) {
    var p = String(pathname || '/').toLowerCase();
    for (var i = 0; i < DISALLOWED_PREFIXES.length; i++) {
      if (p.indexOf(DISALLOWED_PREFIXES[i]) === 0) return false;
    }
    return true;
  }

  function mountWidget() {
    if (!document.body || document.getElementById('ktn-public-chat-host')) return;

    var host = document.createElement('div');
    host.id = 'ktn-public-chat-host';
    host.setAttribute('data-ktn-public-chat', '1');
    host.style.display = isAllowedPath(window.location.pathname) ? '' : 'none';

    var shadow = host.attachShadow({ mode: 'open' });
    var style = document.createElement('style');
    style.textContent =
      ':host{all:initial;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}' +
      '.ktn-chat-wrap{position:fixed;right:18px;bottom:max(18px,env(safe-area-inset-bottom,18px));z-index:2147483000;display:flex;flex-direction:column;align-items:flex-end;gap:10px}' +
      '.ktn-chat-fab{display:inline-flex;align-items:center;gap:8px;min-height:48px;padding:0 18px;border:0;border-radius:999px;background:linear-gradient(135deg,#991B1B,#7F1D1D);color:#fff;font:600 14px/1 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;cursor:pointer;box-shadow:0 10px 28px rgba(127,29,29,.32);transition:transform .16s ease,box-shadow .16s ease}' +
      '.ktn-chat-fab:hover{transform:translateY(-1px);box-shadow:0 14px 32px rgba(127,29,29,.4)}' +
      '.ktn-chat-panel{display:none;flex-direction:column;width:390px;max-width:calc(100vw - 24px);height:min(600px,calc(100vh - 96px));background:#fff;border:1px solid #e7dad1;border-radius:18px;overflow:hidden;box-shadow:0 20px 48px rgba(28,25,23,.22)}' +
      '.ktn-chat-panel.open{display:flex}' +
      '.ktn-chat-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 14px;background:linear-gradient(135deg,#991B1B,#7F1D1D);color:#fff}' +
      '.ktn-chat-title{font:700 13.5px/1.25 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.ktn-chat-actions{display:flex;align-items:center;gap:8px;flex-shrink:0}' +
      '.ktn-chat-expand{color:#fef2f2;text-decoration:none;font:600 12px/1 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:5px 8px;border-radius:8px;background:rgba(255,255,255,.14)}' +
      '.ktn-chat-expand:hover{background:rgba(255,255,255,.24)}' +
      '.ktn-chat-close{border:0;background:rgba(255,255,255,.16);color:#fff;width:28px;height:28px;border-radius:8px;font-size:15px;line-height:1;cursor:pointer;display:inline-flex;align-items:center;justify-content:center}' +
      '.ktn-chat-close:hover{background:rgba(255,255,255,.28)}' +
      '.ktn-chat-body{flex:1 1 auto;min-height:0;background:#fbf7f0}' +
      '.ktn-chat-iframe{width:100%;height:100%;border:0;display:block;background:#fff}' +
      '@media(max-width:640px){.ktn-chat-wrap{left:8px;right:8px;bottom:max(8px,env(safe-area-inset-bottom,8px));align-items:flex-end}.ktn-chat-panel{width:100%;max-width:none;height:min(80vh,620px)}}';

    var wrap = document.createElement('div');
    wrap.className = 'ktn-chat-wrap';

    var panel = document.createElement('section');
    panel.className = 'ktn-chat-panel';
    panel.setAttribute('aria-label', 'Tư vấn khóa học Khổng Tử Nhí');

    var head = document.createElement('div');
    head.className = 'ktn-chat-head';
    var title = document.createElement('p');
    title.className = 'ktn-chat-title';
    title.textContent = 'Học Viện Khổng Tử Nhí · Tư vấn trực tuyến';

    var actions = document.createElement('div');
    actions.className = 'ktn-chat-actions';

    var expand = document.createElement('a');
    expand.className = 'ktn-chat-expand';
    expand.href = '/tu-van';
    expand.target = '_blank';
    expand.rel = 'noopener noreferrer';
    expand.textContent = 'Mở rộng ↗';

    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'ktn-chat-close';
    closeBtn.setAttribute('aria-label', 'Đóng hộp chat');
    closeBtn.textContent = '✕';

    var body = document.createElement('div');
    body.className = 'ktn-chat-body';

    var fab = document.createElement('button');
    fab.type = 'button';
    fab.className = 'ktn-chat-fab';
    fab.setAttribute('aria-expanded', 'false');
    fab.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg><span>Tư vấn khóa học</span>';

    var isOpen = false;
    var iframeMounted = false;

    function setOpen(next) {
      isOpen = Boolean(next);
      panel.classList.toggle('open', isOpen);
      fab.style.display = isOpen ? 'none' : 'inline-flex';
      fab.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      if (isOpen && !iframeMounted) {
        iframeMounted = true;
        var frame = document.createElement('iframe');
        frame.className = 'ktn-chat-iframe';
        frame.src = '/tu-van?embed=1';
        frame.title = 'Tư vấn khóa học Khổng Tử Nhí';
        frame.setAttribute('allow', 'clipboard-write');
        body.appendChild(frame);
      }
    }

    fab.addEventListener('click', function(){ setOpen(true); });
    closeBtn.addEventListener('click', function(){ setOpen(false); });

    actions.appendChild(expand);
    actions.appendChild(closeBtn);
    head.appendChild(title);
    head.appendChild(actions);
    panel.appendChild(head);
    panel.appendChild(body);
    wrap.appendChild(panel);
    wrap.appendChild(fab);
    shadow.appendChild(style);
    shadow.appendChild(wrap);
    document.body.appendChild(host);

    var lastPath = window.location.pathname;
    function syncVisibility() {
      var curPath = window.location.pathname;
      if (curPath === lastPath) return;
      lastPath = curPath;
      var allowed = isAllowedPath(curPath);
      host.style.display = allowed ? '' : 'none';
      if (!allowed && isOpen) setOpen(false);
    }

    window.addEventListener('popstate', syncVisibility);
    window.addEventListener('hashchange', syncVisibility);
    window.setInterval(syncVisibility, 1000);
  }

  function scheduleMount() {
    window.setTimeout(mountWidget, 350);
  }

  if (document.readyState === 'complete') {
    scheduleMount();
  } else {
    window.addEventListener('load', scheduleMount, { once: true });
  }
})();
`;
}
