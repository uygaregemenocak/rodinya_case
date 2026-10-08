import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { MulterModule } from '@nestjs/platform-express';
import { ObjectStorage } from '@storage/object-storage.js';
import { StorageModule } from '@storage/storage.module.js';
import { UsersModule } from '@users/users.module.js';
import { MediaAccessGuard } from './guards/media-access.guard.js';
import { MediaController } from './media.controller.js';
import { MediaService } from './media.service.js';
import { Media, MediaSchema } from './schemas/media.schema.js';
import { notJpegError } from './upload/jpeg-validator.js';
import { MediaStorageEngine } from './upload/media-storage.engine.js';

const JPEG_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/pjpeg'];

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Media.name, schema: MediaSchema }]),
    UsersModule,
    StorageModule,
    MulterModule.registerAsync({
      imports: [StorageModule],
      inject: [ObjectStorage, ConfigService],
      useFactory: (storage: ObjectStorage, config: ConfigService) => {
        const maxFileSize = config.getOrThrow<number>('MAX_FILE_SIZE');

        return {
          storage: new MediaStorageEngine(storage, maxFileSize),
          limits: { fileSize: maxFileSize, files: 1, fields: 5 },
          // without this, names like "görsel.jpg" get broken
          defParamCharset: 'utf8',
          // Quick check on the mime type the client sent. The real check
          // (first bytes of the file) happens in JpegValidator.
          fileFilter: (req, file, callback) => {
            if (JPEG_MIME_TYPES.includes(file.mimetype)) {
              callback(null, true);
            } else {
              callback(notJpegError(), false);
            }
          },
        };
      },
    }),
  ],
  controllers: [MediaController],
  providers: [MediaService, MediaAccessGuard],
})
export class MediaModule {}
