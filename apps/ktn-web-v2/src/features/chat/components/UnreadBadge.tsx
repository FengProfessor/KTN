import React from 'react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/i18n';

interface UnreadBadgeProps {
  count: number;
  className?: string;
}

export const UnreadBadge: React.FC<UnreadBadgeProps> = ({ count, className }) => {
  const { tr } = useI18n();
  if (!count || count <= 0) return null;

  return (
    <span
      data-testid="unread-badge"
      aria-label={tr(`${count} tin nhắn chưa đọc`, `${count} unread messages`)}
      className={cn(
        'inline-flex min-w-[20px] h-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-[11px] font-bold leading-none text-white shadow-sm',
        className
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
};
