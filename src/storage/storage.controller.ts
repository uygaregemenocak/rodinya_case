import {
  Controller,
  Get,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Public } from '@common/decorators/public.decorator.js';
import { ErrorResponseDto } from '@common/swagger/error-response.dto.js';
import { ObjectStorage } from './object-storage.js';
import { getObjectKey, PresignedUrlGuard } from './presigned-url.guard.js';
import { sendObject } from './send-object.js';
import { STORAGE_ROUTE } from './url-presigner.js';

// This is what the presigned urls point to. It only serves single files with
// a valid signature, there is no folder listing or static serving.
@ApiTags('Storage')
@Public()
@UseGuards(PresignedUrlGuard)
@Controller(STORAGE_ROUTE)
export class StorageController {
  constructor(private readonly storage: ObjectStorage) {}

  @Get(':bucket/*key')
  @ApiOperation({
    summary: 'Download a file with a presigned url',
    description:
      "Don't build these urls yourself, use `url` or `downloadUrl` from the media endpoints.",
  })
  @ApiParam({ name: 'bucket', example: 'media' })
  @ApiParam({
    name: 'key',
    example: '66f1c0c4e4b0a1b2c3d4e5f6/66f1c0d9e4b0a1b2c3d4e5f7.jpg',
  })
  @ApiQuery({ name: 'X-Algorithm', example: 'HMAC-SHA256' })
  @ApiQuery({ name: 'X-Expires', description: 'Unix timestamp (seconds)' })
  @ApiQuery({ name: 'response-content-disposition', required: false })
  @ApiQuery({ name: 'X-Signature' })
  @ApiProduces('image/jpeg')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  @ApiForbiddenResponse({
    type: ErrorResponseDto,
    description: 'Invalid or expired signature',
  })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'File was deleted',
  })
  getObject(
    @Param('bucket') bucket: string,
    @Query('X-Expires') expires: string,
    @Query('response-content-disposition')
    contentDisposition: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    // browser can cache it until the link expires
    const secondsLeft = Number(expires) - Math.floor(Date.now() / 1000);

    return sendObject(req, res, this.storage, bucket, getObjectKey(req), {
      cacheControl: `private, max-age=${Math.max(secondsLeft, 0)}`,
      contentDisposition,
      allowCrossOrigin: true,
    });
  }
}
