import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  NotFound,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvironmentVariables } from '../config/env.validation.js';

/** Private S3 bucket; objects are read through short-lived signed URLs. Credentials come from the SDK's default chain. */
@Injectable()
export class StorageService implements OnApplicationShutdown {
  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    const endpoint = config.get('S3_ENDPOINT', { infer: true });
    // A custom endpoint (LocalStack) has no per-bucket DNS, so it needs path-style URLs.
    this.s3 = new S3Client({
      region: config.get('AWS_REGION', { infer: true }),
      endpoint,
      forcePathStyle: !!endpoint,
    });
    this.bucket = config.get('S3_BUCKET', { infer: true });
  }

  /** A URL the client can `PUT` the object to directly; the request must send the same `Content-Type`. */
  uploadUrl(key: string, contentType: string, expiresIn: number): Promise<string> {
    return getSignedUrl(
      this.s3,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: contentType,
      }),
      {
        expiresIn,
      },
    );
  }

  /** Size in bytes, or null when the object does not exist. */
  async size(key: string): Promise<number | null> {
    try {
      const head = await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return head.ContentLength ?? 0;
    } catch (error) {
      if (error instanceof NotFound) return null;
      throw error;
    }
  }

  /** The first `bytes` bytes of an object (for file signature checks). */
  async readStart(key: string, bytes: number): Promise<Uint8Array> {
    const res = await this.s3.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Range: `bytes=0-${bytes - 1}`,
      }),
    );
    return res.Body ? res.Body.transformToByteArray() : new Uint8Array();
  }

  async delete(key: string): Promise<void> {
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  /** Signing is local (no request), so this is cheap to call per response. */
  signedUrl(key: string, expiresIn = 24 * 60 * 60): Promise<string> {
    return getSignedUrl(this.s3, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn });
  }

  onApplicationShutdown() {
    this.s3.destroy();
  }
}
