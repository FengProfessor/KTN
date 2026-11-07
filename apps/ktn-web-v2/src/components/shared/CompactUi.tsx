import React from 'react';
import { LucideIcon, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CompactPageHeaderProps {
  title: string;
  subtitle?: React.ReactNode;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  testId?: string;
  subtitleTestId?: string;
  className?: string;
}

export const CompactPageHeader: React.FC<CompactPageHeaderProps> = ({
  title,
  subtitle,
  badge,
  actions,
  testId,
  subtitleTestId,
  className,
}) => {
  return (
    <div
      data-testid={testId}
      className={cn(
        'flex flex-wrap items-center justify-between gap-2 rounded-xl border border-stone-200/90 bg-white px-3.5 py-2.5 shadow-2xs',
        className
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="truncate font-display text-base font-bold text-stone-900 sm:text-lg">
            {title}
          </h1>
          {badge}
        </div>
        {subtitle && (
          <p
            data-testid={subtitleTestId}
            className="mt-0.5 truncate text-xs font-medium text-stone-500"
          >
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
    </div>
  );
};

export interface PrimaryActionCardProps {
  eyebrow?: string;
  title: string;
  subtitle?: React.ReactNode;
  progressPercent?: number | null;
  progressLabel?: string;
  ctaLabel: string;
  ctaIcon?: LucideIcon;
  ctaTestId?: string;
  onCtaClick: () => void;
  secondaryAction?: React.ReactNode;
  variant?: 'crimson' | 'emerald' | 'dark';
  testId?: string;
}

export const PrimaryActionCard: React.FC<PrimaryActionCardProps> = ({
  eyebrow,
  title,
  subtitle,
  progressPercent,
  progressLabel,
  ctaLabel,
  ctaIcon: CtaIcon,
  ctaTestId,
  onCtaClick,
  secondaryAction,
  variant = 'crimson',
  testId,
}) => {
  const bgStyles =
    variant === 'emerald'
      ? 'border-emerald-200 bg-emerald-50/70'
      : variant === 'dark'
      ? 'border-stone-800 bg-stone-900 text-white'
      : 'border-red-200/80 bg-gradient-to-r from-red-900 to-red-800 text-white';

  const isLight = variant === 'emerald';

  return (
    <section
      data-testid={testId}
      className={cn(
        'rounded-xl border p-3 sm:p-4 shadow-2xs transition-all',
        bgStyles
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          {eyebrow && (
            <p
              className={cn(
                'truncate text-[11px] font-bold uppercase tracking-wider',
                isLight ? 'text-emerald-800' : 'text-amber-300'
              )}
            >
              {eyebrow}
            </p>
          )}
          <h2
            className={cn(
              'mt-0.5 truncate font-display text-sm font-bold sm:text-base',
              isLight ? 'text-stone-900' : 'text-white'
            )}
          >
            {title}
          </h2>
          {subtitle && (
            <p
              className={cn(
                'mt-0.5 truncate text-xs',
                isLight ? 'text-stone-600' : 'text-red-100'
              )}
            >
              {subtitle}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {secondaryAction}
          <button
            type="button"
            data-testid={ctaTestId}
            onClick={onCtaClick}
            className={cn(
              'inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-extrabold shadow-2xs transition-colors',
              isLight
                ? 'bg-emerald-700 text-white hover:bg-emerald-800'
                : 'bg-amber-400 text-stone-950 hover:bg-amber-300'
            )}
          >
            {CtaIcon && <CtaIcon className="h-4 w-4 shrink-0" />}
            <span>{ctaLabel}</span>
          </button>
        </div>
      </div>

      {typeof progressPercent === 'number' && (
        <div className="mt-2.5 flex items-center gap-2.5">
          <div
            className={cn(
              'h-1.5 flex-1 overflow-hidden rounded-full',
              isLight ? 'bg-emerald-200' : 'bg-white/20'
            )}
          >
            <div
              className={cn(
                'h-full rounded-full transition-all duration-300',
                isLight ? 'bg-emerald-700' : 'bg-amber-400'
              )}
              style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
            />
          </div>
          {progressLabel && (
            <span
              className={cn(
                'shrink-0 text-[11px] font-bold',
                isLight ? 'text-emerald-900' : 'text-amber-200'
              )}
            >
              {progressLabel}
            </span>
          )}
        </div>
      )}
    </section>
  );
};

export interface QuickActionTileProps {
  icon: LucideIcon;
  label: string;
  status?: string;
  badgeCount?: number;
  accent?: 'red' | 'emerald' | 'amber' | 'blue' | 'stone';
  onClick: () => void;
  testId?: string;
}

export const QuickActionTile: React.FC<QuickActionTileProps> = ({
  icon: Icon,
  label,
  status,
  badgeCount,
  accent = 'red',
  onClick,
  testId,
}) => {
  const iconStyles: Record<NonNullable<QuickActionTileProps['accent']>, string> = {
    red: 'bg-red-50 text-red-800',
    emerald: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-800',
    blue: 'bg-blue-50 text-blue-700',
    stone: 'bg-stone-100 text-stone-800',
  };

  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className="group relative flex min-h-[58px] w-full items-center gap-2.5 rounded-xl border border-stone-200/90 bg-white p-2.5 text-left shadow-2xs transition-all hover:border-red-300 hover:bg-red-50/30 active:scale-[0.99]"
    >
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg sm:h-9 sm:w-9',
          iconStyles[accent]
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-1">
          <p className="truncate font-display text-xs font-bold text-stone-900 sm:text-[13px]">
            {label}
          </p>
          {badgeCount && badgeCount > 0 ? (
            <UnreadIndicator count={badgeCount} />
          ) : null}
        </div>
        {status && (
          <p className="mt-0.5 truncate text-[11px] font-medium text-stone-500">
            {status}
          </p>
        )}
      </div>
      <ChevronRight className="hidden h-3.5 w-3.5 shrink-0 text-stone-300 group-hover:text-red-800 sm:block" />
    </button>
  );
};

export interface SectionHeadingProps {
  title: string;
  count?: number | string;
  actionLabel?: string;
  onAction?: () => void;
  actionTestId?: string;
}

export const SectionHeading: React.FC<SectionHeadingProps> = ({
  title,
  count,
  actionLabel,
  onAction,
  actionTestId,
}) => {
  return (
    <div className="flex items-center justify-between gap-2 px-0.5">
      <div className="flex items-center gap-1.5">
        <h2 className="font-display text-[13px] font-bold text-stone-900 sm:text-sm">
          {title}
        </h2>
        {count !== undefined && (
          <span className="rounded-full bg-stone-200/80 px-2 py-0.5 text-[10px] font-bold text-stone-700">
            {count}
          </span>
        )}
      </div>
      {actionLabel && onAction && (
        <button
          type="button"
          data-testid={actionTestId}
          onClick={onAction}
          className="text-xs font-bold text-red-800 hover:underline"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
};

export const UnreadIndicator: React.FC<{ count?: number; dotOnly?: boolean }> = ({
  count,
  dotOnly,
}) => {
  if (dotOnly) {
    return <span className="h-2 w-2 shrink-0 rounded-full bg-red-600" />;
  }
  if (!count || count <= 0) return null;
  return (
    <span className="inline-flex h-4 min-w-[16px] shrink-0 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
      {count > 99 ? '99+' : count}
    </span>
  );
};

export interface CompactListItemProps {
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
  meta?: string;
  badge?: React.ReactNode;
  unread?: boolean;
  onClick?: () => void;
  rightAction?: React.ReactNode;
  testId?: string;
}

export const CompactListItem: React.FC<CompactListItemProps> = ({
  icon,
  title,
  subtitle,
  meta,
  badge,
  unread,
  onClick,
  rightAction,
  testId,
}) => {
  const Wrapper = onClick ? 'button' : 'div';
  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      data-testid={testId}
      onClick={onClick}
      className={cn(
        'flex w-full items-center justify-between gap-2.5 px-3 py-2.5 text-left transition-colors',
        onClick && 'cursor-pointer hover:bg-stone-50',
        unread && 'bg-red-50/40 hover:bg-red-50/70'
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        {icon && <div className="shrink-0">{icon}</div>}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {unread && <UnreadIndicator dotOnly />}
            <p
              className={cn(
                'truncate text-xs text-stone-900 sm:text-[13px]',
                unread ? 'font-bold' : 'font-semibold'
              )}
            >
              {title}
            </p>
            {badge}
          </div>
          {subtitle && (
            <p className="mt-0.5 truncate text-[11px] text-stone-500">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {meta && (
          <span className="text-[10.5px] font-medium text-stone-400">{meta}</span>
        )}
        {rightAction}
      </div>
    </Wrapper>
  );
};

export const MobileTaskList: React.FC<{
  children: React.ReactNode;
  className?: string;
  testId?: string;
}> = ({ children, className, testId }) => {
  return (
    <div
      data-testid={testId}
      className={cn(
        'divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200/90 bg-white shadow-2xs',
        className
      )}
    >
      {children}
    </div>
  );
};

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  testId?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  testId,
}) => {
  return (
    <div
      data-testid={testId}
      className="flex flex-col items-center justify-center rounded-xl border border-stone-200/80 bg-white px-4 py-6 text-center"
    >
      {Icon && (
        <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-stone-100 text-stone-500">
          <Icon className="h-4 w-4" />
        </div>
      )}
      <p className="font-display text-xs font-bold text-stone-800 sm:text-sm">{title}</p>
      {description && (
        <p className="mt-0.5 max-w-xs text-[11px] text-stone-500">{description}</p>
      )}
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-2.5 inline-flex min-h-[38px] items-center justify-center rounded-lg bg-red-800 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-red-900"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
};
