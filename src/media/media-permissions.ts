import type { AuthUser } from '@common/auth-user.js';
import type { MediaRecord } from './schemas/media.schema.js';

// view   -> owner, users in allowedUserIds, admin
// delete -> owner, admin
// manage -> only the owner (changing who can see the file)
export type MediaAccessLevel = 'view' | 'delete' | 'manage';

// The one place that decides who can do what with a media file. Used by
// MediaAccessGuard for the API and by the media bucket policy for presigned
// urls, so both always give the same answer.
export function canAccessMedia(
  user: AuthUser,
  media: MediaRecord,
  level: MediaAccessLevel,
): boolean {
  const isOwner = media.ownerId.equals(user.id);
  const isAdmin = user.role === 'admin';

  if (level === 'manage') {
    return isOwner;
  }
  if (level === 'delete') {
    return isOwner || isAdmin;
  }

  const isAllowed = media.allowedUserIds.some((id) => id.equals(user.id));
  return isOwner || isAdmin || isAllowed;
}
