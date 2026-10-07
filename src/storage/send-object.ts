import { Logger, NotFoundException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { pipeline } from 'node:stream/promises';
import {
  ByteRange,
  ObjectNotFoundError,
  ObjectStorage,
} from './object-storage.js';

export interface SendObjectOptions {
  cacheControl: string;
  contentDisposition?: string;
  // lets other sites show the image in an <img> tag
  allowCrossOrigin?: boolean;
}

const logger = new Logger('SendObject');

// Streams a stored object to the response. Handles If-None-Match (304) and
// simple Range requests (206) so browsers can cache and resume downloads.
export async function sendObject(
  req: Request,
  res: Response,
  storage: ObjectStorage,
  bucket: string,
  key: string,
  options: SendObjectOptions,
): Promise<void> {
  const info = await storage.headObject(bucket, key);
  if (!info) {
    throw new NotFoundException('File not found');
  }

  res.setHeader('Content-Type', info.contentType);
  res.setHeader('ETag', info.etag);
  res.setHeader('Last-Modified', info.lastModified.toUTCString());
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', options.cacheControl);
  if (options.contentDisposition) {
    res.setHeader('Content-Disposition', options.contentDisposition);
  }
  if (options.allowCrossOrigin) {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  }

  // express compares If-None-Match / If-Modified-Since with the headers above
  if (req.fresh) {
    res.status(304).end();
    return;
  }

  // If-Range isn't supported, in that case we just send the whole file
  let range: ByteRange | undefined;
  if (req.headers.range && !req.headers['if-range']) {
    const ranges = req.range(info.size, { combine: true });
    if (ranges === -1) {
      res.status(416).setHeader('Content-Range', `bytes */${info.size}`).end();
      return;
    }
    // only single byte ranges are supported, anything else gets the whole file
    if (
      Array.isArray(ranges) &&
      ranges.type === 'bytes' &&
      ranges.length === 1
    ) {
      range = { start: ranges[0].start, end: ranges[0].end };
    }
  }

  let object;
  try {
    object = await storage.getObject(bucket, key, range);
  } catch (error) {
    // file could be deleted between headObject and getObject
    if (error instanceof ObjectNotFoundError) {
      throw new NotFoundException('File not found');
    }
    throw error;
  }

  if (range) {
    res.status(206);
    res.setHeader(
      'Content-Range',
      `bytes ${range.start}-${range.end}/${info.size}`,
    );
    res.setHeader('Content-Length', range.end - range.start + 1);
  } else {
    res.status(200);
    res.setHeader('Content-Length', info.size);
  }

  if (req.method === 'HEAD') {
    object.body.destroy();
    res.end();
    return;
  }

  try {
    await pipeline(object.body, res);
  } catch (error) {
    // client closing the connection mid download is normal, don't log it
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'ERR_STREAM_PREMATURE_CLOSE' && code !== 'ECONNRESET') {
      logger.error(`Streaming ${bucket}/${key} failed`, error);
    }
  }
}
