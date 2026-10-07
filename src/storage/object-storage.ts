import type { Readable } from 'node:stream';

export interface ObjectInfo {
  bucket: string;
  key: string;
  size: number;
  contentType: string;
  lastModified: Date;
  etag: string;
}

// both ends are inclusive, same as the HTTP Range header
export interface ByteRange {
  start: number;
  end: number;
}

export interface StoredObject extends ObjectInfo {
  body: Readable;
}

export class ObjectNotFoundError extends Error {
  constructor(bucket: string, key: string) {
    super(`Object not found: ${bucket}/${key}`);
  }
}

export class InvalidObjectKeyError extends Error {
  constructor(key: string) {
    super(`Invalid object key: ${key}`);
  }
}

// A small S3-like interface. The rest of the app only talks to this, so the
// local disk version can be replaced with a real S3 client later.
export abstract class ObjectStorage {
  abstract putObject(
    bucket: string,
    key: string,
    body: Readable,
  ): Promise<number>;

  // returns null when the object doesn't exist
  abstract headObject(bucket: string, key: string): Promise<ObjectInfo | null>;

  // throws ObjectNotFoundError when the object doesn't exist
  abstract getObject(
    bucket: string,
    key: string,
    range?: ByteRange,
  ): Promise<StoredObject>;

  // deleting something that isn't there is not an error (same as S3)
  abstract deleteObject(bucket: string, key: string): Promise<void>;
}
