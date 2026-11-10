import { ktnApi, ktnRequest } from '@/services/api/ktnApiClient';
import type {
  AttachmentKind,
  ChatAttachment,
  ChatMessage,
  ChatPagination,
  ChatRoom,
  PinnedAnnouncement
} from '@/features/chat/types/chat.types';
import type { KtnStudentProfile } from '@/types/ktn.types';

import { formatDateDivider, formatFileSize } from '@/lib/utils';

const PLACEHOLDER_ROOM_MESSAGES = new Set([
  'chưa có tin nhắn. hãy gửi lời chào đầu tiên!',
  'kênh trao đổi lớp học trực tuyến',
  'hỏi đáp bài tập, phát âm và nhận xét riêng từ lão sư',
  'nhắn riêng 1-1 với học viên',
  'nhấn để mở phòng trao đổi lớp học',
  'chưa có tin nhắn mới',
  'bắt đầu cuộc trò chuyện 1-1',
]);

export function normalizeVietnameseSearchText(input?: string | null): string {
  return String(input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function isPlaceholderRoomLastMessage(text?: string | null): boolean {
  const normalized = String(text || '').trim().toLowerCase();
  if (!normalized) return true;
  return PLACEHOLDER_ROOM_MESSAGES.has(normalized);
}

export function hasRoomRealMessages(room?: Partial<ChatRoom> | null): boolean {
  if (!room) return false;
  if (typeof room.hasMessages === 'boolean') {
    return room.hasMessages;
  }
  if (room.lastMessageId && String(room.lastMessageId).trim()) {
    return true;
  }
  const msg = String(room.lastMessage || '').trim();
  if (!msg || isPlaceholderRoomLastMessage(msg)) {
    return false;
  }
  return true;
}

export function getRoomLastMessageTimestampMs(room?: Partial<ChatRoom> | null): number {
  if (!room || !hasRoomRealMessages(room)) {
    return 0;
  }
  const rawTs = room.lastMessageAt || room.updatedAt || '';
  if (!rawTs) return 0;
  const parsed = Date.parse(String(rawTs));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function sortChatRoomsLatestFirst(rooms: ChatRoom[]): ChatRoom[] {
  return [...rooms].sort((a, b) => {
    const aHasMsg = hasRoomRealMessages(a);
    const bHasMsg = hasRoomRealMessages(b);
    if (aHasMsg !== bHasMsg) {
      return aHasMsg ? -1 : 1;
    }
    if (aHasMsg && bHasMsg) {
      const aTs = getRoomLastMessageTimestampMs(a);
      const bTs = getRoomLastMessageTimestampMs(b);
      if (aTs !== bTs) {
        return bTs - aTs;
      }
      const aUnread = Number(a.unreadCount) || 0;
      const bUnread = Number(b.unreadCount) || 0;
      if (aUnread !== bUnread) {
        return bUnread - aUnread;
      }
    }
    const typeRank = (t?: string) => (t === 'class' ? 0 : t === 'course' ? 1 : 2);
    const rankDiff = typeRank(a.type) - typeRank(b.type);
    if (rankDiff !== 0) return rankDiff;
    return String(a.roomId || '').localeCompare(String(b.roomId || ''), 'vi');
  });
}

export function isRedundantAttachmentPlaceholder(
  content?: string | null,
  hasAttachment = false
): boolean {
  if (!hasAttachment) return false;
  const trimmed = String(content || '').trim();
  if (!trimmed) return true;
  if (/^\[Đã gửi (?:ảnh|hình ảnh|video|tệp|file|âm thanh)(?::\s*[^\r\n]+)?\]$/i.test(trimmed)) {
    return true;
  }
  if (/^\[Đã đính kèm (?:tệp|file|ảnh)(?::\s*[^\r\n]+)?\]$/i.test(trimmed)) {
    return true;
  }
  if (/^\[(?:Ảnh|Hình ảnh|Video|Tệp|File|Âm thanh) đính kèm\]$/i.test(trimmed)) {
    return true;
  }
  return false;
}

export function getDisplayMessageCaption(
  message: Pick<ChatMessage, 'content' | 'attachment' | 'attachment_url'>
): string {
  const rawContent = String(message.content || '').trim();
  const hasAttachment = Boolean(message.attachment?.url || message.attachment_url);
  if (isRedundantAttachmentPlaceholder(rawContent, hasAttachment)) {
    return '';
  }
  return rawContent;
}

export function truncateFileName(name?: string | null, maxLength = 28): string {
  const clean = String(name || '').trim();
  if (!clean) return 'Tệp đính kèm';
  if (clean.length <= maxLength) return clean;
  const dotIdx = clean.lastIndexOf('.');
  if (dotIdx > 0 && clean.length - dotIdx <= 8) {
    const ext = clean.slice(dotIdx);
    const stem = clean.slice(0, dotIdx);
    const avail = Math.max(8, maxLength - ext.length - 1);
    const headLen = Math.ceil(avail * 0.65);
    const tailLen = Math.max(3, avail - headLen);
    return `${stem.slice(0, headLen)}…${stem.slice(-tailLen)}${ext}`;
  }
  return `${clean.slice(0, Math.max(8, maxLength - 1))}…`;
}

export function formatRoomPreviewText(room: ChatRoom): string {
  if (!hasRoomRealMessages(room)) {
    return room.type === 'student' ? 'Bắt đầu cuộc trò chuyện 1-1' : 'Chưa có tin nhắn';
  }
  const raw = String(room.lastMessage || '').trim();
  let preview = raw
    .replace(/^\[Trả lời [^\]]+\]\s*/i, '↩ ')
    .replace(/\[Đã gửi (?:ảnh|hình ảnh):\s*([^\r\n]+)\]$/i, (_m, fn) => `📷 Hình ảnh (${truncateFileName(fn, 18)})`)
    .replace(/\[(?:Ảnh|Hình ảnh) đính kèm\]$/i, '📷 Hình ảnh')
    .replace(/\[Đã gửi video:\s*([^\r\n]+)\]$/i, (_m, fn) => `🎬 Video (${truncateFileName(fn, 18)})`)
    .replace(/\[Đã đính kèm (?:tệp|file):\s*([^\r\n]+)\]$/i, (_m, fn) => `📎 ${truncateFileName(fn, 20)}`)
    .replace(/\s+/g, ' ')
    .trim();

  if (!preview) {
    preview = 'Tin nhắn mới';
  }

  if (room.type !== 'student' && room.lastSenderName) {
    const senderShort = String(room.lastSenderName).trim();
    if (senderShort && !preview.toLowerCase().startsWith(senderShort.toLowerCase())) {
      return `${senderShort}: ${preview}`;
    }
  }
  return preview;
}

export function shouldGroupWithPreviousMessage(
  prev: ChatMessage | null | undefined,
  curr: ChatMessage
): boolean {
  if (!prev) return false;
  if (prev.status === 'failed' || curr.status === 'failed') return false;
  const prevEmail = String(prev.sender_email || '').trim().toLowerCase();
  const currEmail = String(curr.sender_email || '').trim().toLowerCase();
  if (!prevEmail || !currEmail || prevEmail !== currEmail) return false;
  if (prev.sender_role !== curr.sender_role) return false;
  if (formatDateDivider(prev.created_at) !== formatDateDivider(curr.created_at)) return false;
  const prevMs = Date.parse(prev.created_at);
  const currMs = Date.parse(curr.created_at);
  if (!Number.isFinite(prevMs) || !Number.isFinite(currMs)) return false;
  return Math.abs(currMs - prevMs) <= 5 * 60 * 1000;
}

function dataUrlToBlob(dataUrl: string): Blob {
  const hashIdx = dataUrl.indexOf('#');
  const cleanUrl = hashIdx >= 0 ? dataUrl.slice(0, hashIdx) : dataUrl;
  const commaIdx = cleanUrl.indexOf(',');
  if (commaIdx < 0) return new Blob([]);
  const meta = cleanUrl.slice(5, commaIdx);
  const b64 = cleanUrl.slice(commaIdx + 1);
  const mimeMatch = meta.match(/^([^;]+)/);
  const mimeType = (mimeMatch && mimeMatch[1]) || 'application/octet-stream';
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

async function ensureRemoteAttachment(att: ChatAttachment): Promise<ChatAttachment> {
  if (!att || (!att.url && !att.file)) return att;
  if (!att.file && (att.url.startsWith('http://') || att.url.startsWith('https://'))) {
    return att;
  }
  if (!att.file && att.kind === 'audio' && att.url.startsWith('data:audio/') && att.url.length <= 180 * 1024) {
    return att;
  }

  let blob: Blob | null = att.file || null;
  if (!blob) {
    if (att.url.startsWith('data:')) {
      blob = dataUrlToBlob(att.url);
    } else if (att.url.startsWith('blob:')) {
      const r = await fetch(att.url);
      blob = await r.blob();
    }
  }

  if (!blob || blob.size <= 0) {
    throw new Error('Không thể đọc dữ liệu tệp đính kèm. Vui lòng chọn lại tệp.');
  }

  const uploaded = await ktnApi.uploadChatFile(
    blob,
    att.name || `chat_${Date.now()}.bin`,
    (percent) => {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('ktn:chat-upload-progress', {
            detail: { fileName: att.name, percent }
          })
        );
      }
    }
  );

  if (!uploaded?.fileUrl || !/^https?:\/\//i.test(uploaded.fileUrl)) {
    throw new Error('Không nhận được URL lưu trữ hợp lệ sau khi tải tệp lên S3.');
  }

  return {
    ...att,
    url: uploaded.fileUrl,
    mimeType: uploaded.fileType || att.mimeType,
    sizeBytes: uploaded.size || att.sizeBytes,
    sizeLabel: att.sizeLabel || (uploaded.size ? formatFileSize(uploaded.size) : undefined)
  };
}

export function parseAttachmentFromUrl(rawUrl?: string | null): ChatAttachment | null {
  if (!rawUrl || !rawUrl.trim()) return null;
  const s = rawUrl.trim();
  let kind: AttachmentKind = 'file';
  let name = 'Tệp đính kèm';
  let sizeLabel = '';
  let sizeBytes: number | undefined;
  let mimeType: string | undefined;
  let durationSec: number | undefined;

  try {
    const hashIdx = s.indexOf('#');
    if (hashIdx >= 0) {
      const params = new URLSearchParams(s.slice(hashIdx + 1));
      const pKind = params.get('kind') as AttachmentKind | null;
      if (pKind && ['image', 'pdf', 'audio', 'video', 'file'].includes(pKind)) kind = pKind;
      if (params.get('name')) name = params.get('name') || name;
      if (params.get('size')) sizeLabel = params.get('size') || '';
      if (params.get('bytes')) sizeBytes = Number(params.get('bytes')) || undefined;
      if (params.get('mime')) mimeType = params.get('mime') || undefined;
      if (params.get('dur')) durationSec = Number(params.get('dur')) || undefined;
    } else if (/^data:image\/|\.(png|jpg|jpeg|webp|gif)(\?|$)/i.test(s)) {
      kind = 'image';
      name = 'Hình ảnh lớp học';
    } else if (/\.(mp4|mov|m4v)(\?|$)/i.test(s)) {
      kind = 'video';
      name = 'Video lớp học';
    } else if (/^data:audio\/|\.(wav|mp3|m4a|webm|ogg)(\?|$)/i.test(s)) {
      kind = 'audio';
      name = 'Tin nhắn thoại';
    } else if (/\.pdf(\?|$)/i.test(s)) {
      kind = 'pdf';
      name = s.split('/').pop()?.split('?')[0] || 'Tài liệu PDF';
    }
  } catch {
    // Fallback
  }

  return {
    kind,
    url: s.split('#')[0],
    name,
    sizeLabel: sizeLabel || (sizeBytes ? formatFileSize(sizeBytes) : undefined),
    sizeBytes,
    mimeType,
    durationSec
  };
}

export function encodeAttachmentUrl(att: ChatAttachment): string {
  const baseUrl = String(att.url || '').split('#')[0];
  const params = new URLSearchParams();
  params.set('kind', att.kind);
  params.set('name', att.name);
  const resolvedSizeLabel = att.sizeLabel || (att.sizeBytes ? formatFileSize(att.sizeBytes) : '');
  if (resolvedSizeLabel) params.set('size', resolvedSizeLabel);
  if (att.sizeBytes && att.sizeBytes > 0) params.set('bytes', String(att.sizeBytes));
  if (att.mimeType) params.set('mime', att.mimeType);
  if (att.durationSec) params.set('dur', String(att.durationSec));
  return `${baseUrl}#${params.toString()}`;
}

export function extractClientMessageIdFromServerId(serverId: string): string | undefined {
  const match = String(serverId || '').match(/^MSG-IDEM-[a-z0-9-]+__([a-zA-Z0-9_.-]+)$/);
  return match ? match[1] : undefined;
}

export function normalizeServerMessage(raw: Record<string, unknown>): ChatMessage {
  const attUrl = typeof raw.attachment_url === 'string' ? raw.attachment_url : '';
  const rawContent = String(raw.content || raw.text || '').trim();
  let replyTo: ChatMessage['replyTo'] = null;
  let cleanContent = rawContent;

  const replyMatch = rawContent.match(/^\[Trả lời ([^\]:]+): "([^"]+)"\]\n([\s\S]*)$/);
  if (replyMatch) {
    replyTo = {
      id: 'quoted',
      senderName: replyMatch[1],
      content: replyMatch[2]
    };
    cleanContent = replyMatch[3];
  }

  const serverId = String(raw.id || '');
  const resolvedClientMsgId =
    typeof raw.clientMessageId === 'string' && raw.clientMessageId.trim()
      ? raw.clientMessageId.trim()
      : typeof raw.client_message_id === 'string' && raw.client_message_id.trim()
      ? raw.client_message_id.trim()
      : extractClientMessageIdFromServerId(serverId);

  return {
    id: serverId,
    clientMessageId: resolvedClientMsgId,
    room_id: String(raw.room_id || raw.class_code || ''),
    class_code: typeof raw.class_code === 'string' ? raw.class_code : undefined,
    sender_email: String(raw.sender_email || ''),
    sender_name: String(raw.sender_name || 'Thành viên KTN'),
    sender_role: (raw.sender_role as ChatMessage['sender_role']) || 'student',
    content: cleanContent,
    attachment_url: attUrl,
    attachment: parseAttachmentFromUrl(attUrl),
    replyTo,
    reactions: [],
    created_at: String(raw.created_at || new Date().toISOString()),
    status: 'sent'
  };
}

export const chatApi = {
  async getRooms(): Promise<{
    role: string;
    groupRooms: ChatRoom[];
    privateRoom?: ChatRoom;
    privateThreads?: ChatRoom[];
  }> {
    const res = await ktnRequest<{
      ok: boolean;
      role: string;
      groupRooms: ChatRoom[];
      allGroupRooms?: ChatRoom[];
      emptyGroupRooms?: ChatRoom[];
      privateRoom?: ChatRoom;
      privateThreads?: ChatRoom[];
    }>('/api/ktn/messages/rooms');

    const normalizeRoom = (r: ChatRoom): ChatRoom => {
      const hasRealMsg = hasRoomRealMessages(r);
      const resolvedLastMessageAt = hasRealMsg ? r.lastMessageAt || r.updatedAt || null : null;
      return {
        ...r,
        hasMessages: hasRealMsg,
        lastMessageAt: resolvedLastMessageAt,
        updatedAt: resolvedLastMessageAt || undefined,
        unreadCount:
          hasRealMsg && typeof r.unreadCount === 'number'
            ? r.unreadCount
            : hasRealMsg && r.unread
            ? 1
            : 0,
        memberCount: typeof r.memberCount === 'number' ? r.memberCount : undefined,
      };
    };

    const rawGroups = [
      ...(Array.isArray(res.groupRooms) ? res.groupRooms : []),
      ...(Array.isArray(res.allGroupRooms) ? res.allGroupRooms : []),
      ...(Array.isArray(res.emptyGroupRooms) ? res.emptyGroupRooms : []),
    ];
    const dedupedGroups = new Map<string, ChatRoom>();
    for (const grp of rawGroups) {
      if (!grp || !grp.roomId) continue;
      const key = String(grp.roomId).trim().toUpperCase();
      const norm = normalizeRoom(grp);
      const existing = dedupedGroups.get(key);
      if (!existing || (!hasRoomRealMessages(existing) && hasRoomRealMessages(norm))) {
        dedupedGroups.set(key, norm);
      }
    }

    return {
      role: res.role,
      groupRooms: Array.from(dedupedGroups.values()),
      privateRoom: res.privateRoom ? normalizeRoom(res.privateRoom) : undefined,
      privateThreads: (res.privateThreads || []).map(normalizeRoom),
    };
  },

  async getMessages(
    roomId: string,
    options: { limit?: number; before?: string | null } = {}
  ): Promise<{
    roomId: string;
    messages: ChatMessage[];
    pinnedMessage: PinnedAnnouncement | null;
    pagination: ChatPagination;
  }> {
    const params = new URLSearchParams();
    params.set('roomId', roomId);
    if (options.limit) params.set('limit', String(options.limit));
    if (options.before) params.set('before', options.before);

    const res = await ktnRequest<{
      ok: boolean;
      roomId: string;
      messages: Array<Record<string, unknown>>;
      pinnedMessage?: PinnedAnnouncement | null;
      pagination?: ChatPagination;
    }>(`/api/ktn/messages?${params.toString()}`);

    const messages = (Array.isArray(res.messages) ? res.messages : []).map(normalizeServerMessage);
    return {
      roomId: res.roomId || roomId,
      messages,
      pinnedMessage: res.pinnedMessage || null,
      pagination: res.pagination || {
        hasMore: false,
        nextCursor: null,
        oldestCreatedAt: messages[0]?.created_at || null,
        limit: options.limit || 50,
        totalAvailable: messages.length
      }
    };
  },

  async sendMessage(payload: {
    roomId: string;
    classCode?: string;
    content: string;
    attachment?: ChatAttachment | null;
    replyTo?: ChatMessage['replyTo'];
    clientMessageId: string;
    isPinned?: boolean;
  }): Promise<{
    message: ChatMessage;
    clientMessageId: string;
    serverMessageId: string;
    idempotent?: boolean;
  }> {
    const finalContent = payload.replyTo
      ? `[Trả lời ${payload.replyTo.senderName}: "${payload.replyTo.content.slice(0, 60)}"]\n${payload.content}`
      : payload.content;
    const resolvedAttachment = payload.attachment
      ? await ensureRemoteAttachment(payload.attachment)
      : null;
    const attachmentUrl = resolvedAttachment ? encodeAttachmentUrl(resolvedAttachment) : '';

    const res = await ktnRequest<{
      ok: boolean;
      persisted: boolean;
      idempotent?: boolean;
      clientMessageId?: string;
      serverMessageId?: string;
      message: Record<string, unknown>;
    }>('/api/ktn/messages', {
      method: 'POST',
      body: JSON.stringify({
        roomId: payload.roomId,
        classCode: payload.classCode || payload.roomId,
        content: finalContent,
        attachmentUrl,
        clientMessageId: payload.clientMessageId,
        isPinned: payload.isPinned
      })
    });

    if (!res.persisted || !res.message || !res.message.id) {
      throw new Error('Máy chủ chưa xác nhận lưu tin nhắn.');
    }

    const msg = normalizeServerMessage(res.message);
    return {
      message: msg,
      clientMessageId: res.clientMessageId || payload.clientMessageId,
      serverMessageId: String(res.serverMessageId || msg.id),
      idempotent: res.idempotent
    };
  },

  async pinAnnouncement(roomId: string, content: string, messageId?: string): Promise<PinnedAnnouncement> {
    const res = await ktnRequest<{
      ok: boolean;
      pinnedMessage: PinnedAnnouncement;
    }>('/api/ktn/messages/pin', {
      method: 'POST',
      body: JSON.stringify({ roomId, content, messageId })
    });
    return res.pinnedMessage;
  },

  async markRoomRead(roomId: string, lastReadMessageId?: string | null): Promise<void> {
    await ktnRequest('/api/ktn/messages/read', {
      method: 'POST',
      body: JSON.stringify({
        roomId,
        lastReadMessageId: lastReadMessageId || null,
        lastReadAt: new Date().toISOString()
      })
    });
  },

  async searchMessageCandidates(
    params: { q?: string; classCode?: string; limit?: number } = {},
    signal?: AbortSignal
  ): Promise<KtnStudentProfile[]> {
    const normalizeCandidate = (raw: Record<string, unknown>): KtnStudentProfile | null => {
      const email = String(raw.email || raw.studentEmail || '')
        .trim()
        .toLowerCase();
      if (!email) return null;
      const name = String(raw.name || raw.studentName || email).trim();
      const code = String(raw.code || raw.studentCode || '').trim() || undefined;
      const classCode =
        String(raw.class_code ?? raw.classCode ?? '')
          .trim()
          .toUpperCase() || null;
      return {
        email,
        name,
        code,
        class_code: classCode,
        phone: typeof raw.phone === 'string' ? raw.phone : undefined,
        parent_name:
          typeof raw.parent_name === 'string'
            ? raw.parent_name
            : typeof raw.parentName === 'string'
            ? raw.parentName
            : undefined,
      };
    };

    const qs = new URLSearchParams();
    if (params.q?.trim()) qs.set('q', params.q.trim());
    if (params.classCode?.trim()) qs.set('classCode', params.classCode.trim());
    qs.set('limit', String(params.limit || 25));

    try {
      const res = await ktnRequest<{
        ok: boolean;
        items?: Array<Record<string, unknown>>;
        candidates?: Array<Record<string, unknown>>;
      }>(`/api/ktn/messages/candidates?${qs.toString()}`, { signal });
      const rawList = Array.isArray(res.candidates)
        ? res.candidates
        : Array.isArray(res.items)
        ? res.items
        : [];
      return rawList
        .map((item) => normalizeCandidate(item))
        .filter((item): item is KtnStudentProfile => Boolean(item));
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') {
        throw err;
      }
      const fallback = await ktnApi.searchStudents(
        { q: params.q?.trim() || '', classCode: params.classCode, limit: params.limit || 25, offset: 0 },
        signal
      );
      const rawItems = Array.isArray(fallback.items) ? fallback.items : [];
      return rawItems
        .map((item) => normalizeCandidate(item as unknown as Record<string, unknown>))
        .filter((item): item is KtnStudentProfile => Boolean(item));
    }
  }
};
