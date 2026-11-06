import type { UserRole } from '@/types/ktn.types';

export type MessageDeliveryStatus = 'sending' | 'sent' | 'delivered' | 'seen' | 'failed';
export type AttachmentKind = 'image' | 'pdf' | 'audio' | 'video' | 'file';
export type ChatConnectionState = 'connected' | 'reconnecting' | 'offline';

export interface ChatAttachment {
  kind: AttachmentKind;
  url: string;
  name: string;
  sizeLabel?: string;
  durationSec?: number;
  file?: File | Blob;
  mimeType?: string;
  sizeBytes?: number;
}

export interface ChatReplyTarget {
  id: string;
  senderName: string;
  content: string;
}

export interface ChatReaction {
  emoji: string;
  count: number;
  users: string[];
}

export interface ChatMessage {
  id: string;
  clientMessageId?: string;
  room_id: string;
  class_code?: string;
  sender_email: string;
  sender_name: string;
  sender_role: UserRole;
  content: string;
  attachment_url?: string;
  attachment?: ChatAttachment | null;
  replyTo?: ChatReplyTarget | null;
  reactions?: ChatReaction[];
  created_at: string;
  status: MessageDeliveryStatus;
  errorMessage?: string;
}

export interface PinnedAnnouncement {
  roomId: string;
  content: string;
  pinnedBy?: string;
  updatedAt?: string;
  messageId?: string | null;
}

export interface ChatRoom {
  roomId: string;
  type: 'class' | 'course' | 'student';
  classCode?: string;
  courseId?: string;
  studentEmail?: string;
  studentName?: string;
  teacherName?: string;
  label: string;
  shortLabel?: string;
  lastMessage?: string;
  lastSenderName?: string;
  lastSenderRole?: string;
  updatedAt?: string;
  lastMessageId?: string | null;
  lastReadMessageId?: string | null;
  unreadCount: number;
  unread?: boolean;
  memberCount?: number;
}

export interface ChatPagination {
  hasMore: boolean;
  nextCursor: string | null;
  oldestCreatedAt: string | null;
  limit: number;
  totalAvailable: number;
}

export type ChatDemoScenario =
  | 'live_real'
  | 'demo_rich'
  | 'demo_empty'
  | 'demo_sending'
  | 'demo_failed'
  | 'demo_unread';

export interface SendMessageInput {
  roomId: string;
  classCode?: string;
  content: string;
  attachment?: ChatAttachment | null;
  replyTo?: ChatReplyTarget | null;
  clientMessageId?: string;
  isPinned?: boolean;
}
