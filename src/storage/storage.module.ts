import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BucketPolicies } from './bucket-policies.js';
import { LocalObjectStorage } from './local-object-storage.js';
import { ObjectStorage } from './object-storage.js';
import { PresignedUrlGuard } from './presigned-url.guard.js';
import { StorageController } from './storage.controller.js';
import { UrlPresigner } from './url-presigner.js';

@Module({
  controllers: [StorageController],
  providers: [
    {
      // to move to S3 later, only this provider needs to change
      provide: ObjectStorage,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new LocalObjectStorage(config.getOrThrow<string>('UPLOAD_DIR')),
    },
    UrlPresigner,
    BucketPolicies,
    PresignedUrlGuard,
  ],
  exports: [ObjectStorage, UrlPresigner, BucketPolicies],
})
export class StorageModule {}
