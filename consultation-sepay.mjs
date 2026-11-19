import { normalizeVnPhone } from './consultation-zalo.mjs';

const DEFAULT_SANDBOX_BANK_ID = 'MB';
const DEFAULT_SANDBOX_BANK_NAME = 'MBBank';
const DEFAULT_SANDBOX_ACCOUNT_NO = '0987654321';
const DEFAULT_SANDBOX_ACCOUNT_NAME = 'HOC VIEN KHONG TU NHI';
const SYNTHETIC_EMAIL_RE = /^(hv_\d+@gmail\.com|.+@pending\.khongtunhi\.local)$/i;

export function isSepaySandbox(env) {
  return env?.KTN_SEPAY_SANDBOX === 'true';
}

export function hasSepayReadyConfig(env) {
  return (
    (Boolean(env?.KTN_SEPAY_API_KEY) &&
      Boolean(env?.KTN_CONSULTATION_MAIL_KEY) &&
      Boolean(env?.KTN_CONSULTATION_MAIL_FROM)) ||
    isSepaySandbox(env)
  );
}

export function isRealProductionHost(request) {
  try {
    const host = new URL(request.url).hostname.toLowerCase();
    return (
      host === 'khongtunhi.com' ||
      host.endsWith('.khongtunhi.com') ||
      host.endsWith('.workers.dev')
    );
  } catch {
    return false;
  }
}

export function paymentInfoFromLink(link, orderId) {
  const payment = link?.payment_info;
  if (!payment?.qrUrl) return null;
  return {
    ...payment,
    transferContent: String(payment.transferContent || '').replace('ORDER_CODE', orderId),
    qrUrl: String(payment.qrUrl || '').replace('ORDER_CODE', orderId)
  };
}

function rows(data) {
  return Array.isArray(data) ? data : [];
}

function defaultEq(value) {
  return encodeURIComponent(value);
}

function defaultTidy(input, limit = 4000) {
  return typeof input === 'string' ? input.trim().slice(0, limit) : '';
}

function task(ctx, work, label) {
  const promise = Promise.resolve(work).catch(() => console.error('[Consultation] ' + label));
  if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(promise);
}

function parseEmbeddedOrderMeta(rawNote) {
  const text = String(rawNote || '');
  const marker = '<!--KTN_ORDER_META:';
  const suffix = '-->';
  const idx = text.lastIndexOf(marker);
  if (idx === -1 || !text.endsWith(suffix)) {
    return { customerNote: text.trim(), meta: {} };
  }
  const customerNote = text.slice(0, idx).trim();
  const jsonPart = text.slice(idx + marker.length, text.length - suffix.length);
  try {
    const parsed = JSON.parse(jsonPart);
    return { customerNote, meta: parsed && typeof parsed === 'object' ? parsed : {} };
  } catch {
    return { customerNote, meta: {} };
  }
}

function resolveSandboxPaymentConfig(coursePaymentConfig, env) {
  const rawAcc = String(coursePaymentConfig?.account_no || '').replace(/[\s.-]/g, '');
  const envAcc = String(env?.KTN_SEPAY_ACCOUNT_NO || '').replace(/[\s.-]/g, '');
  const accountNo = /^\d{5,24}$/.test(rawAcc)
    ? rawAcc
    : (/^\d{5,24}$/.test(envAcc) ? envAcc : DEFAULT_SANDBOX_ACCOUNT_NO);
  return {
    bank_id: coursePaymentConfig?.bank_id || env?.KTN_SEPAY_BANK_ID || DEFAULT_SANDBOX_BANK_ID,
    bank_name: coursePaymentConfig?.bank_name || env?.KTN_SEPAY_BANK_ID || DEFAULT_SANDBOX_BANK_NAME,
    account_no: accountNo,
    account_name: coursePaymentConfig?.account_name || env?.KTN_SEPAY_ACCOUNT_NAME || DEFAULT_SANDBOX_ACCOUNT_NAME
  };
}

export async function createConsultationOrder({
  env,
  deps,
  store,
  ctx,
  guidance,
  conversation,
  input,
  durations,
  emailPattern,
  uuid,
  tidy = defaultTidy,
  sendOutbox,
  RequestError,
  isStaffOrder = false,
  actor = null
}) {
  const requestId = tidy(input?.requestId || input?.request_id, 64);
  const courseId = tidy(input?.courseId || input?.course_id, 80);
  const name = tidy(input?.name || input?.student_name, 120);
  const email = tidy(input?.email || input?.student_email, 254).toLowerCase();
  const phone = normalizeVnPhone(input?.phone) || '';

  const validEmail = isStaffOrder
    ? (email === '' || (emailPattern.test(email) && !SYNTHETIC_EMAIL_RE.test(email)))
    : (emailPattern.test(email) && !SYNTHETIC_EMAIL_RE.test(email));

  if (!uuid.test(requestId || '') || !name || !validEmail || !phone) {
    throw new RequestError('Nhập họ tên học viên, email nhận hướng dẫn và số điện thoại hợp lệ.');
  }

  const config = await guidance(store);
  if (!isStaffOrder && !rows(config.course_ids).includes(courseId)) {
    throw new RequestError('Khóa học chưa mở bán qua tư vấn.');
  }

  const course = await deps.resolveServerCoursePrice(env, courseId, { requireActive: true });
  const resolvedCourseId = course.courseId || courseId;
  const requestedDuration = tidy(input?.durationPreset || input?.duration_preset, 20);
  const duration = isStaffOrder
    ? (requestedDuration || config.duration_presets?.[resolvedCourseId] || config.duration_presets?.[courseId] || '1m')
    : (config.duration_presets?.[resolvedCourseId] || config.duration_presets?.[courseId]);

  const sandbox = isSepaySandbox(env);
  if (!config.checkout_enabled) {
    throw new RequestError('Thanh toán đang tạm ngưng. Vui lòng gặp tư vấn viên.', 503);
  }
  if (!course.validCourse || !Object.hasOwn(durations, duration || '')) {
    throw new RequestError(
      isStaffOrder ? 'Khóa học hoặc thời hạn không hợp lệ.' : 'Thanh toán đang tạm ngưng. Vui lòng gặp tư vấn viên.',
      isStaffOrder ? 400 : 503
    );
  }

  const hasLivePaymentConfig =
    Boolean(course.paymentConfig?.bank_id) &&
    /^\d{5,24}$/.test(String(course.paymentConfig?.account_no || '').replace(/[\s.-]/g, '')) &&
    Boolean(env?.KTN_SEPAY_API_KEY) &&
    Boolean(env?.KTN_CONSULTATION_MAIL_KEY) &&
    Boolean(env?.KTN_CONSULTATION_MAIL_FROM);

  if (!hasLivePaymentConfig && !sandbox) {
    throw new RequestError('Thanh toán đang tạm ngưng. Vui lòng gặp tư vấn viên.', 503);
  }

  const effectivePaymentConfig = hasLivePaymentConfig
    ? course.paymentConfig
    : resolveSandboxPaymentConfig(course.paymentConfig, env);

  const channelSource =
    conversation.channel === 'zalo_oa'
      ? 'zalo_oa'
      : conversation.channel === 'messenger'
        ? 'messenger'
        : 'web_chat';
  const leadSource = conversation.source_tag || channelSource;
  const assignedAdvisor = conversation.owner_email || (isStaffOrder ? actor?.email : null) || null;
  const qr = deps.buildVietQrPaymentInfo(effectivePaymentConfig, 'ORDER_CODE', course.price);

  const order = await store.rpc('create_order', {
    p_id: conversation.id,
    p_request_id: requestId,
    p_qr_base: qr.qrUrl,
    p_order: {
      student_name: name,
      student_email: email,
      phone,
      course_id: resolvedCourseId,
      course_name: course.title,
      amount: course.price,
      source: channelSource,
      assigned_advisor: assignedAdvisor,
      payment_info: qr,
      note: deps.serializeOrderNoteWithMeta(tidy(input?.note, 500), {
        source: 'consultation',
        channel_source: channelSource,
        lead_source: leadSource,
        v2_managed: true,
        payment_sub_status: 'unpaid',
        duration_preset: duration,
        consultation_id: conversation.id,
        ...(assignedAdvisor ? { assigned_advisor: assignedAdvisor } : {})
      })
    }
  });

  if (order?.error === 'not_found') {
    throw new RequestError('Không tìm thấy cuộc tư vấn.', 404);
  }
  if (!order?.order_id) {
    throw new RequestError('Chưa tạo được đơn.', 503);
  }

  if (['messenger', 'zalo_oa'].includes(conversation.channel) && typeof sendOutbox === 'function') {
    task(ctx, sendOutbox(env, store, conversation.id), 'Outbox QR failed');
  }

  // QR được ghim theo cấu hình tại lúc tạo đơn để retry không đổi tài khoản nhận tiền.
  const link = await store.one('ktn_consultation_orders?order_id=eq.' + order.order_id + '&select=payment_info');
  const payment = paymentInfoFromLink(link, order.order_id);
  return {
    ok: true,
    id: order.order_id,
    order_id: order.order_id,
    amount: order.amount,
    payment,
    consultation_id: conversation.id,
    source: order.source || channelSource,
    assigned_advisor: order.assigned_advisor || assignedAdvisor,
    order: {
      ...order,
      payment_info: payment,
      paymentInfo: payment
    }
  };
}

export async function notifyOrder(env, store, order, result) {
  const base = (env?.KTN_CONSULTATION_PUBLIC_URL || 'https://khongtunhi.com').replace(/\/$/, '');
  const password = result?.accountCreated ? result.initialPassword : '';
  if (result?.accountCreated && !password) {
    throw new Error('Thiếu thông tin khởi tạo tài khoản');
  }

  if (env?.KTN_CONSULTATION_MAIL_KEY && env?.KTN_CONSULTATION_MAIL_FROM) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + env.KTN_CONSULTATION_MAIL_KEY,
        'Content-Type': 'application/json',
        'Idempotency-Key': 'ktn-order-' + order.order_id
      },
      body: JSON.stringify({
        from: env.KTN_CONSULTATION_MAIL_FROM,
        to: [order.student_email],
        subject: 'KTN đã mở khóa học cho đơn ' + order.order_id,
        text:
          'Khóa học: ' +
          order.course_name +
          '\nĐăng nhập: ' +
          base +
          '/?login=1\nEmail: ' +
          order.student_email +
          (password
            ? '\nMật khẩu khởi tạo: ' + password + '\nVui lòng đổi mật khẩu sau khi đăng nhập.'
            : '\nSử dụng mật khẩu tài khoản KTN hiện tại.')
      }),
      signal: AbortSignal.timeout(9000)
    });
    if (!response.ok) throw new Error('Không gửi được email');
    return { sent: true, mode: 'resend' };
  }

  if (isSepaySandbox(env)) {
    const consultationId = order.consultation_id || null;
    if (consultationId) {
      await store
        .query('ktn_consultation_events', {
          method: 'POST',
          prefer: 'return=minimal',
          body: {
            consultation_id: consultationId,
            actor_email: 'webhook:consultation',
            kind: 'sandbox_email',
            detail: {
              order_id: order.order_id,
              to: order.student_email,
              account_created: Boolean(result?.accountCreated),
              mode: 'sandbox'
            }
          }
        })
        .catch(() => null);
    }
    return { sent: true, mode: 'sandbox' };
  }

  throw new Error('Thiếu cấu hình gửi email xác nhận đơn hàng');
}

async function escalateReconciliationNeedsReview(store, payment, order = null) {
  const nowIso = new Date().toISOString();
  const patched = await store
    .patch('ktn_sepay_reconciliation_logs?transaction_id=eq.' + defaultEq(payment.transaction_id), {
      kind: 'needs_review',
      resolution_status: 'open',
      resolved_by: null,
      resolved_at: null,
      updated_at: nowIso
    })
    .catch(() => null);
  if (Array.isArray(patched) && patched.length > 0) {
    return patched[0];
  }
  return store
    .rpc('log_sepay_reconciliation', {
      p_transaction_id: payment.transaction_id,
      p_kind: 'needs_review',
      p_amount: Number(payment.amount || 0),
      p_order_id: payment.order_id || order?.order_id || null,
      p_claimed_order_code: payment.order_id || order?.order_id || null,
      p_expected_amount: order?.amount ?? null,
      p_account_number: null,
      p_transfer_content: payment.order_id ? 'KTN ' + payment.order_id : null,
      p_raw_payload: {
        source: 'processPayments',
        attempts: Number(payment.attempts || 0)
      }
    })
    .catch(() => null);
}

export async function processPayments(env, deps, store, orderId = null) {
  const payments = rows(await store.rpc('take_payment', { p_order: orderId }));
  for (const payment of payments) {
    const updatePath =
      'ktn_consultation_payments?transaction_id=eq.' +
      defaultEq(payment.transaction_id) +
      '&attempts=eq.' +
      payment.attempts;
    let order = null;
    try {
      order = await store.one('ktn_orders?order_id=eq.' + defaultEq(payment.order_id));
      if (order?.payment_status !== 'paid' || order.approval_status === 'rejected') {
        await store.patch(updatePath, { status: 'needs_review', error: 'Đơn đã thay đổi trạng thái' });
        await escalateReconciliationNeedsReview(store, payment, order);
        continue;
      }

      const cleanEmail = String(order.student_email || '').trim().toLowerCase();
      if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) || SYNTHETIC_EMAIL_RE.test(cleanEmail)) {
        await store.patch(updatePath, {
          status: 'needs_review',
          error: 'Đơn thiếu email học viên để cấp quyền'
        });
        await escalateReconciliationNeedsReview(store, payment, order);
        continue;
      }

      const link = await store.one('ktn_consultation_orders?order_id=eq.' + defaultEq(order.order_id));
      const consultationId = order.consultation_id || link?.consultation_id || null;

      if (typeof deps.serializeOrderNoteWithMeta === 'function') {
        try {
          const { customerNote, meta } = parseEmbeddedOrderMeta(order.note);
          const nextMeta = {
            ...meta,
            source: meta.source || 'consultation',
            payment_sub_status: 'verified_paid',
            payment_verified_by: meta.payment_verified_by || 'webhook:consultation',
            payment_tx_ref: payment.transaction_id,
            payment_received_amount: payment.amount,
            payment_proof_auto: true
          };
          await store.patch('ktn_orders?order_id=eq.' + defaultEq(order.order_id), {
            note: deps.serializeOrderNoteWithMeta(customerNote, nextMeta),
            updated_at: new Date().toISOString()
          });
        } catch {
          // Best-effort metadata sync; never block provisioning.
        }
      }

      const operationId = 'PROV-CONSULT-' + order.order_id;
      const result = await deps.approveAndProvisionOrder(env, {
        orderId: order.order_id,
        approvedBy: 'webhook:consultation',
        paymentStatusOverride: 'paid',
        operationId
      });

      if (!result?.ok) {
        const nextStatus = result?.retryable === false || payment.attempts >= 6 ? 'needs_review' : 'accepted';
        await store.patch(updatePath, {
          status: nextStatus,
          error: 'Chưa đồng bộ được tài khoản hoặc khóa học'
        });
        if (nextStatus === 'needs_review') {
          await escalateReconciliationNeedsReview(store, payment, order);
        }
        continue;
      }

      if (result.accountCreated && !result.initialPassword) {
        result.initialPassword = await deps.deriveDeterministicInitialPassword(
          env,
          result.operationId || operationId,
          order.student_email
        );
      }

      const studentCode =
        result.student?.code ||
        result.studentCode ||
        'KTN-' + String(order.order_id || '').replace(/^ORD-/, '');
      if (consultationId && studentCode) {
        await store
          .rpc('link_student', {
            p_consultation_id: consultationId,
            p_student_code: studentCode,
            p_actor: 'webhook:consultation'
          })
          .catch(() => null);
      }

      await notifyOrder(env, store, { ...order, consultation_id: consultationId }, result);
      await store.patch(updatePath, { status: 'done', error: null });
      await store
        .rpc('resolve_sepay_reconciliation', {
          p_transaction_id: payment.transaction_id,
          p_resolution_status: 'resolved',
          p_actor: 'webhook:consultation',
          p_note: 'Đã tự động đối soát và cấp khóa học',
          p_order_id: order.order_id
        })
        .catch(() => null);
    } catch {
      const nextStatus = payment.attempts >= 6 ? 'needs_review' : 'accepted';
      await store.patch(updatePath, {
        status: nextStatus,
        error: 'Lỗi cấp quyền hoặc gửi email. Cần kiểm tra chi tiết đơn.'
      });
      if (nextStatus === 'needs_review') {
        await escalateReconciliationNeedsReview(store, payment, order);
      }
    }
  }
}

export async function handleSepayWebhook({
  request,
  env,
  deps,
  ctx,
  store,
  isSandboxRoute = false,
  preAuthenticatedActor = null,
  bodyOf,
  parseJson,
  tokenHeader,
  same,
  tidy = defaultTidy,
  eq = defaultEq,
  RequestError
}) {
  if (isSandboxRoute) {
    if (!isSepaySandbox(env) || isRealProductionHost(request)) {
      throw new RequestError('Chế độ SePay Sandbox chưa được bật.', 403);
    }
    if (!preAuthenticatedActor) {
      const authHeader = tokenHeader(request);
      const validApikey =
        Boolean(env?.KTN_SEPAY_API_KEY) &&
        same(authHeader, 'Apikey ' + env.KTN_SEPAY_API_KEY);
      if (!validApikey) {
        throw new RequestError('Webhook SePay Sandbox chưa được xác thực.', 401);
      }
    }
  } else {
    if (
      request.method !== 'POST' ||
      !env?.KTN_SEPAY_API_KEY ||
      !same(tokenHeader(request), 'Apikey ' + env.KTN_SEPAY_API_KEY)
    ) {
      throw new RequestError('Webhook SePay chưa được xác thực.', 401);
    }
  }

  const payload = parseJson(await bodyOf(request, 15000));
  const transferType = String(payload.transferType ?? (isSandboxRoute ? 'in' : '')).toLowerCase();

  let rawTxId = tidy(String(payload.id ?? payload.transaction_id ?? payload.transactionId ?? ''), 64);
  if (isSandboxRoute && !rawTxId) {
    rawTxId = String(Date.now()) + String(Math.floor(Math.random() * 1000)).padStart(3, '0');
  }

  const validLiveTxId = /^\d{1,32}$/.test(rawTxId);
  const validSandboxTxId = /^[a-zA-Z0-9_:-]{1,64}$/.test(rawTxId);
  const hasValidTxId = isSandboxRoute ? validSandboxTxId : validLiveTxId;
  const txKey = rawTxId ? (rawTxId.startsWith('sepay:') ? rawTxId : 'sepay:' + rawTxId) : '';

  const rawAmount = Number(payload.transferAmount ?? payload.amount);
  const safeAmount =
    Number.isSafeInteger(rawAmount) && rawAmount >= 0
      ? rawAmount
      : Number.isFinite(rawAmount)
        ? Math.max(0, Math.round(rawAmount))
        : 0;

  if (transferType !== 'in' || !hasValidTxId || !Number.isSafeInteger(rawAmount) || rawAmount <= 0) {
    return deps.jsonResponse({ ok: true, success: true, ignored: true }, 201);
  }

  const sandboxOrderFallback =
    isSandboxRoute &&
    !payload.code &&
    !payload.content &&
    !payload.description &&
    !payload.transferContent &&
    payload.order_id &&
    payload.kind !== 'unmatched'
      ? 'KTN ' + tidy(String(payload.order_id), 30)
      : '';

  const transferContent = tidy(
    [payload.code, payload.content, payload.description, payload.transferContent, sandboxOrderFallback]
      .filter(Boolean)
      .join(' '),
    500
  );
  const codes = transferContent.match(/ORD[- .]?\d{6}(?!\d)/gi) || [];
  const matched = [...new Set(codes.map(value => 'ORD-' + value.slice(-6)))];
  const sourceAccounts = [payload.accountNumber, payload.subAccount]
    .map(value => String(value || '').replace(/[\s.-]/g, ''))
    .filter(Boolean);

  if (matched.length !== 1) {
    const recon = await store.rpc('log_sepay_reconciliation', {
      p_transaction_id: txKey,
      p_kind: 'unmatched',
      p_amount: safeAmount,
      p_order_id: null,
      p_claimed_order_code: matched.length > 1 ? matched.join(',') : null,
      p_expected_amount: null,
      p_account_number: sourceAccounts[0] || null,
      p_transfer_content: transferContent || null,
      p_raw_payload: payload
    });
    return deps.jsonResponse(
      {
        ok: true,
        success: true,
        status: 'unmatched',
        transaction_id: txKey,
        duplicate: Boolean(recon?.duplicate),
        reconciliation: recon?.log || null
      },
      201
    );
  }

  const orderId = matched[0];
  const link = await store.one('ktn_consultation_orders?order_id=eq.' + eq(orderId));
  if (!link) {
    const recon = await store.rpc('log_sepay_reconciliation', {
      p_transaction_id: txKey,
      p_kind: 'unknown_order',
      p_amount: safeAmount,
      p_order_id: orderId,
      p_claimed_order_code: orderId,
      p_expected_amount: null,
      p_account_number: sourceAccounts[0] || null,
      p_transfer_content: transferContent || null,
      p_raw_payload: payload
    });
    return deps.jsonResponse(
      {
        ok: true,
        success: true,
        order_id: orderId,
        transaction_id: txKey,
        status: 'unknown_order',
        duplicate: Boolean(recon?.duplicate),
        reconciliation: recon?.log || null
      },
      201
    );
  }

  const expectedAccount = String(
    link.payment_info?.accountNo ||
      link.payment_info?.accountNumber ||
      (isSepaySandbox(env) ? env?.KTN_SEPAY_ACCOUNT_NO || DEFAULT_SANDBOX_ACCOUNT_NO : '')
  ).replace(/[\s.-]/g, '');

  const effectiveSourceAccounts =
    isSandboxRoute && sourceAccounts.length === 0 && payload.kind !== 'account_mismatch' && expectedAccount
      ? [expectedAccount]
      : sourceAccounts;

  if (!expectedAccount || !effectiveSourceAccounts.includes(expectedAccount)) {
    const ord = await store.one('ktn_orders?order_id=eq.' + eq(orderId));
    const recon = await store.rpc('log_sepay_reconciliation', {
      p_transaction_id: txKey,
      p_kind: 'account_mismatch',
      p_amount: safeAmount,
      p_order_id: orderId,
      p_claimed_order_code: orderId,
      p_expected_amount: ord?.amount ?? null,
      p_account_number: effectiveSourceAccounts[0] || null,
      p_transfer_content: transferContent || null,
      p_raw_payload: payload
    });
    return deps.jsonResponse(
      {
        ok: true,
        success: true,
        order_id: orderId,
        transaction_id: txKey,
        status: 'account_mismatch',
        duplicate: Boolean(recon?.duplicate),
        reconciliation: recon?.log || null
      },
      201
    );
  }

  const payment = await store.rpc('record_payment', {
    p_order: orderId,
    p_transaction: txKey,
    p_amount: safeAmount
  });

  if (payment?.conflict === true) {
    const ord = await store.one('ktn_orders?order_id=eq.' + eq(orderId));
    const recon = await store.rpc('log_sepay_reconciliation', {
      p_transaction_id: txKey,
      p_kind: 'needs_review',
      p_amount: safeAmount,
      p_order_id: orderId,
      p_claimed_order_code: orderId,
      p_expected_amount: ord?.amount ?? null,
      p_account_number: effectiveSourceAccounts[0] || null,
      p_transfer_content: transferContent || null,
      p_raw_payload: payload
    });
    return deps.jsonResponse(
      {
        ok: false,
        success: false,
        conflict: true,
        status: 'conflict',
        order_id: orderId,
        transaction_id: txKey,
        duplicate: false,
        reconciliation: recon?.log || null
      },
      409
    );
  }

  const reconKind = payment?.status === 'done'
    ? 'accepted'
    : ['mismatch', 'duplicate', 'needs_review', 'accepted'].includes(payment?.status)
      ? payment.status
      : 'needs_review';

  const ord = await store.one('ktn_orders?order_id=eq.' + eq(orderId));
  const recon = await store.rpc('log_sepay_reconciliation', {
    p_transaction_id: txKey,
    p_kind: reconKind,
    p_amount: safeAmount,
    p_order_id: orderId,
    p_claimed_order_code: orderId,
    p_expected_amount: ord?.amount ?? null,
    p_account_number: effectiveSourceAccounts[0] || null,
    p_transfer_content: transferContent || null,
    p_raw_payload: payload
  });

  if (payment?.status === 'accepted' && !recon?.duplicate) {
    task(ctx, processPayments(env, deps, store, orderId), 'Payment provisioning failed');
  }

  return deps.jsonResponse(
    {
      ok: true,
      success: true,
      order_id: orderId,
      transaction_id: txKey,
      status: payment?.status || reconKind,
      duplicate: Boolean(recon?.duplicate),
      reconciliation: recon?.log || null
    },
    201
  );
}

export async function listSepayReconciliation({ store, searchParams, RequestError }) {
  const resolutionStatus = defaultTidy(
    searchParams.get('resolution_status') || searchParams.get('resolutionStatus') || '',
    20
  );
  const kind = defaultTidy(searchParams.get('kind') || '', 30);
  const rawLimit = Number(searchParams.get('limit') || 50);
  const rawOffset = Number(searchParams.get('offset') || 0);
  const limit = Number.isFinite(rawLimit) ? Math.min(200, Math.max(1, Math.floor(rawLimit))) : 50;
  const offset = Number.isFinite(rawOffset) ? Math.max(0, Math.floor(rawOffset)) : 0;

  const res = await store.rpc('list_sepay_reconciliation', {
    p_resolution_status: resolutionStatus || null,
    p_kind: kind || null,
    p_limit: limit,
    p_offset: offset
  });

  if (!res || res.ok === false) {
    throw new RequestError('Tham số lọc đối soát không hợp lệ.', 400);
  }
  return {
    ok: true,
    items: rows(res.items),
    total: Number(res.total || 0),
    limit: Number(res.limit || limit),
    offset: Number(res.offset || offset)
  };
}

export async function retryConsultationPayment({
  store,
  ctx,
  env,
  deps,
  orderId,
  transactionId,
  actor,
  eq = defaultEq,
  RequestError
}) {
  if (!/^ORD-\d{6}$/.test(orderId || '')) {
    throw new RequestError('Mã đơn không hợp lệ.', 400);
  }
  if (!/^sepay:[a-zA-Z0-9_:-]{1,64}$/.test(transactionId || '')) {
    throw new RequestError('Mã giao dịch không hợp lệ.', 400);
  }

  const resumed = await store.rpc('retry_payment', {
    p_order: orderId,
    p_transaction: transactionId,
    p_actor: actor.email
  });

  if (!resumed) {
    const [payment, order] = await Promise.all([
      store.one(
        'ktn_consultation_payments?transaction_id=eq.' + eq(transactionId) + '&order_id=eq.' + eq(orderId)
      ),
      store.one('ktn_orders?order_id=eq.' + eq(orderId))
    ]);

    const canImmediateRetryPartial =
      payment?.status === 'accepted' &&
      Number(payment.attempts) > 0 &&
      order?.payment_status === 'paid' &&
      order?.approval_status !== 'rejected' &&
      Number(payment.amount) === Number(order.amount);

    if (!canImmediateRetryPartial) {
      throw new RequestError('Giao dịch cần đối soát kế toán.', 409);
    }

    await store.patch(
      'ktn_consultation_payments?transaction_id=eq.' + eq(transactionId) + '&order_id=eq.' + eq(orderId),
      { next_attempt_at: new Date().toISOString(), error: null }
    );
    const link = await store.one('ktn_consultation_orders?order_id=eq.' + eq(orderId));
    const consultId = order?.consultation_id || link?.consultation_id;
    if (consultId) {
      await store
        .query('ktn_consultation_events', {
          method: 'POST',
          prefer: 'return=minimal',
          body: {
            consultation_id: consultId,
            actor_email: actor.email,
            kind: 'payment_retry',
            detail: { order_id: orderId, transaction_id: transactionId }
          }
        })
        .catch(() => null);
    }
  }

  task(ctx, processPayments(env, deps, store, orderId), 'Manual payment retry failed');
  return { updated: true };
}

export async function resolveSepayReconciliation({
  store,
  ctx,
  env,
  deps,
  txId,
  input,
  actor,
  tidy = defaultTidy,
  eq = defaultEq,
  RequestError
}) {
  const resolutionStatus = tidy(input?.resolution_status || input?.resolutionStatus || '', 20);
  const note = tidy(input?.note || input?.resolution_note || '', 2000);
  const orderId = tidy(input?.order_id || input?.orderId || '', 20);
  const retryPayment = input?.retry_payment === true || input?.retryPayment === true;

  if (retryPayment) {
    if (!['open', 'resolved', 'ignored'].includes(resolutionStatus)) {
      throw new RequestError('Thông tin xử lý đối soát không hợp lệ.', 400);
    }
    const existingLog = await store.one('ktn_sepay_reconciliation_logs?transaction_id=eq.' + eq(txId));
    if (!existingLog) {
      throw new RequestError('Không tìm thấy giao dịch đối soát.', 404);
    }
    if (orderId) {
      const requestedOrder = await store.one('ktn_orders?order_id=eq.' + eq(orderId));
      if (!requestedOrder) {
        throw new RequestError('Không tìm thấy đơn hàng liên kết.', 404);
      }
    }
    const targetOrderId = orderId || tidy(existingLog.order_id || '', 20);
    if (!/^ORD-\d{6}$/.test(targetOrderId) || !/^sepay:[a-zA-Z0-9_:-]{1,64}$/.test(txId || '')) {
      throw new RequestError('Giao dịch cần đối soát kế toán.', 409);
    }
    const [targetOrder, consultLink, payment] = await Promise.all([
      store.one('ktn_orders?order_id=eq.' + eq(targetOrderId)),
      store.one('ktn_consultation_orders?order_id=eq.' + eq(targetOrderId)),
      store.one(
        'ktn_consultation_payments?transaction_id=eq.' + eq(txId) + '&order_id=eq.' + eq(targetOrderId)
      )
    ]);
    const canRetryNeedsReview =
      Boolean(consultLink) &&
      payment?.status === 'needs_review' &&
      Number(payment.attempts) > 0 &&
      targetOrder?.payment_status === 'paid' &&
      targetOrder?.approval_status !== 'rejected' &&
      Number(payment.amount) === Number(targetOrder.amount);
    const canRetryPartial =
      payment?.status === 'accepted' &&
      Number(payment.attempts) > 0 &&
      targetOrder?.payment_status === 'paid' &&
      targetOrder?.approval_status !== 'rejected' &&
      Number(payment.amount) === Number(targetOrder.amount);
    if (!canRetryNeedsReview && !canRetryPartial) {
      throw new RequestError('Giao dịch cần đối soát kế toán.', 409);
    }
  }

  const res = await store.rpc('resolve_sepay_reconciliation', {
    p_transaction_id: txId,
    p_resolution_status: resolutionStatus,
    p_actor: actor.email,
    p_note: note || null,
    p_order_id: orderId || null
  });

  if (!res || res.ok === false) {
    if (res?.error === 'not_found') throw new RequestError('Không tìm thấy giao dịch đối soát.', 404);
    if (res?.error === 'order_not_found') throw new RequestError('Không tìm thấy đơn hàng liên kết.', 404);
    throw new RequestError('Thông tin xử lý đối soát không hợp lệ.', 400);
  }

  if (retryPayment && res?.log?.order_id) {
    await retryConsultationPayment({
      store,
      ctx,
      env,
      deps,
      orderId: res.log.order_id,
      transactionId: txId,
      actor,
      eq,
      RequestError
    });
  }

  return { ok: true, log: res.log };
}
