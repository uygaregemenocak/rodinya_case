import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTestApp,
  registerUser,
  type TestContext,
} from './support/test-app.js';

describe('Auth (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(() => ctx?.close());

  describe('POST /auth/register', () => {
    it('creates the user and returns tokens', async () => {
      const res = await ctx
        .http()
        .post('/auth/register')
        .send({ email: 'New.User@Example.com', password: 'Passw0rd!' })
        .expect(201);

      expect(res.body).toMatchObject({
        tokenType: 'Bearer',
        expiresIn: 900,
        user: { email: 'new.user@example.com', role: 'user' },
      });
      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(res.body.refreshToken).toEqual(expect.any(String));
      expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    });

    it('returns 409 if the email is taken', async () => {
      await ctx
        .http()
        .post('/auth/register')
        .send({ email: 'dupe@example.com', password: 'Passw0rd!' })
        .expect(201);
      await ctx
        .http()
        .post('/auth/register')
        .send({ email: 'DUPE@example.com', password: 'Passw0rd!' })
        .expect(409);
    });

    it.each([
      [{ email: 'not-an-email', password: 'Passw0rd!' }],
      [{ email: 'weak@example.com', password: 'password' }],
      [{ email: 'extra@example.com', password: 'Passw0rd!', role: 'admin' }],
    ])('returns 400 for invalid body %j', async (body) => {
      await ctx.http().post('/auth/register').send(body).expect(400);
    });
  });

  describe('POST /auth/login', () => {
    it('works with correct credentials', async () => {
      const user = await registerUser(ctx);
      const res = await ctx
        .http()
        .post('/auth/login')
        .send({ email: user.email, password: 'Passw0rd!' })
        .expect(200);
      expect(res.body.user.id).toBe(user.id);
    });

    it('gives the same error for wrong password and unknown email', async () => {
      const user = await registerUser(ctx);
      const wrong = await ctx
        .http()
        .post('/auth/login')
        .send({ email: user.email, password: 'Wr0ngPassword' })
        .expect(401);
      const unknown = await ctx
        .http()
        .post('/auth/login')
        .send({ email: 'ghost@example.com', password: 'Passw0rd!' })
        .expect(401);
      expect(wrong.body.message).toBe(unknown.body.message);
    });
  });

  describe('POST /auth/refresh', () => {
    it('returns a new refresh token', async () => {
      const user = await registerUser(ctx);
      const res = await ctx
        .http()
        .post('/auth/refresh')
        .send({ refreshToken: user.refreshToken })
        .expect(200);
      expect(res.body.refreshToken).not.toBe(user.refreshToken);

      await ctx
        .http()
        .get('/users/me')
        .auth(res.body.accessToken, { type: 'bearer' })
        .expect(200);
    });

    it('revokes the session when an old refresh token is reused', async () => {
      const user = await registerUser(ctx);
      const rotated = await ctx
        .http()
        .post('/auth/refresh')
        .send({ refreshToken: user.refreshToken })
        .expect(200);

      // using the old token again
      await ctx
        .http()
        .post('/auth/refresh')
        .send({ refreshToken: user.refreshToken })
        .expect(401);
      // now the new one is revoked too
      await ctx
        .http()
        .post('/auth/refresh')
        .send({ refreshToken: rotated.body.refreshToken })
        .expect(401);
    });

    it('only one of two parallel refreshes succeeds', async () => {
      const user = await registerUser(ctx);
      const results = await Promise.all([
        ctx
          .http()
          .post('/auth/refresh')
          .send({ refreshToken: user.refreshToken }),
        ctx
          .http()
          .post('/auth/refresh')
          .send({ refreshToken: user.refreshToken }),
      ]);
      expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([
        200, 401,
      ]);
    });

    it('does not accept an access token', async () => {
      const user = await registerUser(ctx);
      await ctx
        .http()
        .post('/auth/refresh')
        .send({ refreshToken: user.accessToken })
        .expect(401);
    });
  });

  describe('POST /auth/logout', () => {
    it('revokes the session', async () => {
      const user = await registerUser(ctx);
      await ctx
        .http()
        .post('/auth/logout')
        .send({ refreshToken: user.refreshToken })
        .expect(204);
      await ctx
        .http()
        .post('/auth/refresh')
        .send({ refreshToken: user.refreshToken })
        .expect(401);
    });
  });

  describe('GET /users/me', () => {
    it('returns the current user', async () => {
      const user = await registerUser(ctx);
      const res = await ctx
        .http()
        .get('/users/me')
        .auth(user.accessToken, { type: 'bearer' })
        .expect(200);
      expect(res.body).toMatchObject({
        id: user.id,
        email: user.email,
        role: 'user',
      });
    });

    it('needs a valid access token', async () => {
      await ctx.http().get('/users/me').expect(401);
      await ctx
        .http()
        .get('/users/me')
        .auth('garbage', { type: 'bearer' })
        .expect(401);
      const user = await registerUser(ctx);
      // refresh token should not work as an access token
      await ctx
        .http()
        .get('/users/me')
        .auth(user.refreshToken, { type: 'bearer' })
        .expect(401);
    });
  });

  describe('GET /health', () => {
    it('returns ok', async () => {
      const res = await ctx.http().get('/health').expect(200);
      expect(res.body).toMatchObject({
        status: 'ok',
        checks: { database: 'up', storage: 'up' },
      });
    });
  });
});
