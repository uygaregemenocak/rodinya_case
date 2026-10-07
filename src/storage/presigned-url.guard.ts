import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { UrlPresigner } from './url-presigner.js';

// express 5 gives the *key wildcard as an array of path parts
export function getObjectKey(req: Request): string {
  const key = req.params.key as string | string[] | undefined;
  if (Array.isArray(key)) {
    return key.join('/');
  }
  return key ?? '';
}

// No JWT here, the signature in the url is the only thing that's checked.
@Injectable()
export class PresignedUrlGuard implements CanActivate {
  constructor(private readonly presigner: UrlPresigner) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const bucket = req.params.bucket as string;
    const query = req.query as Record<string, unknown>;

    const result = this.presigner.verify(bucket, getObjectKey(req), query);
    if (result === 'expired') {
      throw new ForbiddenException('This link has expired');
    }
    if (result === 'invalid') {
      throw new ForbiddenException('Invalid signature');
    }
    return true;
  }
}
