import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import * as argon2 from 'argon2';
import { Model, Types } from 'mongoose';
import { createHash, randomUUID } from 'node:crypto';
import type { AccessTokenPayload } from '@common/auth-user.js';
import { toUserResponse } from '@users/dto/user-response.dto.js';
import type { UserRecord } from '@users/schemas/user.schema.js';
import { UsersService } from '@users/users.service.js';
import type { AuthResponseDto } from './dto/auth-response.dto.js';
import { Session } from './schemas/session.schema.js';

interface RefreshTokenPayload {
  sub: string; // user id
  sid: string; // session id
  jti: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  private readonly accessSecret: string;
  private readonly refreshSecret: string;
  private readonly accessTtl: number;
  private readonly refreshTtl: number;

  // Used when the email doesn't exist, so a failed login takes about the
  // same time either way and you can't guess which emails are registered.
  private readonly dummyHash: Promise<string>;

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    @InjectModel(Session.name) private readonly sessionModel: Model<Session>,
    config: ConfigService,
  ) {
    this.accessSecret = config.getOrThrow<string>('JWT_ACCESS_SECRET');
    this.refreshSecret = config.getOrThrow<string>('JWT_REFRESH_SECRET');
    this.accessTtl = config.getOrThrow<number>('JWT_ACCESS_TTL');
    this.refreshTtl = config.getOrThrow<number>('JWT_REFRESH_TTL');
    this.dummyHash = argon2.hash(randomUUID());
  }

  async register(
    email: string,
    password: string,
    userAgent?: string,
  ): Promise<AuthResponseDto> {
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const user = await this.usersService.create(email, passwordHash);
    return this.createSession(user, userAgent);
  }

  async login(
    email: string,
    password: string,
    userAgent?: string,
  ): Promise<AuthResponseDto> {
    const user = await this.usersService.findByEmailWithPassword(email);
    const hash = user ? user.passwordHash : await this.dummyHash;
    const passwordMatches = await argon2.verify(hash, password);

    if (!user || !passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return this.createSession(user, userAgent);
  }

  async refresh(refreshToken: string): Promise<AuthResponseDto> {
    const payload = await this.verifyRefreshToken(refreshToken);
    const newJti = randomUUID();

    // Only matches if this is still the latest token of the session. Doing
    // the check and the update in one query means two parallel refreshes
    // with the same token can't both succeed.
    const session = await this.sessionModel
      .findOneAndUpdate(
        {
          _id: payload.sid,
          userId: payload.sub,
          tokenHash: hashToken(payload.jti),
          revokedAt: null,
          expiresAt: { $gt: new Date() },
        },
        {
          tokenHash: hashToken(newJti),
          expiresAt: this.refreshExpiryDate(),
        },
        { returnDocument: 'after' },
      )
      .lean()
      .exec();

    if (!session) {
      // The signature was fine but the token is old, so it was already
      // rotated before. Someone is reusing it -> revoke the whole session.
      await this.revokeSession(payload.sid);
      throw new UnauthorizedException('Refresh token is no longer valid');
    }

    const user = await this.usersService.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException('Refresh token is no longer valid');
    }

    return this.issueTokens(user, payload.sid, newJti);
  }

  async logout(refreshToken: string): Promise<void> {
    const payload = await this.verifyRefreshToken(refreshToken);
    await this.sessionModel.updateOne(
      { _id: payload.sid, tokenHash: hashToken(payload.jti), revokedAt: null },
      { revokedAt: new Date() },
    );
  }

  private async createSession(
    user: UserRecord,
    userAgent?: string,
  ): Promise<AuthResponseDto> {
    const jti = randomUUID();
    const session = await this.sessionModel.create({
      userId: user._id,
      tokenHash: hashToken(jti),
      expiresAt: this.refreshExpiryDate(),
      userAgent: userAgent?.slice(0, 256),
    });
    return this.issueTokens(user, session._id.toString(), jti);
  }

  private async revokeSession(sessionId: string) {
    const result = await this.sessionModel.updateOne(
      { _id: sessionId, revokedAt: null },
      { revokedAt: new Date() },
    );
    if (result.modifiedCount > 0) {
      this.logger.warn(`Refresh token reuse, revoked session ${sessionId}`);
    }
  }

  private async issueTokens(
    user: UserRecord,
    sessionId: string,
    jti: string,
  ): Promise<AuthResponseDto> {
    const userId = user._id.toString();

    const accessPayload: AccessTokenPayload = {
      sub: userId,
      email: user.email,
      role: user.role,
    };
    const refreshPayload: RefreshTokenPayload = {
      sub: userId,
      sid: sessionId,
      jti,
    };

    const accessToken = await this.jwtService.signAsync(accessPayload, {
      secret: this.accessSecret,
      expiresIn: this.accessTtl,
    });
    const refreshToken = await this.jwtService.signAsync(refreshPayload, {
      secret: this.refreshSecret,
      expiresIn: this.refreshTtl,
    });

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.accessTtl,
      user: toUserResponse(user),
    };
  }

  private async verifyRefreshToken(
    token: string,
  ): Promise<RefreshTokenPayload> {
    let payload: RefreshTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<RefreshTokenPayload>(token, {
        secret: this.refreshSecret,
        algorithms: ['HS256'],
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (
      !Types.ObjectId.isValid(payload.sid) ||
      !Types.ObjectId.isValid(payload.sub)
    ) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    return payload;
  }

  private refreshExpiryDate(): Date {
    return new Date(Date.now() + this.refreshTtl * 1000);
  }
}

function hashToken(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
