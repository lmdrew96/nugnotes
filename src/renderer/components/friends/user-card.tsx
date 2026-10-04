import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

interface UserCardProps {
  username: string;
  displayName: string;
  avatarUrl?: string;
  isOnline?: boolean;
  action?: ReactNode;
  subtitle?: string;
  className?: string;
}

export function UserCard({
  username,
  displayName,
  avatarUrl,
  isOnline,
  action,
  subtitle,
  className,
}: UserCardProps) {
  // Get initials for avatar fallback
  const initials = displayName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg border border-[var(--glass-border)] glass-light p-3 transition-colors hover:bg-[var(--glass-bg)]',
        className,
      )}
    >
      {/* Avatar */}
      <div className="relative shrink-0">
        {avatarUrl ? (
          <img src={avatarUrl} alt={displayName} className="h-10 w-10 rounded-full object-cover" />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--glass-bg)] text-sm font-medium text-foreground">
            {initials}
          </div>
        )}
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
