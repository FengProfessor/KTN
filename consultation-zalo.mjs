import { isAdultTutoringRequest } from './consultation-retrieval.mjs';

const tidy = (input, limit = 4000) => (typeof input === 'string' ? input.trim().slice(0, limit) : '');

function same(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' || !left.length || left.length !== right.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

function getHeader(headers, name) {
  if (!headers) return '';
  if (typeof headers.get === 'function') return headers.get(name) || '';
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === target) return String(value ?? '');
  }
  return '';
}

export function normalizeVnPhone(raw) {
  const cleaned = tidy(String(raw ?? ''), 30).replace(/[ .-]/g, '');
  if (!cleaned) return undefined;
  if (/^84[35789]\d{8}$/.test(cleaned)) return '0' + cleaned.slice(2);
  if (/^(0|\+84)[35789]\d{8}$/.test(cleaned)) return cleaned;
  return undefined;
}

export function normalizeZaloTimestamp(ts) {
  if (ts === null || ts === undefined || ts === '') return undefined;
  if (typeof ts === 'number' || /^\d+$/.test(String(ts).trim())) {
    const raw = Number(String(ts).trim());
    if (!Number.isFinite(raw) || raw <= 0) return undefined;
    const ms = raw < 1e11 ? raw * 1000 : raw;
    const date = new Date(ms);
    return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
  }
  const date = new Date(String(ts).trim());
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

export async function computeZaloSignature(appId, rawBody, timeStamp, appSecret) {
  const input = `${String(appId ?? '')}${String(rawBody ?? '')}${String(timeStamp ?? '')}${String(appSecret ?? '')}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function verifyZaloWebhookSignature({ rawBody = '', headers, payload = {}, env = {}, isSandboxRoute = false }) {
  const sandboxEnabled = env?.KTN_ZALO_SANDBOX === 'true';
  const sandboxHeader = getHeader(headers, 'x-ktn-sandbox').toLowerCase() === 'true';
  const rawSig = getHeader(headers, 'x-zevent-signature').trim();
  const providedSig = rawSig.replace(/^mac=/i, '').trim().toLowerCase();

  if (isSandboxRoute) {
    if (!sandboxEnabled) {
      return { ok: false, status: 403, mode: 'sandbox', reason: 'sandbox_disabled' };
    }
    if (!providedSig) {
      return { ok: true, mode: 'sandbox' };
    }
  } else if (sandboxHeader && sandboxEnabled && !providedSig) {
    return { ok: true, mode: 'sandbox' };
  }

  if (!providedSig) {
    return { ok: false, status: 401, mode: isSandboxRoute ? 'sandbox' : 'live', reason: 'missing_signature' };
  }

  const appId = String(env?.KTN_ZALO_APP_ID || payload?.app_id || '');
  const appSecret = String(env?.KTN_ZALO_APP_SECRET || '');
  if (!appId || !appSecret) {
    return { ok: false, status: 401, mode: isSandboxRoute ? 'sandbox' : 'live', reason: 'missing_secret' };
  }

  const tsHeader = getHeader(headers, 'x-zevent-timestamp');
  const timeStamp = String(tsHeader || payload?.timestamp || '');
  const expectedSig = await computeZaloSignature(appId, rawBody, timeStamp, appSecret);
  if (!same(providedSig, expectedSig)) {
    return { ok: false, status: 401, mode: isSandboxRoute ? 'sandbox' : 'live', reason: 'invalid_signature' };
  }

  return { ok: true, mode: isSandboxRoute ? 'sandbox' : 'live' };
}

function detectZaloSourceTag(body, payload) {
  const explicit = tidy(payload?.source_tag || payload?.ad_tag || '', 40);
  if (explicit) return explicit;
  if (!body) return undefined;
  if (isAdultTutoringRequest(body)) {
    const normalized = body.toLowerCase().replace(/\s+/g, '');
    if (/1[.,]?500k|1tr5/.test(normalized)) return 'ad_1500k';
    if (/963k/.test(normalized)) return 'ad_963k';
  }
  return undefined;
}

export function normalizeZaloWebhookEvent(payload, env = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const eventName = tidy(payload.event_name || 'unknown', 80) || 'unknown';
  const oaId = String(env?.KTN_ZALO_OA_ID || payload.oa_id || payload.oa_id_ext || '');
  const senderId = tidy(String(payload.sender?.id || ''), 128);
  const recipientId = tidy(String(payload.recipient?.id || ''), 128);
  const followerId = tidy(String(payload.follower?.id || payload.user_id_by_app || ''), 128);
  const isEcho = /^oa_send_/i.test(eventName) || (Boolean(oaId) && senderId === oaId);
  const zaloUserId = isEcho ? (recipientId || followerId) : (senderId || followerId);
  if (!zaloUserId) return null;

  const rawMsgId = tidy(String(payload.message?.msg_id || payload.event_id || ''), 200);
  const tsFallback = payload.timestamp !== undefined && payload.timestamp !== null ? String(payload.timestamp) : '';
  const eventId = rawMsgId || `${eventName}:${zaloUserId}:${tsFallback}`;
  if (!eventId) return null;

  let body = tidy(payload.message?.text, 4000) || null;
  if (!body && eventName === 'user_submit_info') {
    body = 'Đã chia sẻ thông tin liên hệ trên Zalo OA';
  } else if (!body && /^user_send_(?:image|file|sticker|audio|gif|location|link)$/i.test(eventName)) {
    body = '[Tệp đính kèm trên Zalo OA]';
  } else if (!body && /^oa_send_(?:image|file|sticker|audio|gif|list)$/i.test(eventName)) {
    body = '[Tệp đính kèm từ Zalo OA]';
  } else if (!body && Array.isArray(payload.message?.attachments) && payload.message.attachments.length) {
    body = isEcho ? '[Tệp đính kèm từ Zalo OA]' : '[Tệp đính kèm trên Zalo OA]';
  }
  if (body) body = tidy(body, 4000);

  const customerName = tidy(payload.info?.name || payload.sender?.name || payload.follower?.display_name || '', 120) || undefined;
  const customerPhone = normalizeVnPhone(payload.info?.phone);
  const sourceTag = detectZaloSourceTag(body, payload);
  const leadMeta = { zalo_event: eventName };
  if (payload.info?.address) leadMeta.address = tidy(String(payload.info.address), 200);
  if (Array.isArray(payload.message?.attachments) && payload.message.attachments.length) {
    leadMeta.has_attachments = true;
  }
  if (sourceTag === 'ad_963k' || sourceTag === 'ad_1500k') {
    leadMeta.ad_package = sourceTag;
  }

  const at = normalizeZaloTimestamp(payload.timestamp);
  const triggerBot = !isEcho && Boolean(body) && /^user_send_/i.test(eventName);

  return {
    event_name: eventName,
    is_echo: isEcho,
    zalo_user_id: zaloUserId,
    event_id: eventId,
    body,
    customer_name: customerName,
    customer_phone: customerPhone,
    source_tag: sourceTag,
    lead_meta: leadMeta,
    at,
    triggerBot
  };
}

export async function fetchZaloUserProfile(env, userId) {
  if (env?.KTN_ZALO_SANDBOX === 'true' || !env?.KTN_ZALO_OA_ACCESS_TOKEN || !userId) {
    return null;
  }
  try {
    const query = encodeURIComponent(JSON.stringify({ user_id: String(userId) }));
    const response = await fetch(`https://openapi.zalo.me/v3.0/oa/user/detail?data=${query}`, {
      method: 'GET',
      headers: { access_token: env.KTN_ZALO_OA_ACCESS_TOKEN },
      signal: AbortSignal.timeout(4000)
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (data?.error !== 0 || !data?.data) return null;
    return {
      display_name: tidy(data.data.display_name, 120) || undefined,
      avatar: tidy(data.data.avatar, 500) || undefined
    };
  } catch {
    return null;
  }
}

export async function handleZaloWebhook({
  request,
  env,
  ctx,
  store,
  isSandboxRoute = false,
  parseJson,
  bodyOf,
  RequestError,
  onCustomerMessage
}) {
  const url = new URL(request.url);
  if (request.method === 'GET') {
    const challenge = url.searchParams.get('challenge') || url.searchParams.get('hub.challenge');
    if (challenge !== null) {
      return new Response(challenge, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
    return { ok: true, channel: 'zalo_oa', sandbox: env?.KTN_ZALO_SANDBOX === 'true' };
  }

  if (request.method !== 'POST') {
    throw new RequestError('Phương thức không được hỗ trợ.', 405);
  }

  if (isSandboxRoute && env?.KTN_ZALO_SANDBOX !== 'true') {
    throw new RequestError('Chế độ Zalo Sandbox chưa được bật.', 403);
  }

  const rawBody = await bodyOf(request, 512000);
  let payload = {};
  if (rawBody.trim()) {
    payload = parseJson(rawBody);
  }

  const auth = await verifyZaloWebhookSignature({
    rawBody,
    headers: request.headers,
    payload,
    env,
    isSandboxRoute
  });
  if (!auth.ok) {
    throw new RequestError(
      auth.status === 403 ? 'Chế độ Zalo Sandbox chưa được bật.' : 'Chữ ký Zalo OA không hợp lệ.',
      auth.status || 401
    );
  }

  const normalized = normalizeZaloWebhookEvent(payload, env);
  if (!normalized) {
    return { ok: true, ignored: true };
  }

  if (!normalized.is_echo && !normalized.customer_name && env?.KTN_ZALO_SANDBOX !== 'true' && env?.KTN_ZALO_OA_ACCESS_TOKEN) {
    const profile = await fetchZaloUserProfile(env, normalized.zalo_user_id);
    if (profile?.display_name) normalized.customer_name = profile.display_name;
    if (profile?.avatar) normalized.lead_meta.zalo_avatar = profile.avatar;
  }

  const rpcPayload = {
    is_echo: normalized.is_echo ? 'true' : 'false',
    lead_meta: normalized.lead_meta
  };
  if (normalized.body) rpcPayload.body = normalized.body;
  if (normalized.customer_name) rpcPayload.customer_name = normalized.customer_name;
  if (normalized.customer_phone) rpcPayload.customer_phone = normalized.customer_phone;
  if (normalized.source_tag) rpcPayload.source_tag = normalized.source_tag;
  if (normalized.at) rpcPayload.at = normalized.at;

  const result = await store.rpc('upsert_zalo_inbound', {
    p_event_id: normalized.event_id,
    p_event_name: normalized.event_name,
    p_zalo_user_id: normalized.zalo_user_id,
    p_payload: rpcPayload
  });

  if (result?.duplicate) {
    return { ok: true, duplicate: true, event_id: normalized.event_id };
  }
  if (result?.ok === false) {
    throw new RequestError('Không thể ghi nhận sự kiện Zalo OA.', 400);
  }

  if (normalized.triggerBot && result?.message && result?.conversation && typeof onCustomerMessage === 'function') {
    const work = Promise.resolve(onCustomerMessage(result.conversation, result.message, normalized))
      .catch(() => console.error('[Consultation] Zalo inbound handler failed'));
    if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(work);
    else await work;
  }

  return {
    ok: true,
    duplicate: false,
    event_id: normalized.event_id,
    consultation_id: result?.conversation?.id || null,
    status: result?.conversation?.status || null
  };
}

function buildZaloCsPayload(userId, message, quickReplies) {
  const bodyText = String(message?.body || '');
  const qrMatch = /\nVietQR: (https:\/\/img\.vietqr\.io\/\S+)$/.exec(bodyText);
  if (qrMatch) {
    const caption = bodyText.replace(/\nVietQR: https:\/\/img\.vietqr\.io\/\S+$/, '').trim() || 'Mã thanh toán VietQR KTN';
    return {
      recipient: { user_id: userId },
      message: {
        text: caption,
        attachment: {
          type: 'template',
          payload: {
            template_type: 'media',
            elements: [{ media_type: 'image', url: qrMatch[1] }]
          }
        }
      }
    };
  }

  if (Array.isArray(quickReplies) && quickReplies.length) {
    const buttons = quickReplies.slice(0, 5).map(item => ({
      title: tidy(item.label || item.title || '', 100),
      type: item.url ? 'oa.open.url' : 'oa.query.show',
      payload: item.url ? { url: item.url } : String(item.payload || item.label || '')
    })).filter(item => item.title);
    if (buttons.length) {
      return {
        recipient: { user_id: userId },
        message: {
          text: bodyText,
          attachment: {
            type: 'template',
            payload: {
              template_type: 'request_user_info',
              buttons
            }
          }
        }
      };
    }
  }

  return {
    recipient: { user_id: userId },
    message: { text: bodyText }
  };
}

async function refreshZaloAccessToken(env) {
  if (!env?.KTN_ZALO_OA_REFRESH_TOKEN || !env?.KTN_ZALO_APP_ID || !env?.KTN_ZALO_APP_SECRET) {
    return null;
  }
  try {
    const form = new URLSearchParams({
      refresh_token: env.KTN_ZALO_OA_REFRESH_TOKEN,
      app_id: String(env.KTN_ZALO_APP_ID),
      grant_type: 'refresh_token'
    });
    const response = await fetch('https://oauth.zaloapp.com/v4/oa/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        secret_key: env.KTN_ZALO_APP_SECRET
      },
      body: form.toString(),
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) return null;
    const data = await response.json();
    return tidy(data?.access_token, 2000) || null;
  } catch {
    return null;
  }
}

export async function sendZaloMessage(env, { userId, message, conversation, quickReplies } = {}) {
  if (env?.KTN_ZALO_SANDBOX === 'true') {
    return {
      ok: true,
      externalId: 'zalo_sandbox:' + (message?.id || crypto.randomUUID()),
      sandbox: true
    };
  }

  let accessToken = env?.KTN_ZALO_OA_ACCESS_TOKEN || '';
  if (!accessToken) {
    return { ok: false, error: 'Zalo OA chưa cấu hình access token.' };
  }

  const recipientId = tidy(String(userId || conversation?.zalo_user_id || conversation?.external_id || ''), 128);
  if (!recipientId) {
    return { ok: false, error: 'Thiếu mã người dùng Zalo.' };
  }

  const payload = buildZaloCsPayload(recipientId, message, quickReplies);
  const sendOnce = async token => {
    const response = await fetch('https://openapi.zalo.me/v3.0/oa/message/cs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        access_token: token
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(7500)
    });
    const data = await response.json().catch(() => ({}));
    return { response, data };
  };

  try {
    let { response, data } = await sendOnce(accessToken);
    if ((response.status === 401 || [-216, -124].includes(data?.error)) && env?.KTN_ZALO_OA_REFRESH_TOKEN) {
      const refreshed = await refreshZaloAccessToken(env);
      if (refreshed) {
        accessToken = refreshed;
        ({ response, data } = await sendOnce(accessToken));
      }
    }
    if (response.ok && data?.error === 0 && data?.data?.message_id) {
      return { ok: true, externalId: 'zalo:' + String(data.data.message_id) };
    }
    return { ok: false, error: 'Zalo OA chưa xác nhận gửi. Kiểm tra trước khi gửi lại.' };
  } catch {
    return { ok: false, error: 'Zalo OA chưa xác nhận gửi. Kiểm tra trước khi gửi lại.' };
  }
}
