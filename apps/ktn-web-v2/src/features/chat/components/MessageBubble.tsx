import React, { useState } from 'react';
import {
  Check,
  CheckCheck,
  Clock,
  AlertCircle,
  RotateCcw,
  Reply,
  SmilePlus,
  Pin,
  ShieldCheck,
} from 'lucide-react';
import { ChatMessage } from '../types/chat.types';
import { AttachmentPreview } from './AttachmentPreview';
import { formatChatTimestamp, getInitials } from '@/lib/utils';

const QUICK_EMOJIS = ['👍', '❤️', '👏', '🎉'];

interface MessageBubbleProps {
  message: ChatMessage;
  currentUserEmail: string;
  currentUserName?: string;
  canManagePin: boolean;
  onReply: (message: ChatMessage) => void;
  onReact: (messageId: string, emoji: string) => void;
  onPinMessage: (message: ChatMessage) => void;
  onRetry?: (message: ChatMessage) => void;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  currentUserEmail,
  currentUserName,
  canManagePin,
  onReply,
  onReact,
  onPinMessage,
  onRetry,
}) => {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const isOwn =
    String(message.sender_email || '').toLowerCase() ===
    String(currentUserEmail || '').toLowerCase();

  const isTeacherOrAdmin =
    message.sender_role === 'teacher' || message.sender_role === 'admin';

  const status = message.status || 'sent';
  const reactions = Array.isArray(message.reactions) ? message.reactions : [];

  const renderRoleBadge = () => {
    if (message.sender_role === 'teacher') {
      return (
        <span className="inline-flex items-center gap-0.5 rounded bg-red-800 px-1.5 py-0.5 text-[10px] font-bold text-white">
          <ShieldCheck className="h-2.5 w-2.5" />
          Giáo viên
        </span>
      );
    }
    if (message.sender_role === 'admin') {
      return (
        <span className="inline-flex items-center gap-0.5 rounded bg-amber-700 px-1.5 py-0.5 text-[10px] font-bold text-white">
          Học vụ KTN
        </span>
      );
    }
    return null;
  };

  const renderDeliveryStatus = () => {
    if (!isOwn) return null;

    if (status === 'sending') {
      return (
        <span
          data-testid="msg-status-sending"
          className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700"
        >
          <Clock className="h-3 w-3 animate-spin" />
          Đang gửi...
        </span>
      );
    }

    if (status === 'failed') {
      return (
        <div
          data-testid="msg-status-failed"
          role="alert"
          className="mt-1 flex flex-wrap items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] text-red-700"
        >
          <span className="inline-flex items-center gap-1 font-semibold">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-600" />
            Chưa gửi được. Tin nhắn vẫn đang được giữ trên thiết bị.
          </span>
          {onRetry && (
            <button
              type="button"
              data-testid="retry-failed-message-btn"
              onClick={() => onRetry(message)}
              className="inline-flex items-center gap-1 rounded bg-red-700 px-2 py-0.5 text-[11px] font-bold text-white hover:bg-red-800"
            >
              <RotateCcw className="h-3 w-3" />
              Thử lại
            </button>
          )}
        </div>
      );
    }

    if (status === 'seen') {
      return (
        <span
          data-testid="msg-status-seen"
          className="inline-flex items-center gap-0.5 text-[11px] font-medium text-emerald-700"
        >
          <CheckCheck className="h-3.5 w-3.5" />
          Đã xem
        </span>
      );
    }

    if (status === 'delivered') {
      return (
        <span
          data-testid="msg-status-delivered"
          className="inline-flex items-center gap-0.5 text-[11px] text-stone-500"
        >
          <CheckCheck className="h-3.5 w-3.5" />
          Đã nhận
        </span>
      );
    }

    return (
      <span
        data-testid="msg-status-sent"
        className="inline-flex items-center gap-0.5 text-[11px] text-stone-500"
      >
        <Check className="h-3 w-3" />
        Đã gửi
      </span>
    );
  };

  return (
    <div
      id={`chat-msg-${message.id}`}
      data-testid="chat-message-item"
      data-message-id={message.id}
      data-delivery-status={status}
      className={`group relative flex gap-2.5 px-3 py-1.5 transition-colors hover:bg-stone-200/25 ${
        isOwn ? 'flex-row-reverse' : 'flex-row'
      }`}
    >
      {/* Avatar */}
      <div
        className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold shadow-sm ${
          isTeacherOrAdmin
            ? 'bg-gradient-to-br from-red-800 to-red-950 text-amber-100 ring-2 ring-amber-400/60'
            : isOwn
            ? 'bg-red-100 text-red-900 border border-red-200'
            : 'bg-stone-200 text-stone-700 border border-stone-300'
        }`}
        title={message.sender_name}
      >
        {getInitials(message.sender_name)}
      </div>

      {/* Bubble Container */}
      <div className={`flex min-w-0 max-w-[82%] sm:max-w-[72%] flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
        {/* Sender header */}
        <div className="mb-1 flex flex-wrap items-center gap-1.5 px-1">
          <span className="text-xs font-semibold text-stone-700">
            {isOwn ? 'Bạn' : message.sender_name}
          </span>
          {renderRoleBadge()}
        </div>

        {/* Message Bubble */}
        <div
          className={`relative max-w-full overflow-hidden rounded-2xl px-3.5 py-2.5 shadow-sm transition-all ${
            status === 'failed'
              ? 'border-2 border-red-300 bg-red-50/90 text-stone-900'
              : isOwn
              ? 'rounded-tr-sm border border-[#E7C8C2] bg-[#FBF1EE] text-stone-900'
              : 'rounded-tl-sm border border-[#E7E2DA] bg-white text-stone-900'
          }`}
        >
          {/* Reply quote block */}
          {message.replyTo && message.replyTo.content && (
            <div className="mb-2 rounded-lg border-l-4 border-red-700 bg-stone-900/5 px-2.5 py-1.5 text-xs">
              <p className="font-bold text-red-900">
                Trả lời {message.replyTo.senderName || 'tin nhắn'}
              </p>
              <p className="line-clamp-2 text-stone-600">{message.replyTo.content}</p>
            </div>
          )}

          {/* Main text */}
          {message.content && (
            <p
              data-testid="chat-message-text"
              className="whitespace-pre-wrap break-words text-[14.5px] leading-relaxed text-stone-900"
            >
              {message.content}
            </p>
          )}

          {/* Attachment */}
          <AttachmentPreview attachment={message.attachment} isOwn={isOwn} />

          {/* Timestamp & Status Footer */}
          <div className="mt-1.5 flex items-center justify-end gap-2 text-[11px] text-stone-500">
            <span className="font-mono text-[10.5px]">
              {formatChatTimestamp(message.created_at)}
            </span>
            {status !== 'failed' && renderDeliveryStatus()}
          </div>
        </div>

        {/* Failed error banner below bubble */}
        {status === 'failed' && renderDeliveryStatus()}

        {/* Reactions Pill Row */}
        {reactions.length > 0 && (
          <div className="mt-1 flex flex-wrap items-center gap-1 px-1">
            {reactions.map((r) => {
              const hasReacted =
                r.users.includes(currentUserName || '') ||
                r.users.includes(currentUserEmail);
              return (
                <button
                  key={r.emoji}
                  type="button"
                  onClick={() => onReact(message.id, r.emoji)}
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors ${
                    hasReacted
                      ? 'border-red-300 bg-red-50 font-semibold text-red-900'
                      : 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
                  }`}
                >
                  <span>{r.emoji}</span>
                  <span className="text-[11px]">{r.count}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Quick Actions Toolbar (Reply, React, Pin) */}
        {status !== 'sending' && status !== 'failed' && (
          <div
            className={`mt-1 flex items-center gap-1 opacity-85 sm:opacity-0 transition-opacity group-hover:opacity-100 ${
              showEmojiPicker ? '!opacity-100' : ''
            }`}
          >
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowEmojiPicker((prev) => !prev)}
                className="inline-flex items-center gap-1 rounded-md border border-stone-200/80 bg-white px-2 py-0.5 text-[11px] font-medium text-stone-600 shadow-sm hover:bg-stone-50 hover:text-stone-900"
                title="Thả biểu tượng cảm xúc"
              >
                <SmilePlus className="h-3 w-3" />
                <span>Cảm xúc</span>
              </button>

              {showEmojiPicker && (
                <div className="absolute bottom-full left-0 z-20 mb-1 flex items-center gap-1 rounded-full border border-stone-200 bg-white px-2 py-1 shadow-lg">
                  {QUICK_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => {
                        onReact(message.id, emoji);
                        setShowEmojiPicker(false);
                      }}
                      className="rounded-full p-1 text-base transition-transform hover:scale-125 hover:bg-stone-100"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => onReply(message)}
              className="inline-flex items-center gap-1 rounded-md border border-stone-200/80 bg-white px-2 py-0.5 text-[11px] font-medium text-stone-600 shadow-sm hover:bg-stone-50 hover:text-stone-900"
              title="Trả lời tin nhắn này"
            >
              <Reply className="h-3 w-3" />
              <span>Trả lời</span>
            </button>

            {canManagePin && (
              <button
                type="button"
                onClick={() => onPinMessage(message)}
                className="inline-flex items-center gap-1 rounded-md border border-stone-200/80 bg-white px-2 py-0.5 text-[11px] font-medium text-stone-600 shadow-sm hover:bg-amber-50 hover:text-amber-900"
                title="Ghim làm thông báo lớp"
              >
                <Pin className="h-3 w-3" />
                <span>Ghim thông báo</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
