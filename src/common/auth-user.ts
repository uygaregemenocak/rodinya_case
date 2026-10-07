import type { Request } from 'express';

export type UserRole = 'user' | 'admin';

//put on request.user after the access token is verified
export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: UserRole;
}

export interface AuthenticatedRequest extends Request {
  user: AuthUser;
}
