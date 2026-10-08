import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';

export const STORAGE_ROUTE = 'storage';
const ALGORITHM = 'HMAC-SHA256';

// Expiry is rounded up to the next full minute. That way the same image gets
// the exact same URL for a while and the browser can use its cache instead of
// downloading it again on every page load.
const EXPIRY_ROUNDING_SECONDS = 60;

export interface PresignedUrl {
  url: string;
  expiresAt: Date;
}

export interface PresignOptions {
  // the user the url is for, their access is checked again on every request
  userId: string;
  contentDisposition?: string;
}

export type SignatureCheckResult = 'valid' | 'expired' | 'invalid';

// Creates and checks presigned GET urls, same idea as S3. The url works
// without an Authorization header so it can be used directly in an <img> tag.
// It is signed for one user, and like in S3 that user's permissions are
// checked again when the url is used (see BucketPolicies).
@Injectable()
export class UrlPresigner {
  private readonly secret: string;
  private readonly defaultTtl: number;
  private readonly baseUrl: string;

  constructor(config: ConfigService) {
    this.secret = config.getOrThrow<string>('STORAGE_SIGNING_SECRET');
    this.defaultTtl = config.getOrThrow<number>('PRESIGNED_URL_TTL');

    const port = config.getOrThrow<number>('PORT');
    const publicUrl = config.get<string>('PUBLIC_BASE_URL');
    this.baseUrl = (publicUrl ?? `http://localhost:${port}`).replace(
      /\/+$/,
      '',
    );
  }

  presignGetObject(
    bucket: string,
    key: string,
    options: PresignOptions,
  ): PresignedUrl {
    const { userId, contentDisposition } = options;
    const now = Math.floor(Date.now() / 1000);
    const expires =
      Math.ceil((now + this.defaultTtl) / EXPIRY_ROUNDING_SECONDS) *
      EXPIRY_ROUNDING_SECONDS;

    const params = new URLSearchParams();
    params.set('X-Algorithm', ALGORITHM);
    params.set('X-User-Id', userId);
    params.set('X-Expires', String(expires));
    if (contentDisposition) {
      params.set('response-content-disposition', contentDisposition);
    }
    params.set(
      'X-Signature',
      this.sign(bucket, key, userId, expires, contentDisposition),
    );

    return {
      url: `${this.baseUrl}${objectPath(bucket, key)}?${params.toString()}`,
      expiresAt: new Date(expires * 1000),
    };
  }

  verify(
    bucket: string,
    key: string,
    query: Record<string, unknown>,
  ): SignatureCheckResult {
    const algorithm = query['X-Algorithm'];
    const userId = query['X-User-Id'];
    const expires = String(query['X-Expires']);
    const signature = String(query['X-Signature']);
    const disposition = query['response-content-disposition'];

    const hasValidFormat =
      algorithm === ALGORITHM &&
      typeof userId === 'string' &&
      userId.length > 0 &&
      /^\d{1,12}$/.test(expires) &&
      (disposition === undefined || typeof disposition === 'string');
    if (!hasValidFormat) {
      return 'invalid';
    }

    const expected = this.sign(
      bucket,
      key,
      userId,
      Number(expires),
      disposition,
    );
    if (!safeCompare(signature, expected)) {
      return 'invalid';
    }

    const now = Math.floor(Date.now() / 1000);
    if (Number(expires) < now) {
      return 'expired';
    }
    return 'valid';
  }

  private sign(
    bucket: string,
    key: string,
    userId: string,
    expires: number,
    contentDisposition = '',
  ): string {
    const stringToSign = [
      ALGORITHM,
      'GET',
      objectPath(bucket, key),
      userId,
      expires,
      contentDisposition,
    ].join('\n');

    return createHmac('sha256', this.secret)
      .update(stringToSign)
      .digest('base64url');
  }
}

function objectPath(bucket: string, key: string): string {
  const encodedKey = key.split('/').map(encodeURIComponent).join('/');
  return `/${STORAGE_ROUTE}/${encodeURIComponent(bucket)}/${encodedKey}`;
}

// constant time compare so the signature can't be guessed byte by byte
function safeCompare(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) {
    return false;
  }
  return timingSafeEqual(bufferA, bufferB);
}
