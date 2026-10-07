import {
  applyDecorators,
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import {
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiParam,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../../common/swagger/error-response.dto.js';
import {
  MEDIA_ACCESS_KEY,
  MediaAccessGuard,
  MediaAccessLevel,
  MediaRequest,
} from '../guards/media-access.guard.js';
import type { MediaRecord } from '../schemas/media.schema.js';

// Used on /media/:id routes. Adds the guard and the 403/404 swagger docs.
export function MediaAccess(level: MediaAccessLevel) {
  return applyDecorators(
    SetMetadata(MEDIA_ACCESS_KEY, level),
    UseGuards(MediaAccessGuard),
    ApiParam({ name: 'id', example: '66f1c0d9e4b0a1b2c3d4e5f7' }),
    ApiForbiddenResponse({
      type: ErrorResponseDto,
      description: 'No access to this media',
    }),
    ApiNotFoundResponse({
      type: ErrorResponseDto,
      description: 'Media not found',
    }),
  );
}

// The media that MediaAccessGuard already loaded
export const CurrentMedia = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): MediaRecord => {
    const request = ctx.switchToHttp().getRequest<MediaRequest>();
    if (!request.media) {
      throw new Error('@CurrentMedia() needs @MediaAccess() on the route');
    }
    return request.media;
  },
);
