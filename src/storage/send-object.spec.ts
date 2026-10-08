import express from 'express';
import { HttpException } from '@nestjs/common';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import {
  ObjectInfo,
  ObjectNotFoundError,
  ObjectStorage,
  StoredObject,
} from './object-storage.js';
import { sendObject } from './send-object.js';

// headObject finds the file but getObject doesn't, like when the file is
// deleted right between the two calls
class DisappearingStorage extends ObjectStorage {
  putObject(): Promise<number> {
    throw new Error('not used');
  }

  headObject(bucket: string, key: string): Promise<ObjectInfo | null> {
    return Promise.resolve({
      bucket,
      key,
      size: 10,
      contentType: 'image/jpeg',
      lastModified: new Date(),
      etag: 'W/"a-1"',
    });
  }

  getObject(bucket: string, key: string): Promise<StoredObject> {
    return Promise.reject(new ObjectNotFoundError(bucket, key));
  }

  deleteObject(): Promise<void> {
    return Promise.resolve();
  }
}

describe('sendObject', () => {
  it('does not send file headers with the 404 when the file disappears', async () => {
    const app = express();
    app.get('/file', async (req, res) => {
      try {
        await sendObject(
          req,
          res,
          new DisappearingStorage(),
          'media',
          'a.jpg',
          {
            cacheControl: 'private, no-cache',
            contentDisposition: 'attachment; filename=a.jpg',
          },
        );
      } catch (error) {
        // same thing nest's exception filter does
        const status = (error as HttpException).getStatus();
        res.status(status).json({ statusCode: status });
      }
    });

    const res = await request(app).get('/file').expect(404);

    expect(res.headers['content-type']).toMatch(/^application\/json/);
    expect(res.headers['content-disposition']).toBeUndefined();
    expect(res.headers['cache-control']).toBeUndefined();
    // express adds its own etag for the json body, it just can't be the file's
    expect(res.headers['etag']).not.toBe('W/"a-1"');
  });
});
