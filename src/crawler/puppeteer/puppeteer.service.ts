import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as puppeteer from 'puppeteer-core';

export interface OcrTextBox {
  box: [number, number, number, number]; // [x, y, width, height]
  text: string;
}

export interface OcrImageData {
  image: string;
  texts: OcrTextBox[];
}

export interface CrawlResult {
  chapterId: string;
  images: Array<{ pageNumber: number; filename: string; url: string }>;
  ocrData: OcrImageData[] | null; // Extracted OCR data from DOM
  chapterUrl: string;
}

// Site-specific configurations
interface SiteConfig {
  imageSelector: string;
  ocrOverlaySelector: string; // Selector for OCR text overlay elements
  baseUrl: string;
}

const SITE_CONFIGS: Record<string, SiteConfig> = {
  'manhuarmtl.com': {
    imageSelector: '.reading-content img.wp-manga-chapter-img',
    ocrOverlaySelector: '.manga-ocr-button-overlay',
    baseUrl: 'https://manhuarmtl.com',
  },
  default: {
    // Generic selectors that work for many manga sites
    imageSelector:
      '.reading-content img, .chapter-content img, #chapter-content img, .manga-content img, .page-break img',
    ocrOverlaySelector:
      '.manga-ocr-button-overlay, [class*="ocr-overlay"], [class*="text-overlay"]',
    baseUrl: '',
  },
};

@Injectable()
export class PuppeteerService {
  private readonly logger = new Logger(PuppeteerService.name);
  private browser: puppeteer.Browser | null = null;

  private async getBrowser(): Promise<puppeteer.Browser> {
    if (!this.browser || !this.browser.isConnected()) {
      this.browser = await puppeteer.launch({
        executablePath: '/usr/bin/chromium',
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--disable-web-security',
        ],
      });
    }
    return this.browser;
  }

  async closeBrowser(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  private getSiteConfig(url: string): SiteConfig {
    try {
      const hostname = new URL(url).hostname;
      return SITE_CONFIGS[hostname] || SITE_CONFIGS.default;
    } catch {
      return SITE_CONFIGS.default;
    }
  }

  async crawlChapter(chapterUrl: string): Promise<CrawlResult> {
    const chapterId = this.extractChapterId(chapterUrl);
    const siteConfig = this.getSiteConfig(chapterUrl);
    const browser = await this.getBrowser();
    const page = await browser.newPage();

    try {
      // Set longer timeout for page operations
      page.setDefaultNavigationTimeout(120000); // 2 minutes
      page.setDefaultTimeout(120000);

      // Set user agent to avoid bot detection
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      );

      try {
        // Try with domcontentloaded first (faster, less strict)
        await page.goto(chapterUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 120000,
        });

        // Wait for images to load using site-specific selector
        await page
          .waitForSelector(siteConfig.imageSelector, {
            timeout: 30000,
          })
          .catch(() => {
            this.logger.warn(
              `Images selector "${siteConfig.imageSelector}" not found, trying fallback...`,
            );
          });

        // Wait a bit for any lazy-loaded content
        await new Promise((resolve) => setTimeout(resolve, 3000));

        // Scroll down to trigger lazy loading
        await this.autoScroll(page);

        // Wait a bit more after scrolling
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (navError) {
        // Fallback: try with load event if domcontentloaded fails
        this.logger.warn(
          `domcontentloaded failed: ${navError instanceof Error ? navError.message : 'unknown'}, trying load event...`,
        );
        await page.goto(chapterUrl, {
          waitUntil: 'load',
          timeout: 120000,
        });
        await new Promise((resolve) => setTimeout(resolve, 3000));
        await this.autoScroll(page);
      }

      // Extract all chapter images using multiple selector strategies
      const images = await page.evaluate((selector) => {
        // Try site-specific selector first
        let imageElements = document.querySelectorAll(selector);

        // Fallback to common selectors if no images found
        if (imageElements.length === 0) {
          const fallbackSelectors = [
            '.reading-content img',
            '.chapter-content img',
            '#chapter-content img',
            '.manga-content img',
            '.page-break img',
            '[class*="chapter"] img',
            '[class*="reader"] img',
          ];

          for (const fallback of fallbackSelectors) {
            imageElements = document.querySelectorAll(fallback);
            if (imageElements.length > 0) {
              console.log(`Found images with fallback selector: ${fallback}`);
              break;
            }
          }
        }

        const imageList: Array<{ src: string; alt: string }> = [];

        imageElements.forEach((img) => {
          const imgEl = img as HTMLImageElement;
          // Try multiple src attributes (some sites use data-src for lazy loading)
          const src =
            imgEl.src ||
            imgEl.getAttribute('data-src') ||
            imgEl.getAttribute('data-lazy-src') ||
            imgEl.getAttribute('data-original');

          if (src && !src.startsWith('data:') && !src.includes('loading')) {
            // Filter out small images (likely icons/ads)
            const width = imgEl.naturalWidth || imgEl.width || 0;
            const height = imgEl.naturalHeight || imgEl.height || 0;

            // Only include reasonably sized images (manga pages are usually large)
            if (width === 0 || height === 0 || width > 100 || height > 100) {
              imageList.push({
                src,
                alt: imgEl.alt || '',
              });
            }
          }
        });

        return imageList;
      }, siteConfig.imageSelector);

      if (images.length === 0) {
        this.logger.warn(
          'No images found on page. Page HTML structure might have changed.',
        );
        // Log page title for debugging
        const title = await page.title();
        this.logger.debug(`Page title: ${title}`);
      }

      // Extract OCR data from DOM (manga-ocr-button-overlay elements)
      const ocrData = await this.extractOcrDataFromDom(
        page,
        siteConfig.ocrOverlaySelector,
      );
      await page.close();

      // Prepare result
      const result: CrawlResult = {
        chapterId,
        images: images.map((img, index) => {
          // Determine file extension from URL
          const urlPath = img.src.split('?')[0];
          const ext = urlPath.split('.').pop()?.toLowerCase() || 'webp';
          const validExt = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)
            ? ext
            : 'webp';

          return {
            pageNumber: index + 1,
            filename: `page_${String(index + 1).padStart(3, '0')}.${validExt}`,
            url: img.src,
          };
        }),
        ocrData,
        chapterUrl,
      };

      return result;
    } catch (error) {
      try {
        await page.close();
      } catch {
        // Ignore close errors
      }
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Error crawling chapter: ${errorMessage}`, errorStack);
      throw error;
    }
  }

  private async autoScroll(page: puppeteer.Page): Promise<void> {
    await page.evaluate(async () => {
      await new Promise<void>((resolve) => {
        let totalHeight = 0;
        const distance = 500;
        const timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;

          if (totalHeight >= scrollHeight) {
            clearInterval(timer);
            // Scroll back to top
            window.scrollTo(0, 0);
            resolve();
          }
        }, 100);

        // Safety timeout - max 30 seconds of scrolling
        setTimeout(() => {
          clearInterval(timer);
          window.scrollTo(0, 0);
          resolve();
        }, 30000);
      });
    });
  }

  /**
   * Extract OCR text data from DOM overlay elements
   * Looks for elements with class 'manga-ocr-button-overlay' and extracts:
   * - Image name from element ID (e.g., 'ocr-text-split_003_webp-0' -> 'split_003.webp')
   * - Box position relative to the IMAGE (not the container) in natural image coordinates
   * - Text content from inner span
   *
   * The box coordinates are calculated relative to each image's natural dimensions,
   * so they can be properly scaled when rendered on different screen sizes.
   */
  private async extractOcrDataFromDom(
    page: puppeteer.Page,
    selector: string = '.manga-ocr-button-overlay',
  ): Promise<OcrImageData[] | null> {
    try {
      const ocrData = await page.evaluate((ocrSelector) => {
        // Find the reading container and all manga images
        const readingContainer = document.querySelector('.reading-content');
        if (!readingContainer) {
          return null;
        }

        const mangaImages = readingContainer.querySelectorAll<HTMLImageElement>(
          '.wp-manga-chapter-img',
        );
        if (mangaImages.length === 0) {
          return null;
        }

        // Build a map of image filename -> image info (position, dimensions, scale)
        const readingContainerRect = readingContainer.getBoundingClientRect();
        const imageInfoMap = new Map<
          string,
          {
            element: HTMLImageElement;
            topInContainer: number;
            leftInContainer: number;
            scaleX: number;
            scaleY: number;
            naturalWidth: number;
            naturalHeight: number;
          }
        >();

        mangaImages.forEach((img) => {
          const imgSrc = img.dataset.src || img.src;
          if (!imgSrc) return;

          const imgFilename = imgSrc.split('/').pop()?.split('?')[0] || '';
          if (!imgFilename) return;

          const imgRect = img.getBoundingClientRect();
          const scrollTop =
            readingContainer instanceof HTMLElement
              ? readingContainer.scrollTop
              : 0;
          const scrollLeft =
            readingContainer instanceof HTMLElement
              ? readingContainer.scrollLeft
              : 0;

          // Calculate image position relative to reading container
          const topInContainer =
            imgRect.top - readingContainerRect.top + scrollTop;
          const leftInContainer =
            imgRect.left - readingContainerRect.left + scrollLeft;

          // Calculate scale factors (displayed size / natural size)
          const scaleX =
            img.naturalWidth > 0 ? img.offsetWidth / img.naturalWidth : 1;
          const scaleY =
            img.naturalHeight > 0 ? img.offsetHeight / img.naturalHeight : 1;

          imageInfoMap.set(imgFilename, {
            element: img,
            topInContainer,
            leftInContainer,
            scaleX,
            scaleY,
            naturalWidth: img.naturalWidth,
            naturalHeight: img.naturalHeight,
          });
        });

        // Find all OCR overlay elements
        const overlays = document.querySelectorAll(ocrSelector);
        if (overlays.length === 0) {
          return null;
        }

        // Group texts by image
        const imageMap = new Map<
          string,
          Array<{ box: [number, number, number, number]; text: string }>
        >();

        overlays.forEach((overlay) => {
          const element = overlay as HTMLElement;
          const id = element.id || '';

          // Extract image name from ID
          // Format: 'ocr-text-split_003_webp-0' -> 'split_003.webp'
          let imageName = '';
          const idMatch = id.match(/ocr-text-([^-]+_\d+)_(\w+)-\d+/);
          if (idMatch) {
            imageName = `${idMatch[1]}.${idMatch[2]}`;
          } else {
            // Try alternative format: ocr-text-imagename-index
            const altMatch = id.match(/ocr-text-(.+)-\d+$/);
            if (altMatch) {
              imageName = altMatch[1].replace(/_([^_]+)$/, '.$1');
            }
          }

          if (!imageName) {
            return;
          }

          // Get text content from inner span
          const spanElement = element.querySelector('span');
          let text = spanElement?.textContent?.trim() || '';

          if (!text) {
            return;
          }

          // Clean the text (remove [ENGLISH]: or [DRAFT_ENGLISH]: prefixes)
          text = text
            .replace(/[\s\S]*\[(?:ENGLISH|DRAFT_ENGLISH)\]:\s*/i, '')
            .trim();

          // Get the overlay's position in the container (scaled coordinates)
          const style = element.style;
          const overlayLeft = parseInt(style.left, 10) || 0;
          const overlayTop = parseInt(style.top, 10) || 0;

          // Get scaled dimensions from data attributes
          const scaledWidth =
            parseFloat(element.getAttribute('data-box-width') || '0') || 0;
          const scaledHeight =
            parseFloat(element.getAttribute('data-box-height') || '0') || 0;

          // Get the image info to convert to natural coordinates
          const imageInfo = imageInfoMap.get(imageName);
          if (!imageInfo) {
            // Image not found, try to find by partial match
            let foundKey = '';
            for (const key of imageInfoMap.keys()) {
              if (
                key.includes(imageName.replace('.', '_')) ||
                imageName.includes(key.replace('.', '_'))
              ) {
                foundKey = key;
                break;
              }
            }
            if (!foundKey) {
              return;
            }
          }

          const imgInfo = imageInfo || imageInfoMap.get(imageName);
          if (!imgInfo) {
            return;
          }

          // Calculate position relative to the image (in scaled/displayed coordinates)
          // The overlay uses transform: translateX(-50%), so overlayLeft is the center X
          // We need to get the left edge: centerX - (width / 2)
          const overlayLeftEdge = overlayLeft - scaledWidth / 2;

          // Position relative to image (in displayed/scaled coordinates)
          const relativeX = overlayLeftEdge - imgInfo.leftInContainer;
          const relativeY = overlayTop - imgInfo.topInContainer;

          // Convert to natural image coordinates (unscale)
          const naturalX = Math.round(relativeX / imgInfo.scaleX);
          const naturalY = Math.round(relativeY / imgInfo.scaleY);
          const naturalWidth = Math.round(scaledWidth / imgInfo.scaleX);
          const naturalHeight = Math.round(scaledHeight / imgInfo.scaleY);

          // Create box array [x, y, width, height] in natural image coordinates
          const box: [number, number, number, number] = [
            Math.max(0, naturalX),
            Math.max(0, naturalY),
            naturalWidth,
            naturalHeight,
          ];

          // Add to image map
          if (!imageMap.has(imageName)) {
            imageMap.set(imageName, []);
          }
          imageMap.get(imageName)!.push({ box, text });
        });

        // Convert map to array format and fill in missing images
        const result: Array<{
          image: string;
          texts: Array<{ box: [number, number, number, number]; text: string }>;
        }> = [];

        // Parse image numbers to find the range and pattern
        const imageNumbers: {
          name: string;
          num: number;
          prefix: string;
          ext: string;
        }[] = [];
        imageMap.forEach((_, imageName) => {
          // Match patterns like "split_003.webp", "page_001.jpg", etc.
          const match = imageName.match(/^(.+?)(\d+)\.(\w+)$/);
          if (match) {
            imageNumbers.push({
              name: imageName,
              num: parseInt(match[2], 10),
              prefix: match[1],
              ext: match[3],
            });
          }
        });

        if (imageNumbers.length > 0) {
          // Sort by number
          imageNumbers.sort((a, b) => a.num - b.num);

          // Get the pattern from the first image
          const { prefix, ext } = imageNumbers[0];
          const minNum = imageNumbers[0].num;
          const maxNum = imageNumbers[imageNumbers.length - 1].num;

          // Determine padding length from existing filenames
          const padLength = imageNumbers[0].name.match(/\d+/)?.[0].length || 3;

          // Fill in all images from min to max
          for (let i = minNum; i <= maxNum; i++) {
            const paddedNum = String(i).padStart(padLength, '0');
            const imageName = `${prefix}${paddedNum}.${ext}`;
            const texts = imageMap.get(imageName) || [];
            result.push({ image: imageName, texts });
          }
        } else {
          // Fallback: just use what we have
          imageMap.forEach((texts, image) => {
            result.push({ image, texts });
          });
          // Sort by image name
          result.sort((a, b) => a.image.localeCompare(b.image));
        }

        return result.length > 0 ? result : null;
      }, selector);

      return ocrData;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`Failed to extract OCR data from DOM: ${errorMessage}`);
      return null;
    }
  }

  async downloadFile(url: string, filePath: string): Promise<void> {
    try {
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Referer: new URL(url).origin + '/',
        },
        timeout: 60000,
      });

      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, Buffer.from(response.data));
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to download ${url}: ${errorMessage}`);
      throw error;
    }
  }

  async saveChapterMetadata(
    manhwaId: string,
    chapterId: string,
    metadata: {
      chapterUrl: string;
      images: Array<{ pageNumber: number; filename: string; url: string }>;
      ocrData: OcrImageData[] | null;
    },
  ): Promise<string> {
    const storagePath = path.join(
      process.cwd(),
      'storage',
      `manhwa-${manhwaId}`,
      `chapter-${chapterId}`,
    );
    await fs.mkdir(storagePath, { recursive: true });

    const metadataPath = path.join(storagePath, 'chapter.json');
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

    return metadataPath;
  }

  private extractChapterId(url: string): string {
    // Try multiple URL patterns
    const patterns = [
      /manga\/([^/]+)\/chapter-(\d+)/, // manga/title/chapter-3
      /manga\/([^/]+)\/(\d+)/, // manga/title/3
      /chapter\/([^/]+)\/(\d+)/, // chapter/title/3
      /read\/([^/]+)\/(\d+)/, // read/title/3
      /([^/]+)\/chapter[_-]?(\d+)/i, // title/chapter_3 or title/chapter-3
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return `${match[1]}-chapter-${match[2]}`;
      }
    }

    // Fallback: use URL hash
    return Buffer.from(url)
      .toString('base64')
      .replace(/[^a-zA-Z0-9]/g, '')
      .substring(0, 32);
  }
}
