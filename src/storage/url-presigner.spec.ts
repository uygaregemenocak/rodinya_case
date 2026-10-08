import { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UrlPresigner } from './url-presigner.js';

const USER = { userId: 'user-1' };

function createPresigner(env: Record<string, unknown> = {}) {
  const config = new ConfigService({
    STORAGE_SIGNING_SECRET: 'x'.repeat(32),
    PRESIGNED_URL_TTL: 300,
    PORT: 3000,
    PUBLIC_BASE_URL: 'https://api.example.com/',
    ...env,
  });
  return new UrlPresigner(config);
}

function getQuery(url: string): Record<string, string> {
  return Object.fromEntries(new URL(url).searchParams);
}

describe('UrlPresigner', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses PUBLIC_BASE_URL for the link', () => {
    const { url } = createPresigner().presignGetObject(
      'media',
      'u1/m1.jpg',
      USER,
    );
    expect(url).toMatch(
      /^https:\/\/api\.example\.com\/storage\/media\/u1\/m1\.jpg\?/,
    );
  });

  it('accepts a url it signed', () => {
    const presigner = createPresigner();
    const { url } = presigner.presignGetObject('media', 'u1/m1.jpg', {
      ...USER,
      contentDisposition: 'attachment',
    });

    expect(presigner.verify('media', 'u1/m1.jpg', getQuery(url))).toBe('valid');
  });

  it('puts the user id in the url', () => {
    const { url } = createPresigner().presignGetObject(
      'media',
      'u1/m1.jpg',
      USER,
    );
    expect(getQuery(url)['X-User-Id']).toBe('user-1');
  });

  it('rejects the signature for a different file', () => {
    const presigner = createPresigner();
    const { url } = presigner.presignGetObject('media', 'u1/m1.jpg', USER);

    expect(presigner.verify('media', 'u1/other.jpg', getQuery(url))).toBe(
      'invalid',
    );
    expect(presigner.verify('other', 'u1/m1.jpg', getQuery(url))).toBe(
      'invalid',
    );
  });

  it('rejects changed query params', () => {
    const presigner = createPresigner();
    const { url } = presigner.presignGetObject('media', 'u1/m1.jpg', {
      ...USER,
      contentDisposition: 'attachment',
    });
    const query = getQuery(url);

    const otherUser = { ...query, 'X-User-Id': 'user-2' };
    const noUser = { ...query, 'X-User-Id': undefined };
    const longerExpiry = { ...query, 'X-Expires': '9999999999' };
    const otherDisposition = {
      ...query,
      'response-content-disposition': 'inline',
    };
    const noSignature = { ...query, 'X-Signature': undefined };

    for (const changed of [
      otherUser,
      noUser,
      longerExpiry,
      otherDisposition,
      noSignature,
    ]) {
      expect(presigner.verify('media', 'u1/m1.jpg', changed)).toBe('invalid');
    }
  });

  it('rejects urls signed with another secret', () => {
    const other = createPresigner({ STORAGE_SIGNING_SECRET: 'y'.repeat(32) });
    const { url } = other.presignGetObject('media', 'a.jpg', USER);

    expect(createPresigner().verify('media', 'a.jpg', getQuery(url))).toBe(
      'invalid',
    );
  });

  it('returns expired after the expiry time', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const presigner = createPresigner({ PRESIGNED_URL_TTL: 60 });
    const { url, expiresAt } = presigner.presignGetObject(
      'media',
      'a.jpg',
      USER,
    );

    vi.setSystemTime(expiresAt.getTime() - 1000);
    expect(presigner.verify('media', 'a.jpg', getQuery(url))).toBe('valid');

    vi.setSystemTime(expiresAt.getTime() + 1000);
    expect(presigner.verify('media', 'a.jpg', getQuery(url))).toBe('expired');
  });

  it('gives the same url for requests close to each other', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:10Z'));
    const presigner = createPresigner();

    const first = presigner.presignGetObject('media', 'a.jpg', USER);
    vi.advanceTimersByTime(30_000);
    const second = presigner.presignGetObject('media', 'a.jpg', USER);

    expect(second.url).toBe(first.url);
  });
});
