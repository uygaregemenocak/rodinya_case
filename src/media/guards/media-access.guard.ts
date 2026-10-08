import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest, AuthUser } from '@common/auth-user.js';
import { MediaService } from '../media.service.js';
import type { MediaRecord } from '../schemas/media.schema.js';

// view   -> owner, users in allowedUserIds, admin
// delete -> owner, admin
// manage -> only the owner (changing who can see the file)
export type MediaAccessLevel = 'view' | 'delete' | 'manage';

export const MEDIA_ACCESS_KEY = 'mediaAccess';

export interface MediaRequest extends AuthenticatedRequest {
  media?: MediaRecord;
}

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

@Injectable()
export class MediaAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly mediaService: MediaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const level = this.reflector.get<MediaAccessLevel>(
      MEDIA_ACCESS_KEY,
      context.getHandler(),
    );
    const request = context.switchToHttp().getRequest<MediaRequest>();

    const media = await this.mediaService.findById(request.params.id as string);
    if (!media) {
      throw new NotFoundException('Media not found');
    }
    if (!canAccessMedia(request.user, media, level)) {
      throw new ForbiddenException('You do not have access to this media');
    }

    // save it on the request so the controller doesn't query it again
    request.media = media;
    return true;
  }
}
