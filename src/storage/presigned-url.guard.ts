import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { BucketPolicies } from './bucket-policies.js';
import { UrlPresigner } from './url-presigner.js';

// express 5 gives the *key wildcard as an array of path parts
export function getObjectKey(req: Request): string {
  const key = req.params.key as string | string[] | undefined;
  if (Array.isArray(key)) {
    return key.join('/');
  }
  return key ?? '';
}

// No JWT here. The url is signed for one user, so we check the signature
// first and then whether that user is still allowed to read the file.
@Injectable()
export class PresignedUrlGuard implements CanActivate {
  constructor(
    private readonly presigner: UrlPresigner,
    private readonly bucketPolicies: BucketPolicies,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const bucket = req.params.bucket as string;
    const key = getObjectKey(req);
    const query = req.query as Record<string, unknown>;

    const result = this.presigner.verify(bucket, key, query);
    if (result === 'expired') {
      throw new ForbiddenException('This link has expired');
    }
    if (result === 'invalid') {
      throw new ForbiddenException('Invalid signature');
    }

    // the user id is part of the signature, so it can be trusted here
    const userId = query['X-User-Id'] as string;
    const canRead = await this.bucketPolicies.canRead(bucket, userId, key);
    if (!canRead) {
      throw new ForbiddenException('You do not have access to this file');
    }
    return true;
  }
}
