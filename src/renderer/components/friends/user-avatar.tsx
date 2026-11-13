import { CatDisplay } from '@/components/cats/cat-display';
import { isCatVariant } from '@/components/cats/cat-sprites';

interface UserAvatarProps {
  displayName: string;
  avatarUrl?: string;
  /** Their study buddy cat (Settings → Appearance), if they picked one. */
  buddyVariant?: string;
}

/**
 * Someone's 40px round avatar: their study buddy cat if they picked one, else
 * their profile picture, else their initials.
 */
export function UserAvatar({ displayName, avatarUrl, buddyVariant }: UserAvatarProps) {
  if (isCatVariant(buddyVariant)) {
    return (
      <div
        className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-[var(--glass-bg)]"
        title={`${displayName}’s study buddy`}
      >
        <CatDisplay mood="idle" variant={buddyVariant} size="xsmall" />
      </div>
    );
  }
  if (avatarUrl) {
    return (
      <img src={avatarUrl} alt={displayName} className="h-10 w-10 rounded-full object-cover" />
    );
  }
  const initials = displayName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--glass-bg)] text-sm font-medium text-foreground">
      {initials}
    </div>
  );
}
