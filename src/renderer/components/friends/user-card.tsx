import { UserAvatar } from '@/components/friends/user-avatar';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

interface UserCardProps {
  username: string;
  displayName: string;
  avatarUrl?: string;
  buddyVariant?: string;
  isOnline?: boolean;
  action?: ReactNode;
  subtitle?: string;
  className?: string;
}

export function UserCard({
  username,
  displayName,
  avatarUrl,
  buddyVariant,
  isOnline,
  action,
  subtitle,
  className,
}: UserCardProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg border border-[var(--glass-border)] glass-light p-3 transition-colors hover:bg-[var(--glass-bg)]',
        className,
      )}
    >
      {/* Avatar */}
      <div className="relative shrink-0">
        <UserAvatar displayName={displayName} avatarUrl={avatarUrl} buddyVariant={buddyVariant} />
        {isOnline && (
          <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-green-400 ring-2 ring-background" />
        )}
      </div>

      {/* Name + username */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{displayName}</p>
        <p className="truncate text-xs text-muted-foreground">
          @{username}
          {subtitle && <span className="ml-1.5">{subtitle}</span>}
        </p>
      </div>

      {/* Action slot */}
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
