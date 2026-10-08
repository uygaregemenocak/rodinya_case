import { getConnectionToken } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import type { Response } from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTestApp,
  fakeJpeg,
  pathOf,
  PNG_BYTES,
  registerUser,
  TEST_MAX_FILE_SIZE,
  type TestContext,
  type TestUser,
} from './support/test-app.js';

// supertest doesn't read image responses into res.body by default
function binaryParser(
  res: Response,
  done: (err: Error | null, body: Buffer) => void,
) {
  const stream = res as unknown as NodeJS.ReadableStream;
  const chunks: Buffer[] = [];
  stream.on('data', (chunk: Buffer) => chunks.push(chunk));
  stream.on('end', () => done(null, Buffer.concat(chunks)));
}

describe('Media (e2e)', () => {
  let ctx: TestContext;
  let owner: TestUser;
  let friend: TestUser;
  let stranger: TestUser;

  beforeAll(async () => {
    ctx = await createTestApp();
    [owner, friend, stranger] = await Promise.all([
      registerUser(ctx),
      registerUser(ctx),
      registerUser(ctx),
    ]);
  });

  afterAll(() => ctx?.close());

  const upload = (
    user: TestUser,
    bytes: Buffer,
    filename = 'photo.jpg',
    contentType = 'image/jpeg',
  ) =>
    ctx
      .http()
      .post('/media/upload')
      .auth(user.accessToken, { type: 'bearer' })
      .attach('file', bytes, { filename, contentType });

  const uploadOk = async (user: TestUser, bytes = fakeJpeg()) =>
    (await upload(user, bytes).expect(201)).body;

  const grant = (
    mediaId: string,
    userId: string,
    action: 'add' | 'remove',
    as = owner,
  ) =>
    ctx
      .http()
      .post(`/media/${mediaId}/permissions`)
      .auth(as.accessToken, { type: 'bearer' })
      .send({ userId, action });

  describe('POST /media/upload', () => {
    it('saves the file and creates the db record', async () => {
      const bytes = fakeJpeg(1000);
      const res = await upload(owner, bytes, 'görsel.jpg').expect(201);

      expect(res.body).toMatchObject({
        ownerId: owner.id,
        fileName: 'görsel.jpg',
        mimeType: 'image/jpeg',
        size: 1000,
        allowedUserIds: [],
      });
      expect(res.body.url).toContain(
        `/storage/media/${owner.id}/${res.body.id}.jpg?`,
      );

      const onDisk = await stat(
        path.join(ctx.uploadDir, 'media', owner.id, `${res.body.id}.jpg`),
      );
      expect(onDisk.size).toBe(1000);

      const record = await ctx.app
        .get<Connection>(getConnectionToken())
        .collection('media')
        .findOne({ filePath: `${owner.id}/${res.body.id}.jpg` });
      expect(record).toMatchObject({
        fileName: 'görsel.jpg',
        size: 1000,
        allowedUserIds: [],
      });
    });

    it('needs a token', async () => {
      await ctx
        .http()
        .post('/media/upload')
        .attach('file', fakeJpeg(), 'x.jpg')
        .expect(401);
    });

    it('rejects a png', async () => {
      await upload(owner, PNG_BYTES, 'image.png', 'image/png').expect(415);
    });

    it('rejects a png renamed to .jpg', async () => {
      await upload(owner, PNG_BYTES, 'sneaky.jpg', 'image/jpeg').expect(415);
    });

    it('rejects files that are too big and does not keep them', async () => {
      const before = await readdir(path.join(ctx.uploadDir, 'media', owner.id));
      await upload(owner, fakeJpeg(TEST_MAX_FILE_SIZE + 1)).expect(413);
      const after = await readdir(path.join(ctx.uploadDir, 'media', owner.id));
      expect(after).toEqual(before);
    });

    it('accepts a file exactly at the limit', async () => {
      await upload(owner, fakeJpeg(TEST_MAX_FILE_SIZE)).expect(201);
    });

    it('returns 400 without a file', async () => {
      await ctx
        .http()
        .post('/media/upload')
        .auth(owner.accessToken, { type: 'bearer' })
        .field('note', 'no file')
        .expect(400);
    });
  });

  describe('access control', () => {
    it('only owner and allowed users can view', async () => {
      const media = await uploadOk(owner);

      for (const user of [friend, stranger]) {
        await ctx
          .http()
          .get(`/media/${media.id}`)
          .auth(user.accessToken, { type: 'bearer' })
          .expect(403);
        await ctx
          .http()
          .get(`/media/${media.id}/download`)
          .auth(user.accessToken, { type: 'bearer' })
          .expect(403);
      }

      await grant(media.id, friend.id, 'add').expect(200);

      const asFriend = await ctx
        .http()
        .get(`/media/${media.id}`)
        .auth(friend.accessToken, { type: 'bearer' })
        .expect(200);
      expect(asFriend.body.allowedUserIds).toBeUndefined(); // only the owner sees this
      await ctx
        .http()
        .get(`/media/${media.id}/download`)
        .auth(friend.accessToken, { type: 'bearer' })
        .expect(200);
      await ctx
        .http()
        .get(`/media/${media.id}`)
        .auth(stranger.accessToken, { type: 'bearer' })
        .expect(403);

      await grant(media.id, friend.id, 'remove').expect(200);
      await ctx
        .http()
        .get(`/media/${media.id}`)
        .auth(friend.accessToken, { type: 'bearer' })
        .expect(403);
    });

    it('allowed users cannot delete or share', async () => {
      const media = await uploadOk(owner);
      await grant(media.id, friend.id, 'add').expect(200);

      await grant(media.id, stranger.id, 'add', friend).expect(403);
      await ctx
        .http()
        .get(`/media/${media.id}/permissions`)
        .auth(friend.accessToken, { type: 'bearer' })
        .expect(403);
      await ctx
        .http()
        .delete(`/media/${media.id}`)
        .auth(friend.accessToken, { type: 'bearer' })
        .expect(403);
    });

    it('returns 404 for unknown ids', async () => {
      for (const id of ['66f1c0d9e4b0a1b2c3d4e5f7', 'not-an-id']) {
        await ctx
          .http()
          .get(`/media/${id}`)
          .auth(owner.accessToken, { type: 'bearer' })
          .expect(404);
      }
    });

    it('all media routes need a token', async () => {
      const media = await uploadOk(owner);
      await ctx.http().get('/media/my').expect(401);
      await ctx.http().get(`/media/${media.id}`).expect(401);
      await ctx.http().get(`/media/${media.id}/download`).expect(401);
      await ctx.http().delete(`/media/${media.id}`).expect(401);
      await ctx.http().get(`/media/${media.id}/permissions`).expect(401);
    });
  });

  describe('permissions endpoints', () => {
    it('adding twice is fine and the list shows emails', async () => {
      const media = await uploadOk(owner);
      await grant(media.id, friend.id, 'add').expect(200);
      const res = await grant(media.id, friend.id, 'add').expect(200);
      expect(res.body.allowedUsers).toEqual([
        { id: friend.id, email: friend.email },
      ]);

      const list = await ctx
        .http()
        .get(`/media/${media.id}/permissions`)
        .auth(owner.accessToken, { type: 'bearer' })
        .expect(200);
      expect(list.body).toEqual({
        mediaId: media.id,
        ownerId: owner.id,
        allowedUsers: [{ id: friend.id, email: friend.email }],
      });
    });

    it('validates the body', async () => {
      const media = await uploadOk(owner);
      await grant(media.id, '66f1c0d9e4b0a1b2c3d4e5f7', 'add').expect(404);
      await grant(media.id, owner.id, 'add').expect(400);
      await grant(media.id, 'nope', 'add').expect(400);
      await ctx
        .http()
        .post(`/media/${media.id}/permissions`)
        .auth(owner.accessToken, { type: 'bearer' })
        .send({ userId: friend.id, action: 'promote' })
        .expect(400);
    });
  });

  describe('listing', () => {
    it('GET /media/my returns my files newest first', async () => {
      const user = await registerUser(ctx);
      const first = await uploadOk(user);
      const second = await uploadOk(user);
      await uploadOk(owner);

      const res = await ctx
        .http()
        .get('/media/my?limit=1&page=1')
        .auth(user.accessToken, { type: 'bearer' })
        .expect(200);
      expect(res.body).toMatchObject({ page: 1, limit: 1, total: 2 });
      expect(res.body.items.map((m: { id: string }) => m.id)).toEqual([
        second.id,
      ]);

      const page2 = await ctx
        .http()
        .get('/media/my?limit=1&page=2')
        .auth(user.accessToken, { type: 'bearer' })
        .expect(200);
      expect(page2.body.items.map((m: { id: string }) => m.id)).toEqual([
        first.id,
      ]);
    });

    it('GET /media/shared returns files shared with me', async () => {
      const viewer = await registerUser(ctx);
      const media = await uploadOk(owner);
      await grant(media.id, viewer.id, 'add').expect(200);

      const res = await ctx
        .http()
        .get('/media/shared')
        .auth(viewer.accessToken, { type: 'bearer' })
        .expect(200);
      expect(res.body.items.map((m: { id: string }) => m.id)).toEqual([
        media.id,
      ]);
    });

    it('limit is capped at 100', async () => {
      await ctx
        .http()
        .get('/media/my?limit=500')
        .auth(owner.accessToken, { type: 'bearer' })
        .expect(400);
    });
  });

  describe('downloads', () => {
    it('returns the same bytes that were uploaded', async () => {
      const bytes = fakeJpeg(2048);
      const media = await uploadOk(owner, bytes);
      const res = await ctx
        .http()
        .get(`/media/${media.id}/download`)
        .auth(owner.accessToken, { type: 'bearer' })
        .buffer(true)
        .parse(binaryParser)
        .expect(200);

      expect(res.headers['content-type']).toBe('image/jpeg');
      expect(res.headers['content-disposition']).toBe(
        'attachment; filename=photo.jpg',
      );
      expect(res.headers['cache-control']).toBe('private, no-cache');
      expect(Buffer.compare(res.body as Buffer, bytes)).toBe(0);

      await ctx
        .http()
        .get(`/media/${media.id}/download`)
        .auth(owner.accessToken, { type: 'bearer' })
        .set('If-None-Match', res.headers.etag)
        .expect(304);
    });

    it('supports range requests', async () => {
      const bytes = fakeJpeg(100);
      const media = await uploadOk(owner, bytes);
      const res = await ctx
        .http()
        .get(`/media/${media.id}/download`)
        .auth(owner.accessToken, { type: 'bearer' })
        .set('Range', 'bytes=0-9')
        .buffer(true)
        .parse(binaryParser)
        .expect(206);
      expect(res.headers['content-range']).toBe('bytes 0-9/100');
      expect(Buffer.compare(res.body as Buffer, bytes.subarray(0, 10))).toBe(0);

      await ctx
        .http()
        .get(`/media/${media.id}/download`)
        .auth(owner.accessToken, { type: 'bearer' })
        .set('Range', 'bytes=500-600')
        .expect(416);
    });
  });

  describe('presigned URLs', () => {
    it('work without a token', async () => {
      const bytes = fakeJpeg(512);
      const media = await uploadOk(owner, bytes);
      const res = await ctx
        .http()
        .get(pathOf(media.url))
        .buffer(true)
        .parse(binaryParser)
        .expect(200);

      expect(res.headers['content-type']).toBe('image/jpeg');
      expect(res.headers['content-disposition']).toBe(
        'inline; filename=photo.jpg',
      );
      expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
      expect(res.headers['cache-control']).toMatch(/^private, max-age=\d+$/);
      expect(Buffer.compare(res.body as Buffer, bytes)).toBe(0);

      const download = await ctx
        .http()
        .get(pathOf(media.downloadUrl))
        .expect(200);
      expect(download.headers['content-disposition']).toBe(
        'attachment; filename=photo.jpg',
      );
    });

    it('are given to allowed users too', async () => {
      const media = await uploadOk(owner);
      await grant(media.id, friend.id, 'add').expect(200);
      const res = await ctx
        .http()
        .get(`/media/${media.id}`)
        .auth(friend.accessToken, { type: 'bearer' })
        .expect(200);
      await ctx.http().get(pathOf(res.body.url)).expect(200);
    });

    it('return 403 if anything in the url is changed', async () => {
      const media = await uploadOk(owner);
      const other = await uploadOk(stranger);
      const url = new URL(media.url);

      const badSig = new URL(url);
      badSig.searchParams.set('X-Signature', 'A'.repeat(43));
      await ctx.http().get(pathOf(badSig.toString())).expect(403);

      // valid signature, but for another user's file
      const otherKey = new URL(url);
      otherKey.pathname = new URL(other.url).pathname;
      await ctx.http().get(pathOf(otherKey.toString())).expect(403);

      const extended = new URL(url);
      extended.searchParams.set('X-Expires', '9999999999');
      await ctx.http().get(pathOf(extended.toString())).expect(403);

      await ctx.http().get(url.pathname).expect(403);
    });

    it('return 404 after the file is deleted', async () => {
      const media = await uploadOk(owner);
      await ctx
        .http()
        .delete(`/media/${media.id}`)
        .auth(owner.accessToken, { type: 'bearer' })
        .expect(204);
      await ctx.http().get(pathOf(media.url)).expect(404);
    });
  });

  describe('DELETE /media/:id', () => {
    it('deletes the record and the file', async () => {
      const media = await uploadOk(owner);
      const file = path.join(
        ctx.uploadDir,
        'media',
        owner.id,
        `${media.id}.jpg`,
      );
      await stat(file);

      await ctx
        .http()
        .delete(`/media/${media.id}`)
        .auth(owner.accessToken, { type: 'bearer' })
        .expect(204);

      await expect(stat(file)).rejects.toMatchObject({ code: 'ENOENT' });
      await ctx
        .http()
        .get(`/media/${media.id}`)
        .auth(owner.accessToken, { type: 'bearer' })
        .expect(404);
    });
  });

  describe('admin role', () => {
    it('can view and delete but not share', async () => {
      const adminUser = await registerUser(ctx);
      const connection = ctx.app.get<Connection>(getConnectionToken());
      await connection
        .collection('users')
        .updateOne({ email: adminUser.email }, { $set: { role: 'admin' } });
      // role is inside the token so we need to login again
      const login = await ctx
        .http()
        .post('/auth/login')
        .send({ email: adminUser.email, password: 'Passw0rd!' })
        .expect(200);
      const adminToken = login.body.accessToken as string;

      const media = await uploadOk(owner);
      await ctx
        .http()
        .get(`/media/${media.id}`)
        .auth(adminToken, { type: 'bearer' })
        .expect(200);
      await ctx
        .http()
        .get(`/media/${media.id}/permissions`)
        .auth(adminToken, { type: 'bearer' })
        .expect(403);
      await ctx
        .http()
        .delete(`/media/${media.id}`)
        .auth(adminToken, { type: 'bearer' })
        .expect(204);
    });
  });
});
