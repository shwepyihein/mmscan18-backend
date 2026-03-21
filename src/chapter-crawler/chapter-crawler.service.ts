import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import {
  CrawlResult,
  PuppeteerService,
} from '../crawler/puppeteer/puppeteer.service';
import { S3Service } from '../s3/s3.service';

interface CrawlChapterDto {
  manhwaId: string;
  chapterId: string;
  url: string;
}

interface CrawlOcrOnlyDto {
  manhwaId: string;
  chapterId: string;
  url: string;
}

export interface CrawlOcrOnlyResponse {
  chapterId: string;
  s3BasePath: string;
  s3EnJsonPath: string | null;
  s3MmJsonPath: string | null;
  totalImages: number;
  totalTextBoxes: number;
  success: boolean;
  message: string;
}

export interface CrawlResponse {
  chapterId: string;
  storagePath: string;
  imagesCount: number;
  ocrJsonDownloaded: boolean;
  s3BasePath: string;
  s3ImagePaths: string[];
  s3EnJsonPath: string | null;
  s3MmJsonPath: string | null;
  message: string;
}

@Injectable()
export class ChapterCrawlerService {
  private readonly logger = new Logger(ChapterCrawlerService.name);

  constructor(
    private readonly puppeteerService: PuppeteerService,
    private readonly s3Service: S3Service,
  ) {}

  async crawlChapter(dto: CrawlChapterDto): Promise<CrawlResponse> {
    // Get the referer from the URL
    const referer = this.getReferer(dto.url);

    // Step 1: Crawl the page and extract data with retry logic
    let crawlResult: CrawlResult | null = null;
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        crawlResult = await this.puppeteerService.crawlChapter(dto.url);
        break; // Success, exit retry loop
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        this.logger.warn(`Attempt ${attempt} failed: ${errorMessage}`);

        if (attempt < maxRetries) {
          const waitTime = attempt * 2000; // 2s, 4s, 6s
          await new Promise((resolve) => setTimeout(resolve, waitTime));
        }
      }
    }

    if (!crawlResult) {
      throw lastError || new Error('Failed to crawl chapter after all retries');
    }

    // Check if we got any images
    if (crawlResult.images.length === 0) {
      throw new Error(
        'No images found on the page. The page structure might have changed or the URL is incorrect.',
      );
    }

    const s3BasePath = `manhwa/${dto.manhwaId}/chapter-${dto.chapterId}`;
    const s3ImagesPath = `${s3BasePath}/images`;

    this.logger.debug(`Crawl result: ${JSON.stringify(crawlResult, null, 2)}`);

    let ocrJsonDownloaded = false;
    let s3EnJsonPath: string | null = null;
    let s3MmJsonPath: string | null = null;

    // Step 2: Upload OCR data extracted from DOM as en.json (if available)
    if (crawlResult.ocrData && crawlResult.ocrData.length > 0) {
      try {
        // Upload en.json to S3
        const s3EnJsonKey = `${s3BasePath}/en.json`;
        await this.s3Service.uploadJson(
          s3EnJsonKey,
          crawlResult.ocrData as unknown as Record<string, unknown>,
        );
        s3EnJsonPath = s3EnJsonKey;
        ocrJsonDownloaded = true;

        // Create mm.json with same structure but empty text
        const mmJsonData = this.createEmptyMmJson(crawlResult.ocrData);

        // Upload mm.json to S3
        const s3MmJsonKey = `${s3BasePath}/mm.json`;
        await this.s3Service.uploadJson(
          s3MmJsonKey,
          mmJsonData as Record<string, unknown>,
        );
        s3MmJsonPath = s3MmJsonKey;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        this.logger.warn(
          `Failed to upload OCR JSON: ${errorMessage}. Continuing without OCR data.`,
        );
        // Don't throw - OCR is optional for sites that don't have it
      }
    }

    // Step 3: Download and upload images to S3
    const concurrencyLimit = 5; // Download/upload 5 images at a time
    const s3ImagePaths: string[] = [];
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < crawlResult.images.length; i += concurrencyLimit) {
      const batch = crawlResult.images.slice(i, i + concurrencyLimit);
      await Promise.all(
        batch.map(async (image) => {
          // Retry logic for each image
          let imageSuccess = false;
          for (let retry = 0; retry < 3 && !imageSuccess; retry++) {
            try {
              // Download image directly from URL
              const imageResponse = await axios.get(image.url, {
                responseType: 'arraybuffer',
                headers: {
                  'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                  Referer: referer,
                  Accept: 'image/webp,image/apng,image/*,*/*;q=0.8',
                },
                timeout: 60000,
              });

              const imageBuffer = Buffer.from(
                imageResponse.data as ArrayBufferLike,
              );

              // Skip if image is too small (likely an error placeholder)
              if (imageBuffer.length < 1000) {
                this.logger.warn(
                  `Image ${image.filename} is too small (${imageBuffer.length} bytes), might be an error placeholder`,
                );
              }

              const s3Key = `${s3ImagesPath}/${image.filename}`;
              const s3Url = await this.s3Service.uploadImage(
                s3Key,
                imageBuffer,
              );
              s3ImagePaths.push(s3Url);
              successCount++;
              imageSuccess = true;
            } catch (error) {
              if (retry < 2) {
                await new Promise((resolve) =>
                  setTimeout(resolve, (retry + 1) * 1000),
                );
              } else {
                const errorMessage =
                  error instanceof Error ? error.message : 'Unknown error';
                this.logger.warn(
                  `Failed to download/upload ${image.filename}: ${errorMessage}`,
                );
                failCount++;
              }
            }
          }
        }),
      );
    }

    // Check if we have enough images
    if (successCount === 0) {
      throw new Error(
        'Failed to download any images. All image downloads failed.',
      );
    }

    if (failCount > 0) {
      this.logger.warn(
        `Completed with ${failCount} failed image downloads out of ${crawlResult.images.length}`,
      );
    }

    return {
      chapterId: dto.chapterId,
      storagePath: '', // No local storage path anymore
      imagesCount: successCount,
      ocrJsonDownloaded,
      s3BasePath,
      s3ImagePaths,
      s3EnJsonPath,
      s3MmJsonPath,
      message: `Successfully crawled chapter. Uploaded ${successCount}/${crawlResult.images.length} images${ocrJsonDownloaded ? ' and JSON files' : ''} to S3.${failCount > 0 ? ` (${failCount} images failed)` : ''}`,
    };
  }

  /**
   * Crawl OCR data only (en.json) without downloading images
   * Useful for chapters that already have images but are missing OCR data
   */
  async crawlOcrOnly(dto: CrawlOcrOnlyDto): Promise<CrawlOcrOnlyResponse> {
    // Step 1: Crawl the page and extract OCR data with retry logic
    let crawlResult: CrawlResult | null = null;
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        crawlResult = await this.puppeteerService.crawlChapter(dto.url);
        break;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        this.logger.warn(`Attempt ${attempt} failed: ${errorMessage}`);

        if (attempt < maxRetries) {
          const waitTime = attempt * 2000;
          await new Promise((resolve) => setTimeout(resolve, waitTime));
        }
      }
    }

    if (!crawlResult) {
      throw (
        lastError || new Error('Failed to crawl OCR data after all retries')
      );
    }

    const s3BasePath = `manhwa/${dto.manhwaId}/chapter-${dto.chapterId}`;
    let s3EnJsonPath: string | null = null;
    let s3MmJsonPath: string | null = null;
    let totalTextBoxes = 0;

    // Step 2: Upload OCR data if available
    if (crawlResult.ocrData && crawlResult.ocrData.length > 0) {
      try {
        // Calculate total text boxes
        totalTextBoxes = crawlResult.ocrData.reduce(
          (sum, img) => sum + img.texts.length,
          0,
        );

        // Upload en.json to S3
        const s3EnJsonKey = `${s3BasePath}/en.json`;
        await this.s3Service.uploadJson(
          s3EnJsonKey,
          crawlResult.ocrData as unknown as Record<string, unknown>,
        );
        s3EnJsonPath = s3EnJsonKey;

        // Create mm.json with same structure but empty text
        const mmJsonData = this.createEmptyMmJson(crawlResult.ocrData);

        // Upload mm.json to S3
        const s3MmJsonKey = `${s3BasePath}/mm.json`;
        await this.s3Service.uploadJson(
          s3MmJsonKey,
          mmJsonData as Record<string, unknown>,
        );
        s3MmJsonPath = s3MmJsonKey;

        return {
          chapterId: dto.chapterId,
          s3BasePath,
          s3EnJsonPath,
          s3MmJsonPath,
          totalImages: crawlResult.ocrData.length,
          totalTextBoxes,
          success: true,
          message: `Successfully extracted OCR data: ${totalTextBoxes} text boxes from ${crawlResult.ocrData.length} images`,
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(`Failed to upload OCR JSON: ${errorMessage}`);
        throw new Error(`Failed to upload OCR JSON: ${errorMessage}`);
      }
    } else {
      this.logger.warn('No OCR overlay data found in DOM');
      return {
        chapterId: dto.chapterId,
        s3BasePath,
        s3EnJsonPath: null,
        s3MmJsonPath: null,
        totalImages: 0,
        totalTextBoxes: 0,
        success: false,
        message:
          'No OCR overlay data found on the page. The site may not have OCR overlays for this chapter.',
      };
    }
  }

  private getReferer(url: string): string {
    try {
      const urlObj = new URL(url);
      return `${urlObj.origin}/`;
    } catch {
      return 'https://manhuarmtl.com/';
    }
  }

  private createEmptyMmJson(enJson: unknown): unknown {
    // Recursively create mm.json with same structure but empty text fields
    if (Array.isArray(enJson)) {
      return enJson.map((item) => this.createEmptyMmJson(item));
    }

    if (enJson && typeof enJson === 'object' && enJson !== null) {
      const mmJson: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(enJson)) {
        if (key === 'text' || key === 'content') {
          // Empty text fields
          mmJson[key] = '';
        } else if (typeof value === 'object' && value !== null) {
          // Recursively process nested objects
          mmJson[key] = this.createEmptyMmJson(value);
        } else {
          // Keep other fields as is
          mmJson[key] = value;
        }
      }
      return mmJson;
    }

    return enJson;
  }
}
