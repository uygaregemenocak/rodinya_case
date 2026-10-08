import {
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { Transform, TransformCallback } from 'node:stream';

// every jpeg file starts with these bytes
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);

// Sits between the upload stream and the disk and checks the first bytes of
// the file (the Content-Type header can't be trusted). In the upload route
// multer already cuts the file off at MAX_FILE_SIZE, the size check here is
// only a backup in case the validator is used somewhere without multer.
export class JpegValidator extends Transform {
  private bytesReceived = 0;
  private firstBytes = Buffer.alloc(0);
  private isChecked = false;

  constructor(private readonly maxSize: number) {
    super();
  }

  _transform(chunk: Buffer, encoding: string, callback: TransformCallback) {
    this.bytesReceived += chunk.length;
    if (this.bytesReceived > this.maxSize) {
      return callback(
        new PayloadTooLargeException(
          `File is larger than ${this.maxSize} bytes`,
        ),
      );
    }

    if (this.isChecked) {
      return callback(null, chunk);
    }

    // the signature can be split over more than one chunk, so collect first
    this.firstBytes = Buffer.concat([this.firstBytes, chunk]);
    if (this.firstBytes.length < JPEG_SIGNATURE.length) {
      return callback();
    }

    const signature = this.firstBytes.subarray(0, JPEG_SIGNATURE.length);
    if (!signature.equals(JPEG_SIGNATURE)) {
      return callback(notJpegError());
    }

    this.isChecked = true;
    callback(null, this.firstBytes);
  }

  _flush(callback: TransformCallback) {
    // file ended before we could even read the signature
    if (!this.isChecked) {
      return callback(notJpegError());
    }
    callback();
  }
}

export function notJpegError() {
  return new UnsupportedMediaTypeException('Only JPEG images are accepted');
}
