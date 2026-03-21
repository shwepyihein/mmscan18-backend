import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  PutObjectCommandInput,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
  private readonly s3Client: S3Client;
  private readonly bucketName: string;
  private readonly baseUrl: string;

  constructor(private configService: ConfigService) {
    this.s3Client = new S3Client({
      region: this.configService.get<string>('AWS_REGION') || 'us-east-1',
      credentials: {
        accessKeyId: this.configService.get<string>('AWS_ACCESS_KEY_ID') || '',
        secretAccessKey:
          this.configService.get<string>('AWS_SECRET_ACCESS_KEY') || '',
      },
    });
    this.bucketName = this.configService.get<string>('AWS_S3_BUCKET') || '';
    const cdnUrl = this.configService.get<string>('CDN_URL');
    this.baseUrl = cdnUrl
      ? cdnUrl.replace(/\/$/, '')
      : `https://${this.bucketName}.s3.amazonaws.com`;
  }

  // Get full URL from S3 path/key
  getFullUrl(path: string | null): string | null {
    if (!path) return null;
    // If it's already a full URL, return as is
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return path;
    }
    return `${this.baseUrl}/${path}`;
  }

  // Get the base URL for S3
  getBaseUrl(): string {
    return this.baseUrl;
  }

  async uploadFile(
    key: string,
    body: Buffer | string,
    contentType?: string,
    cacheControl?: string,
  ): Promise<string> {
    try {
      const params: PutObjectCommandInput = {
        Bucket: this.bucketName,
        Key: key,
        Body: body,
        ContentType: contentType,
        ...(cacheControl && { CacheControl: cacheControl }),
      };

      const command = new PutObjectCommand(params);
      await this.s3Client.send(command);

      const url = `${this.baseUrl}/${key}`;
      return url;
    } catch (error) {
      this.logger.error(`Failed to upload file ${key}:`, error);
      throw error;
    }
  }

  async uploadImage(key: string, imageBuffer: Buffer): Promise<string> {
    return this.uploadFile(key, imageBuffer, 'image/jpeg');
  }

  async uploadJson(key: string, jsonData: object): Promise<string> {
    const jsonString = JSON.stringify(jsonData, null, 2);
    return this.uploadFile(key, jsonString, 'application/json');
  }

  async uploadMultipleImages(
    basePath: string,
    images: Array<{ filename: string; buffer: Buffer }>,
  ): Promise<string[]> {
    const uploadPromises = images.map((image) =>
      this.uploadImage(`${basePath}/${image.filename}`, image.buffer),
    );

    return Promise.all(uploadPromises);
  }

  getS3Path(manhwaId: string, chapterNo: number): string {
    return `manhwa18/${manhwaId}/chapters/${chapterNo}`;
  }

  // User avatar upload - returns only the S3 key (path), not full URL
  async uploadUserAvatar(
    userId: string,
    imageBuffer: Buffer,
    mimeType: string,
  ): Promise<{ key: string; url: string }> {
    const extension = mimeType.split('/')[1] || 'jpg';
    const timestamp = Date.now();
    const key = `users/${userId}/avatar_${timestamp}.${extension}`;
    const url = await this.uploadFile(key, imageBuffer, mimeType);
    return { key, url };
  }

  getUserAvatarPath(userId: string): string {
    return `users/${userId}`;
  }

  // Manhwa cover image upload - returns only the S3 key (path), not full URL
  async uploadManhwaCover(
    manhwaId: string,
    titleSlug: string,
    imageBuffer: Buffer,
    mimeType: string,
  ): Promise<{ key: string; url: string }> {
    const extension = mimeType.split('/')[1] || 'jpg';
    const timestamp = Date.now();
    const key = `manhwa18/${manhwaId}/covers/${timestamp}-${titleSlug}.${extension}`;
    const url = await this.uploadFile(key, imageBuffer, mimeType);
    return { key, url };
  }

  async getJsonFile(key: string): Promise<unknown> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const response = await this.s3Client.send(command);
      const bodyString = await response.Body?.transformToString();
      if (!bodyString) {
        throw new Error(`Empty response for key: ${key}`);
      }
      return JSON.parse(bodyString);
    } catch (error) {
      this.logger.error(`Failed to get JSON file ${key}:`, error);
      throw error;
    }
  }

  async listImages(basePath: string): Promise<string[]> {
    try {
      const imagesPath = `${basePath}/`;
      const command = new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: imagesPath,
      });

      const response = await this.s3Client.send(command);
      const imageKeys =
        response.Contents?.map((object) => {
          const key = object.Key || '';
          return `${this.baseUrl}/${key}`;
        })
          .filter(
            (url) =>
              url.endsWith('.webp') ||
              url.endsWith('.jpg') ||
              url.endsWith('.png'),
          )
          .sort() || [];

      return imageKeys;
    } catch (error) {
      this.logger.error(`Failed to list images for ${basePath}:`, error);
      throw error;
    }
  }

  // Delete a single object from S3
  async deleteObject(key: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });
      await this.s3Client.send(command);
    } catch (error) {
      this.logger.error(`Failed to delete object ${key}:`, error);
      throw error;
    }
  }

  // Delete all objects under a prefix (folder)
  async deleteFolder(prefix: string): Promise<number> {
    try {
      // List all objects with the prefix
      const listCommand = new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: prefix,
      });

      const listResponse = await this.s3Client.send(listCommand);
      const objects = listResponse.Contents || [];

      if (objects.length === 0) {
        return 0;
      }

      // Delete objects in batches of 1000 (S3 limit)
      const deleteKeys = objects
        .map((obj) => obj.Key)
        .filter((key): key is string => !!key);

      if (deleteKeys.length === 0) {
        return 0;
      }

      const deleteCommand = new DeleteObjectsCommand({
        Bucket: this.bucketName,
        Delete: {
          Objects: deleteKeys.map((Key) => ({ Key })),
          Quiet: true,
        },
      });

      await this.s3Client.send(deleteCommand);
      return deleteKeys.length;
    } catch (error) {
      this.logger.error(`Failed to delete folder ${prefix}:`, error);
      throw error;
    }
  }

  // List all objects under a prefix
  async listObjects(prefix: string): Promise<string[]> {
    try {
      const command = new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: prefix,
      });

      const response = await this.s3Client.send(command);
      return (
        response.Contents?.map((obj) => obj.Key || '').filter(Boolean) || []
      );
    } catch (error) {
      this.logger.error(`Failed to list objects for ${prefix}:`, error);
      throw error;
    }
  }
}
