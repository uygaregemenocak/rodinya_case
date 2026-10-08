import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiPayloadTooLargeResponse,
  ApiProduces,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnsupportedMediaTypeResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { AuthUser } from '@common/auth-user.js';
import { CurrentUser } from '@common/decorators/current-user.decorator.js';
import { ErrorResponseDto } from '@common/swagger/error-response.dto.js';
import { ObjectStorage } from '@storage/object-storage.js';
import { sendObject } from '@storage/send-object.js';
import {
  CurrentMedia,
  MediaAccess,
} from './decorators/media-access.decorator.js';
import {
  MediaListResponseDto,
  MediaResponseDto,
} from './dto/media-response.dto.js';
import { PaginationQueryDto } from './dto/pagination-query.dto.js';
import { PermissionsResponseDto } from './dto/permissions-response.dto.js';
import { UpdatePermissionDto } from './dto/update-permission.dto.js';
import { MediaService } from './media.service.js';
import { MEDIA_BUCKET, type MediaRecord } from './schemas/media.schema.js';
import type { UploadedMediaFile } from './upload/media-storage.engine.js';
import { getContentDisposition } from './utils/file-name.utils.js';

@ApiTags('Media')
@ApiBearerAuth()
@ApiUnauthorizedResponse({
  type: ErrorResponseDto,
  description: 'Missing or invalid access token',
})
@Controller('media')
export class MediaController {
  constructor(
    private readonly mediaService: MediaService,
    private readonly storage: ObjectStorage,
  ) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload a JPEG image (max 5MB)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiCreatedResponse({ type: MediaResponseDto })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'No file sent',
  })
  @ApiPayloadTooLargeResponse({
    type: ErrorResponseDto,
    description: 'File is too big',
  })
  @ApiUnsupportedMediaTypeResponse({
    type: ErrorResponseDto,
    description: 'File is not a JPEG',
  })
  async upload(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file?: UploadedMediaFile,
  ): Promise<MediaResponseDto> {
    if (!file) {
      throw new BadRequestException(
        'Please send a JPEG file in the "file" field',
      );
    }
    const media = await this.mediaService.create(user, file);
    return this.mediaService.toResponse(media, user);
  }

  @Get('my')
  @ApiOperation({ summary: 'List my uploads, newest first' })
  @ApiOkResponse({ type: MediaListResponseDto })
  getMyMedia(
    @CurrentUser() user: AuthUser,
    @Query() query: PaginationQueryDto,
  ) {
    return this.mediaService.findMyMedia(user, query.page, query.limit);
  }

  @Get('shared')
  @ApiOperation({ summary: 'List images other users shared with me' })
  @ApiOkResponse({ type: MediaListResponseDto })
  getSharedWithMe(
    @CurrentUser() user: AuthUser,
    @Query() query: PaginationQueryDto,
  ) {
    return this.mediaService.findSharedWithMe(user, query.page, query.limit);
  }

  @Get(':id')
  @MediaAccess('view')
  @ApiOperation({
    summary: 'Get image details and presigned urls',
    description:
      '`url` can be used in an <img> tag, `downloadUrl` downloads the file. ' +
      'They stop working at `urlExpiresAt`, call this again to get new ones.',
  })
  @ApiOkResponse({ type: MediaResponseDto })
  getOne(
    @CurrentUser() user: AuthUser,
    @CurrentMedia() media: MediaRecord,
  ): MediaResponseDto {
    return this.mediaService.toResponse(media, user);
  }

  @Get(':id/download')
  @MediaAccess('view')
  @ApiOperation({ summary: 'Download the image through the API' })
  @ApiProduces('image/jpeg')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  download(
    @CurrentMedia() media: MediaRecord,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    return sendObject(req, res, this.storage, MEDIA_BUCKET, media.filePath, {
      // private: no shared caches. no-cache: browser has to check the etag
      cacheControl: 'private, no-cache',
      contentDisposition: getContentDisposition(media.fileName, 'attachment'),
    });
  }

  @Delete(':id')
  @MediaAccess('delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an image (owner or admin)' })
  @ApiNoContentResponse({ description: 'Deleted' })
  delete(@CurrentMedia() media: MediaRecord): Promise<void> {
    return this.mediaService.delete(media);
  }

  @Get(':id/permissions')
  @MediaAccess('manage')
  @ApiOperation({ summary: 'List users who can view the image (owner only)' })
  @ApiOkResponse({ type: PermissionsResponseDto })
  getPermissions(
    @CurrentMedia() media: MediaRecord,
  ): Promise<PermissionsResponseDto> {
    return this.mediaService.getPermissions(media);
  }

  @Post(':id/permissions')
  @HttpCode(HttpStatus.OK)
  @MediaAccess('manage')
  @ApiOperation({
    summary: 'Give or take away view access (owner only)',
    description:
      'Removing access works right away for the API. Presigned urls that ' +
      'were already given out keep working until they expire (like S3).',
  })
  @ApiOkResponse({ type: PermissionsResponseDto })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'Invalid body, or the user is the owner',
  })
  updatePermission(
    @CurrentMedia() media: MediaRecord,
    @Body() dto: UpdatePermissionDto,
  ): Promise<PermissionsResponseDto> {
    return this.mediaService.updatePermission(media, dto.userId, dto.action);
  }
}
