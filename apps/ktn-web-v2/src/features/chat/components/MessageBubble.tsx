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
import { useI18n } from '@/i18n';
import { formatQuotedReplyText, getDisplayMessageCaption } from '../services/chatApi';

const QUICK_EMOJIS = ['👍', '❤️', '👏', '🎉'];

interface MessageBubbleProps {
  message: ChatMessage;
  currentUserEmail: string;
  currentUserName?: string;
  canManagePin: boolean;
  isGroupedWithPrev?: boolean;
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
  isGroupedWithPrev = false,
  onReply,
  onReact,
  onPinMessage,
  onRetry,
}) => {
  const { lang, tr } = useI18n();
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const isOwn =
    String(message.sender_email || '').toLowerCase() ===
    String(currentUserEmail || '').toLowerCase();

  const isTeacherOrAdmin =
    message.sender_role === 'teacher' || message.sender_role === 'admin';

  const status = message.status || 'sent';
  const reactions = Array.isArray(message.reactions) ? message.reactions : [];
  const displayCaption = getDisplayMessageCaption(message);
  const quotedReplyText = message.replyTo?.content
    ? formatQuotedReplyText(message.replyTo.content, undefined, lang)
    : '';
  const isImageAttachment =
    message.attachment?.kind === 'image' ||
    Boolean(
      message.attachment?.url &&
        (/^data:image\//i.test(message.attachment.url) ||
          /\.(png|jpe?g|gif|webp|svg|bmp|heic)(\?|$)/i.test(message.attachment.url))
    );
  const isImageOnlyBubble = isImageAttachment && !displayCaption && !quotedReplyText;

  const renderRoleBadge = () => {
    if (message.sender_role === 'teacher') {
      return (
        <span className="inline-flex items-center gap-0.5 rounded bg-red-800 px-1.5 py-0.5 text-[10px] font-bold text-white">
          <ShieldCheck className="h-2.5 w-2.5" />
          {tr('Giáo viên', 'Teacher')}
        </span>
      );
    }
    if (message.sender_role === 'admin') {
      return (
        <span className="inline-flex items-center gap-0.5 rounded bg-amber-700 px-1.5 py-0.5 text-[10px] font-bold text-white">
          {tr('Học vụ KTN', 'KTN Academic')}
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
          {tr('Đang gửi...', 'Sending...')}
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
            {tr(
              'Chưa gửi được. Tin nhắn vẫn đang được giữ trên thiết bị.',
              'Failed to send. The message is saved on this device.'
            )}
          </span>
          {onRetry && (
            <button
              type="button"
              data-testid="retry-failed-message-btn"
              onClick={() => onRetry(message)}
              className="inline-flex items-center gap-1 rounded bg-red-700 px-2 py-0.5 text-[11px] font-bold text-white hover:bg-red-800"
            >
              <RotateCcw className="h-3 w-3" />
              {tr('Thử lại', 'Retry')}
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
          {tr('Đã xem', 'Seen')}
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
          {tr('Đã nhận', 'Delivered')}
        </span>
      );
    }

    return (
      <span
        data-testid="msg-status-sent"
        className="inline-flex items-center gap-0.5 text-[11px] text-stone-500"
      >
        <Check className="h-3 w-3" />
        {tr('Đã gửi', 'Sent')}
      </span>
    );
  };

  return (
    <div
      id={`chat-msg-${message.id}`}
      data-testid="chat-message-item"
      data-message-id={message.id}
      data-delivery-status={status}
      data-grouped={isGroupedWithPrev ? 'true' : 'false'}
      className={`group relative flex gap-2 px-3 py-1.5 transition-colors hover:bg-stone-200/25 ${
        isOwn ? 'flex-row-reverse' : 'flex-row'
      }`}
    >
      {/* Avatar or Alignment Spacer for Grouped Consecutive Messages */}
      {isGroupedWithPrev ? (
        <div className="w-8 sm:w-9 shrink-0" aria-hidden="true" />
      ) : (
        <div
          className={`mt-0.5 flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold shadow-sm ${
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
      )}

      {/* Bubble Container */}
      <div className={`flex min-w-0 max-w-[84%] sm:max-w-[72%] flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
        {/* Sender header — hidden when grouped with previous message from same sender */}
        {!isGroupedWithPrev && (
          <div
            data-testid="chat-message-sender-header"
            className="mb-1 flex flex-wrap items-center gap-1.5 px-1"
          >
            <span className="text-xs font-semibold text-stone-700">
              {isOwn
                ? tr('Bạn', 'You')
                : message.sender_name === 'Thành viên KTN'
                ? tr('Thành viên KTN', 'KTN Member')
                : message.sender_name}
            </span>
            {renderRoleBadge()}
          </div>
        )}

        {/* Message Bubble */}
        <div
          className={`relative max-w-full overflow-hidden rounded-2xl ${
            isImageOnlyBubble ? 'p-1.5 sm:p-2' : 'px-3.5 py-2.5'
          } shadow-sm transition-all ${
            status === 'failed'
              ? 'border-2 border-red-300 bg-red-50/90 text-stone-900'
              : isOwn
              ? `${isGroupedWithPrev ? 'rounded-2xl' : 'rounded-tr-sm'} border border-[#E7C8C2] bg-[#FBF1EE] text-stone-900`
              : `${isGroupedWithPrev ? 'rounded-2xl' : 'rounded-tl-sm'} border border-[#E7E2DA] bg-white text-stone-900`
          }`}
        >
          {/* Reply quote block */}
          {message.replyTo && quotedReplyText && (
            <div className="mb-2 rounded-lg border-l-4 border-red-700 bg-stone-900/5 px-2.5 py-1.5 text-xs">
              <p className="font-bold text-red-900">
                {tr('Trả lời', 'Reply to')} {message.replyTo.senderName || tr('tin nhắn', 'message')}
              </p>
              <p className="line-clamp-2 text-stone-600">{quotedReplyText}</p>
            </div>
          )}

          {/* Main text (omitted when message is just an auto-generated attachment placeholder) */}
          {displayCaption && (
            <p
              data-testid="chat-message-text"
              className="whitespace-pre-wrap break-words text-[14px] sm:text-[14.5px] leading-relaxed text-stone-900"
            >
              {displayCaption}
            </p>
          )}

          {/* Attachment */}
          <AttachmentPreview
            attachment={message.attachment}
            isOwn={isOwn}
            hasCaption={Boolean(displayCaption || quotedReplyText)}
          />

          {/* Timestamp & Status Footer */}
          <div className="mt-1 flex items-center justify-end gap-1.5 px-0.5 text-[11px] text-stone-500">
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
                title={tr('Thả biểu tượng cảm xúc', 'Add reaction')}
              >
                <SmilePlus className="h-3 w-3" />
                <span>{tr('Cảm xúc', 'React')}</span>
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
              title={tr('Trả lời tin nhắn này', 'Reply to this message')}
            >
              <Reply className="h-3 w-3" />
              <span>{tr('Trả lời', 'Reply')}</span>
            </button>

            {canManagePin && (
              <button
                type="button"
                onClick={() => onPinMessage(message)}
                className="inline-flex items-center gap-1 rounded-md border border-stone-200/80 bg-white px-2 py-0.5 text-[11px] font-medium text-stone-600 shadow-sm hover:bg-amber-50 hover:text-amber-900"
                title={tr('Ghim làm thông báo lớp', 'Pin as class announcement')}
              >
                <Pin className="h-3 w-3" />
                <span>{tr('Ghim thông báo', 'Pin announcement')}</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
