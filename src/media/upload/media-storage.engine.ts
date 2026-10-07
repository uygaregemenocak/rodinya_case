import type { Request } from 'express';
import { Types } from 'mongoose';
import type { StorageEngine } from 'multer';
import { pipeline } from 'node:stream';
import type { AuthenticatedRequest } from '../../common/auth-user.js';
import type { ObjectStorage } from '../../storage/object-storage.js';
import { MEDIA_BUCKET } from '../schemas/media.schema.js';
import { JpegValidator } from './jpeg-validator.js';

// extra fields we add to req.file
export interface UploadedMediaFile extends Express.Multer.File {
  mediaId: string;
  key: string;
}

// Custom multer storage. The file goes straight from the request into the
// object storage while being validated, so it is never fully kept in memory.
export class MediaStorageEngine implements StorageEngine {
  constructor(
    private readonly storage: ObjectStorage,
    private readonly maxFileSize: number,
  ) {}

  _handleFile(
    req: Request,
    file: Express.Multer.File,
    callback: (error?: unknown, info?: Partial<UploadedMediaFile>) => void,
  ) {
    const { user } = req as AuthenticatedRequest;

    // create the id now so the file name and the db _id are the same
    const mediaId = new Types.ObjectId().toHexString();
    const key = `${user.id}/${mediaId}.jpg`;

    // if any step fails (e.g. client disconnects) pipeline destroys the others
    const validatedStream = pipeline(
      file.stream,
      new JpegValidator(this.maxFileSize),
      () => {},
    );

    this.storage
      .putObject(MEDIA_BUCKET, key, validatedStream)
      .then((size) => callback(null, { mediaId, key, path: key, size }))
      .catch((error) => callback(error));
  }

  _removeFile(
    req: Request,
    file: Partial<UploadedMediaFile>,
    callback: (error: Error | null) => void,
  ) {
    const key = file.key ?? file.path;
    if (!key) {
      return callback(null);
    }

    this.storage
      .deleteObject(MEDIA_BUCKET, key)
      .then(() => callback(null))
      .catch((error) => callback(error));
  }
}
