import { ktnApi, ktnRequest } from '@/services/api/ktnApiClient';
import type {
  AttachmentKind,
  ChatAttachment,
  ChatMessage,
  ChatPagination,
  ChatRoom,
  PinnedAnnouncement
} from '@/features/chat/types/chat.types';

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
  if (!att || !att.url) return att;
  if (att.url.startsWith('http://') || att.url.startsWith('https://')) {
    return att;
  }
  if (att.kind === 'audio' && att.url.startsWith('data:audio/') && att.url.length <= 180 * 1024) {
    return att;
  }
  try {
    let blob: Blob | null = null;
    if (att.url.startsWith('data:')) {
      blob = dataUrlToBlob(att.url);
    } else if (att.url.startsWith('blob:')) {
      const r = await fetch(att.url);
      blob = await r.blob();
    }
    if (blob && blob.size > 0) {
      const uploaded = await ktnApi.uploadChatFile(blob, att.name || `chat_${Date.now()}.bin`);
      if (uploaded.fileUrl) {
        return {
          ...att,
          url: uploaded.fileUrl
        };
      }
    }
  } catch {
    // Fallback to server-side auto-upload in Worker if presigned PUT fails
  }
  return att;
}

export function parseAttachmentFromUrl(rawUrl?: string | null): ChatAttachment | null {
  if (!rawUrl || !rawUrl.trim()) return null;
  const s = rawUrl.trim();
  let kind: AttachmentKind = 'file';
  let name = 'Tệp đính kèm';
  let sizeLabel = '';
  let durationSec: number | undefined;

  try {
    const hashIdx = s.indexOf('#');
    if (hashIdx >= 0) {
      const params = new URLSearchParams(s.slice(hashIdx + 1));
      const pKind = params.get('kind') as AttachmentKind | null;
      if (pKind && ['image', 'pdf', 'audio', 'file'].includes(pKind)) kind = pKind;
      if (params.get('name')) name = params.get('name') || name;
      if (params.get('size')) sizeLabel = params.get('size') || '';
      if (params.get('dur')) durationSec = Number(params.get('dur')) || undefined;
    } else if (/^data:image\/|\.(png|jpg|jpeg|webp|gif)(\?|$)/i.test(s)) {
      kind = 'image';
      name = 'Hình ảnh lớp học';
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
    sizeLabel: sizeLabel || undefined,
    durationSec
  };
}

export function encodeAttachmentUrl(att: ChatAttachment): string {
  const params = new URLSearchParams();
  params.set('kind', att.kind);
  params.set('name', att.name);
  if (att.sizeLabel) params.set('size', att.sizeLabel);
  if (att.durationSec) params.set('dur', String(att.durationSec));
  return `${att.url}#${params.toString()}`;
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

  return {
    id: String(raw.id || ''),
    clientMessageId: typeof raw.clientMessageId === 'string' ? raw.clientMessageId : undefined,
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
      privateRoom?: ChatRoom;
      privateThreads?: ChatRoom[];
    }>('/api/ktn/messages/rooms');

    const normalizeRoom = (r: ChatRoom): ChatRoom => ({
      ...r,
      unreadCount: typeof r.unreadCount === 'number' ? r.unreadCount : r.unread ? 1 : 0,
      memberCount: typeof r.memberCount === 'number' ? r.memberCount : undefined
    });

    return {
      role: res.role,
      groupRooms: (res.groupRooms || []).map(normalizeRoom),
      privateRoom: res.privateRoom ? normalizeRoom(res.privateRoom) : undefined,
      privateThreads: (res.privateThreads || []).map(normalizeRoom)
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
  }
};
