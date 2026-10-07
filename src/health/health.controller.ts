import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection } from '@nestjs/mongoose';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import type { Connection } from 'mongoose';
import { constants } from 'node:fs';
import { access, mkdir } from 'node:fs/promises';
import { Public } from '../common/decorators/public.decorator.js';

@ApiTags('Health')
@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly config: ConfigService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Checks the database and the uploads folder' })
  @ApiOkResponse({ description: 'Everything is working' })
  @ApiServiceUnavailableResponse({ description: 'Something is down' })
  async check(@Res({ passthrough: true }) res: Response) {
    const database = (await this.isDatabaseUp()) ? 'up' : 'down';
    const storage = (await this.isStorageWritable()) ? 'up' : 'down';
    const isHealthy = database === 'up' && storage === 'up';

    if (!isHealthy) {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }

    return {
      status: isHealthy ? 'ok' : 'error',
      uptime: Math.round(process.uptime()),
      checks: { database, storage },
    };
  }

  private async isDatabaseUp(): Promise<boolean> {
    try {
      await this.connection.db?.admin().ping();
      return this.connection.readyState === 1;
    } catch {
      return false;
    }
  }

  private async isStorageWritable(): Promise<boolean> {
    const uploadDir = this.config.getOrThrow<string>('UPLOAD_DIR');
    try {
      await mkdir(uploadDir, { recursive: true });
      await access(uploadDir, constants.W_OK);
      return true;
    } catch {
      return false;
    }
  }
}
