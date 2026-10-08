import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import type { App } from 'supertest/types.js';

export const TEST_MAX_FILE_SIZE = 64 * 1024;

// not a real image, but starts with the jpeg bytes so the validator accepts it
export function fakeJpeg(size = 64): Buffer {
  const body = Buffer.alloc(Math.max(size, 6), 0x20);
  body.set([0xff, 0xd8, 0xff, 0xe0], 0);
  body.set([0xff, 0xd9], body.length - 2);
  return body;
}

export const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
]);

export interface TestContext {
  app: INestApplication<App>;
  http: () => ReturnType<typeof request>;
  uploadDir: string;
  close: () => Promise<void>;
}

// Starts the real app with an in-memory mongo and a temp upload folder.
// The env has to be set before AppModule is imported, ConfigModule reads it
// on import.
export async function createTestApp(): Promise<TestContext> {
  const mongo = await MongoMemoryServer.create();
  const uploadDir = await mkdtemp(path.join(tmpdir(), 'media-e2e-'));

  Object.assign(process.env, {
    NODE_ENV: 'test',
    MONGO_URI: mongo.getUri('media-e2e'),
    JWT_ACCESS_SECRET: 'test-access-secret-'.padEnd(48, 'a'),
    JWT_REFRESH_SECRET: 'test-refresh-secret-'.padEnd(48, 'r'),
    STORAGE_SIGNING_SECRET: 'test-signing-secret-'.padEnd(48, 's'),
    UPLOAD_DIR: uploadDir,
    MAX_FILE_SIZE: String(TEST_MAX_FILE_SIZE),
    PRESIGNED_URL_TTL: '300',
    PUBLIC_BASE_URL: 'http://localhost:3000',
  });

  const { AppModule } = await import('../../src/app.module.js');
  const { configureApp } = await import('../../src/app.setup.js');

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>();
  configureApp(app);
  await app.init();

  return {
    app,
    uploadDir,
    http: () => request(app.getHttpServer()),
    close: async () => {
      await app.close();
      await mongo.stop();
      await rm(uploadDir, { recursive: true, force: true });
    },
  };
}

export interface TestUser {
  id: string;
  email: string;
  accessToken: string;
  refreshToken: string;
}

let userCounter = 0;

export async function registerUser(
  ctx: TestContext,
  email?: string,
): Promise<TestUser> {
  const address = email ?? `user${++userCounter}-${Date.now()}@example.com`;
  const res = await ctx
    .http()
    .post('/auth/register')
    .send({ email: address, password: 'Passw0rd!' })
    .expect(201);
  return {
    id: res.body.user.id,
    email: address,
    accessToken: res.body.accessToken,
    refreshToken: res.body.refreshToken,
  };
}

// supertest needs a path, not a full url
export function pathOf(url: string): string {
  const parsed = new URL(url);
  return parsed.pathname + parsed.search;
}
