import {
  S3Client,
  CreateBucketCommand,
  HeadBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";

export const MAX_FILE_SIZE = 10 * 1024 * 1024;
export const checksum = (data: Uint8Array) =>
  createHash("sha256").update(data).digest("hex");
export interface EvidenceStore {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string, clean?: boolean): Promise<Buffer>;
  promote(key: string, data: Buffer): Promise<void>;
  ready(): Promise<void>;
}
export class ObjectStore implements EvidenceStore {
  private client: S3Client;
  constructor() {
    this.client = new S3Client({
      endpoint: process.env.S3_ENDPOINT!,
      region: "us-east-1",
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY!,
        secretAccessKey: process.env.S3_SECRET_KEY!,
      },
      maxAttempts: 2,
      requestHandler: { connectionTimeout: 3000, requestTimeout: 15000 },
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  }
  async ready() {
    for (const Bucket of ["quarantine", "clean"]) {
      try {
        await this.client.send(new HeadBucketCommand({ Bucket }));
      } catch (e) {
        if (
          (e as { $metadata?: { httpStatusCode?: number } }).$metadata
            ?.httpStatusCode !== 404
        )
          throw e;
        try {
          await this.client.send(new CreateBucketCommand({ Bucket }));
        } catch (error) {
          if ((error as { name: string }).name !== "BucketAlreadyOwnedByYou")
            throw error;
        }
      }
    }
  }
  async put(key: string, data: Buffer) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: "quarantine",
        Key: key,
        Body: data,
        ContentType: "application/octet-stream",
      }),
    );
  }
  async get(key: string, clean = false) {
    const r = await this.client.send(
      new GetObjectCommand({
        Bucket: clean ? "clean" : "quarantine",
        Key: key,
      }),
    );
    if (!r.Body || !r.ContentLength || r.ContentLength > MAX_FILE_SIZE)
      throw new Error("Invalid object size");
    return Buffer.from(await r.Body.transformToByteArray());
  }
  async promote(key: string, data: Buffer) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: "clean",
        Key: key,
        Body: data,
        ContentType: "application/octet-stream",
      }),
    );
    // Quarantine is retained until the DB transaction records clean. A crash is safe to replay.
  }
  async removeQuarantine(key: string) {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: "quarantine", Key: key }),
    );
  }
}

export function identifyFile(data: Buffer, filename: string) {
  if (!data.length || data.length > MAX_FILE_SIZE)
    throw new Error("Tệp phải từ 1 byte đến 10 MB.");
  if (!filename || filename.length > 180 || /[\x00-\x1f\\/]/.test(filename))
    throw new Error("Tên tệp không hợp lệ.");
  const ext = filename.split(".").at(-1)?.toLowerCase();
  if (
    ext === "png" &&
    data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return "image/png";
  if (
    ["jpg", "jpeg"].includes(ext || "") &&
    data[0] === 255 &&
    data[1] === 216 &&
    data[2] === 255
  )
    return "image/jpeg";
  if (ext === "pdf" && data.subarray(0, 5).toString() === "%PDF-")
    return "application/pdf";
  if (ext === "txt" && !data.includes(0)) {
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(data);
      return "text/plain";
    } catch {
      /* invalid UTF8 */
    }
  }
  throw new Error("Chỉ nhận PNG, JPEG, PDF hoặc TXT đúng định dạng.");
}
