import { InjectQueue } from '@nestjs/bull';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as Bull from 'bull';
import { DataSource, In, Repository } from 'typeorm';
import { ChapterCrawlerService } from '../chapter-crawler/chapter-crawler.service';
import { Chapter } from '../chapter/model/chapter.entity';
import { ManhwaStatus } from '../manhwa/model/manhwa-status.enum';
import { Manhwa } from '../manhwa/model/manhwa.entity';
import { S3Service } from '../s3/s3.service';
import { CRAWL_QUEUE_NAME, CrawlJobData } from './crawl-queue.processor';
import {
  CrawlBatch,
  CrawlBatchStatus,
  CrawlBatchType,
} from './model/crawl-batch.entity';
import { CrawlTask, CrawlTaskStatus } from './model/crawl-task.entity';
import {
  CrawlAllDto,
  CrawlBatchResponse,
  CrawlNextChapterDto,
  CrawlOcrOnlyDto,
  CrawlOcrOnlyResponse,
  CrawlRangeDto,
  CrawlSpecificChapterDto,
  CrawlTaskResponse,
  ManhwaCrawlStatus,
  ReCrawlDto,
  ReCrawlResponse,
} from './model/crawl.dto';

@Injectable()
export class CrawlService implements OnModuleInit {
  private readonly logger = new Logger(CrawlService.name);

  constructor(
    @InjectRepository(CrawlTask)
    private readonly crawlTaskRepository: Repository<CrawlTask>,
    @InjectRepository(CrawlBatch)
    private readonly crawlBatchRepository: Repository<CrawlBatch>,
    @InjectRepository(Manhwa)
    private readonly manhwaRepository: Repository<Manhwa>,
    @InjectRepository(Chapter)
    private readonly chapterRepository: Repository<Chapter>,
    private readonly dataSource: DataSource,
    private readonly chapterCrawlerService: ChapterCrawlerService,
    private readonly s3Service: S3Service,
    @InjectQueue(CRAWL_QUEUE_NAME)
    private readonly crawlQueue: Bull.Queue<CrawlJobData>,
  ) {}

  /**
   * On module init - recover any stuck batches from server restart
   */
  async onModuleInit() {
    await this.recoverStuckBatches();
  }

  /**
   * Recover stuck IN_PROGRESS batches after server restart
   */
  private async recoverStuckBatches() {
    // Find batches that were IN_PROGRESS when server stopped
    const stuckBatches = await this.crawlBatchRepository.find({
      where: { status: CrawlBatchStatus.IN_PROGRESS },
    });

    for (const batch of stuckBatches) {
      // Find tasks that weren't completed
      const pendingTasks = await this.crawlTaskRepository.find({
        where: {
          batchId: batch.id,
          status: In([
            CrawlTaskStatus.PENDING,
            CrawlTaskStatus.IN_PROGRESS,
            CrawlTaskStatus.RETRYING,
          ]),
        },
      });

      if (pendingTasks.length > 0) {
        // Re-queue the pending tasks
        for (const task of pendingTasks) {
          await this.addTaskToQueue(task, batch.id);
        }
      }
    }
  }

  /**
   * Add a task to the crawl queue
   */
  private async addTaskToQueue(
    task: CrawlTask,
    batchId: string,
  ): Promise<void> {
    const jobData: CrawlJobData = {
      taskId: task.id,
      batchId,
      manhwaId: task.manhwaId,
      chapterNo: task.chapterNo,
      sourceUrl: task.sourceUrl,
    };

    await this.crawlQueue.add(jobData, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000, // 5s, 10s, 20s
      },
      removeOnComplete: { count: 1000 }, // Keep last 1000 completed jobs
      removeOnFail: { count: 5000 }, // Keep last 5000 failed jobs
      jobId: task.id, // Use task ID as job ID to prevent duplicates
    });
  }

  /**
   * Build the chapter URL based on manhwa config
   */
  private buildChapterUrl(manhwa: Manhwa, chapterNo: number): string {
    // If custom pattern exists, use it
    if (manhwa.sourceUrlPattern) {
      return manhwa.sourceUrlPattern.replace('{chapter}', String(chapterNo));
    }

    // Default pattern: baseUrl + chapter-{chapterNo}
    if (manhwa.sourceUrl) {
      const baseUrl = manhwa.sourceUrl.replace(/\/$/, ''); // Remove trailing slash
      return `${baseUrl}/chapter-${chapterNo}`;
    }

    throw new BadRequestException(
      `Manhwa ${manhwa.id} has no source URL configured`,
    );
  }

  /**
   * Crawl the next chapter for a single manhwa
   */
  async crawlNextChapter(
    manhwaId: string,
    dto: CrawlNextChapterDto,
  ): Promise<CrawlBatchResponse> {
    const manhwa = await this.manhwaRepository.findOne({
      where: { id: manhwaId },
    });

    if (!manhwa) {
      throw new NotFoundException(`Manhwa with ID ${manhwaId} not found`);
    }

    if (!manhwa.crawlEnabled) {
      throw new BadRequestException(
        `Crawling is disabled for manhwa: ${manhwa.title}`,
      );
    }

    const nextChapter = manhwa.lastCrawledChapter + 1;

    // Build URL
    const sourceUrl =
      dto.sourceUrl || this.buildChapterUrl(manhwa, nextChapter);

    // Check if chapter already exists
    const existingChapter = await this.chapterRepository.findOne({
      where: { manhwaId, chapterNo: nextChapter },
    });

    if (existingChapter) {
      throw new BadRequestException(
        `Chapter ${nextChapter} already exists for ${manhwa.title}`,
      );
    }

    // Create batch and task
    const batch = await this.createBatchWithTasks(
      CrawlBatchType.NEXT,
      `Crawl next chapter (${nextChapter}) for ${manhwa.title}`,
      [{ manhwa, chapterNo: nextChapter, sourceUrl }],
    );

    // Add tasks to queue (Redis-backed, survives restarts)
    await this.queueBatchTasks(batch.id);

    return this.getBatchResponse(batch.id);
  }

  /**
   * Crawl a specific chapter for a manhwa
   */
  async crawlSpecificChapter(
    manhwaId: string,
    chapterNo: number,
    dto: CrawlSpecificChapterDto,
  ): Promise<CrawlBatchResponse> {
    const manhwa = await this.manhwaRepository.findOne({
      where: { id: manhwaId },
    });

    if (!manhwa) {
      throw new NotFoundException(`Manhwa with ID ${manhwaId} not found`);
    }

    // Build URL
    const sourceUrl = dto.sourceUrl || this.buildChapterUrl(manhwa, chapterNo);

    // Check if chapter already exists
    const existingChapter = await this.chapterRepository.findOne({
      where: { manhwaId, chapterNo },
    });

    if (existingChapter) {
      throw new BadRequestException(
        `Chapter ${chapterNo} already exists for ${manhwa.title}`,
      );
    }

    // Create batch and task
    const batch = await this.createBatchWithTasks(
      CrawlBatchType.SINGLE,
      `Crawl chapter ${chapterNo} for ${manhwa.title}`,
      [{ manhwa, chapterNo, sourceUrl }],
    );

    // Add tasks to queue (Redis-backed, survives restarts)
    await this.queueBatchTasks(batch.id);

    return this.getBatchResponse(batch.id);
  }

  /**
   * Crawl a range of chapters for a manhwa
   */
  async crawlChapterRange(
    manhwaId: string,
    dto: CrawlRangeDto,
  ): Promise<CrawlBatchResponse> {
    const manhwa = await this.manhwaRepository.findOne({
      where: { id: manhwaId },
    });

    if (!manhwa) {
      throw new NotFoundException(`Manhwa with ID ${manhwaId} not found`);
    }

    if (dto.fromChapter > dto.toChapter) {
      throw new BadRequestException(
        'fromChapter must be less than or equal to toChapter',
      );
    }

    // Get existing chapters in range
    const existingChapters = await this.chapterRepository.find({
      where: { manhwaId },
      select: ['chapterNo'],
    });
    const existingChapterNos = new Set(
      existingChapters.map((c) => c.chapterNo),
    );

    // Build tasks for missing chapters
    const tasks: { manhwa: Manhwa; chapterNo: number; sourceUrl: string }[] =
      [];
    for (let ch = dto.fromChapter; ch <= dto.toChapter; ch++) {
      if (!existingChapterNos.has(ch)) {
        const sourceUrl = dto.sourceUrl
          ? dto.sourceUrl.replace('{chapter}', String(ch))
          : this.buildChapterUrl(manhwa, ch);
        tasks.push({ manhwa, chapterNo: ch, sourceUrl });
      }
    }

    if (tasks.length === 0) {
      throw new BadRequestException(
        `All chapters from ${dto.fromChapter} to ${dto.toChapter} already exist`,
      );
    }

    // Create batch and tasks
    const batch = await this.createBatchWithTasks(
      CrawlBatchType.RANGE,
      `Crawl chapters ${dto.fromChapter}-${dto.toChapter} for ${manhwa.title}`,
      tasks,
    );

    // Add tasks to queue (Redis-backed, survives restarts)
    await this.queueBatchTasks(batch.id);

    return this.getBatchResponse(batch.id);
  }

  /**
   * Crawl next chapter for all active manhwas
   */
  async crawlAllManhwas(dto: CrawlAllDto): Promise<CrawlBatchResponse> {
    // Get all active manhwas with crawlEnabled
    let manhwas: Manhwa[];
    if (dto.manhwaIds && dto.manhwaIds.length > 0) {
      manhwas = await this.manhwaRepository.find({
        where: {
          id: In(dto.manhwaIds),
          isActive: true,
          crawlEnabled: true,
          status: ManhwaStatus.ONGOING,
        },
      });
    } else {
      manhwas = await this.manhwaRepository.find({
        where: {
          isActive: true,
          crawlEnabled: true,
          status: ManhwaStatus.ONGOING,
        },
      });
    }

    if (manhwas.length === 0) {
      throw new BadRequestException('No active manhwas with crawling enabled');
    }

    // Build tasks for each manhwa's next chapter
    const tasks: { manhwa: Manhwa; chapterNo: number; sourceUrl: string }[] =
      [];

    for (const manhwa of manhwas) {
      const nextChapter = manhwa.lastCrawledChapter + 1;

      // Check if chapter already exists
      const existingChapter = await this.chapterRepository.findOne({
        where: { manhwaId: manhwa.id, chapterNo: nextChapter },
      });

      if (!existingChapter) {
        try {
          const sourceUrl = this.buildChapterUrl(manhwa, nextChapter);
          tasks.push({ manhwa, chapterNo: nextChapter, sourceUrl });
        } catch {
          this.logger.warn(
            `Skipping ${manhwa.title}: no source URL configured`,
          );
        }
      }
    }

    if (tasks.length === 0) {
      throw new BadRequestException('No new chapters to crawl for any manhwa');
    }

    // Create batch and tasks
    const batch = await this.createBatchWithTasks(
      CrawlBatchType.ALL,
      `Crawl latest chapters for ${tasks.length} manhwas`,
      tasks,
    );

    // Add tasks to queue (Redis-backed, survives restarts)
    await this.queueBatchTasks(batch.id);

    return this.getBatchResponse(batch.id);
  }

  /**
   * Crawl OCR data only for an existing chapter (without downloading images)
   */
  async crawlOcrOnly(
    manhwaId: string,
    chapterNo: number,
    dto: CrawlOcrOnlyDto,
  ): Promise<CrawlOcrOnlyResponse> {
    const manhwa = await this.manhwaRepository.findOne({
      where: { id: manhwaId },
    });

    if (!manhwa) {
      throw new NotFoundException(`Manhwa with ID ${manhwaId} not found`);
    }

    // Check if chapter exists
    const chapter = await this.chapterRepository.findOne({
      where: { manhwaId, chapterNo },
    });

    if (!chapter) {
      throw new NotFoundException(
        `Chapter ${chapterNo} not found for manhwa ${manhwa.title}`,
      );
    }

    // Build URL
    const sourceUrl = dto.sourceUrl || this.buildChapterUrl(manhwa, chapterNo);

    try {
      const result = await this.chapterCrawlerService.crawlOcrOnly({
        manhwaId,
        chapterId: String(chapterNo),
        url: sourceUrl,
      });

      // Update chapter with new OCR paths if successful
      if (result.success && result.s3EnJsonPath) {
        await this.chapterRepository.update(chapter.id, {
          enJsonPath: result.s3EnJsonPath,
          mmJsonPath: result.s3MmJsonPath || '',
        });
      }

      return {
        chapterId: chapter.id,
        manhwaId,
        manhwaTitle: manhwa.title,
        chapterNo,
        s3BasePath: result.s3BasePath,
        s3EnJsonPath: result.s3EnJsonPath,
        s3MmJsonPath: result.s3MmJsonPath,
        totalImages: result.totalImages,
        totalTextBoxes: result.totalTextBoxes,
        success: result.success,
        message: result.message,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`OCR crawl failed: ${errorMessage}`);
      throw new BadRequestException(`OCR crawl failed: ${errorMessage}`);
    }
  }

  /**
   * Crawl OCR data for a range of existing chapters
   */
  async crawlOcrRange(
    manhwaId: string,
    fromChapter: number,
    toChapter: number,
    sourceUrlPattern?: string,
  ): Promise<CrawlOcrOnlyResponse[]> {
    const manhwa = await this.manhwaRepository.findOne({
      where: { id: manhwaId },
    });

    if (!manhwa) {
      throw new NotFoundException(`Manhwa with ID ${manhwaId} not found`);
    }

    if (fromChapter > toChapter) {
      throw new BadRequestException(
        'fromChapter must be less than or equal to toChapter',
      );
    }

    // Get existing chapters in range
    const chapters = await this.chapterRepository.find({
      where: { manhwaId },
    });
    const chapterMap = new Map(chapters.map((c) => [c.chapterNo, c]));

    const results: CrawlOcrOnlyResponse[] = [];

    for (let ch = fromChapter; ch <= toChapter; ch++) {
      const chapter = chapterMap.get(ch);
      if (!chapter) {
        results.push({
          chapterId: '',
          manhwaId,
          manhwaTitle: manhwa.title,
          chapterNo: ch,
          s3BasePath: '',
          s3EnJsonPath: null,
          s3MmJsonPath: null,
          totalImages: 0,
          totalTextBoxes: 0,
          success: false,
          message: `Chapter ${ch} does not exist`,
        });
        continue;
      }

      try {
        const sourceUrl = sourceUrlPattern
          ? sourceUrlPattern.replace('{chapter}', String(ch))
          : this.buildChapterUrl(manhwa, ch);

        const result = await this.chapterCrawlerService.crawlOcrOnly({
          manhwaId,
          chapterId: String(ch),
          url: sourceUrl,
        });

        // Update chapter with new OCR paths if successful
        if (result.success && result.s3EnJsonPath) {
          await this.chapterRepository.update(chapter.id, {
            enJsonPath: result.s3EnJsonPath,
            mmJsonPath: result.s3MmJsonPath || '',
          });
        }

        results.push({
          chapterId: chapter.id,
          manhwaId,
          manhwaTitle: manhwa.title,
          chapterNo: ch,
          s3BasePath: result.s3BasePath,
          s3EnJsonPath: result.s3EnJsonPath,
          s3MmJsonPath: result.s3MmJsonPath,
          totalImages: result.totalImages,
          totalTextBoxes: result.totalTextBoxes,
          success: result.success,
          message: result.message,
        });

        // Add a small delay between requests
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        results.push({
          chapterId: chapter.id,
          manhwaId,
          manhwaTitle: manhwa.title,
          chapterNo: ch,
          s3BasePath: '',
          s3EnJsonPath: null,
          s3MmJsonPath: null,
          totalImages: 0,
          totalTextBoxes: 0,
          success: false,
          message: `Failed: ${errorMessage}`,
        });
      }
    }

    return results;
  }

  /**
   * Re-crawl a chapter - full (images + JSON)
   * Deletes existing images and re-downloads everything
   */
  async reCrawlFull(
    chapterId: string,
    dto: ReCrawlDto,
  ): Promise<ReCrawlResponse> {
    // Find the chapter
    const chapter = await this.chapterRepository.findOne({
      where: { id: chapterId },
    });

    if (!chapter) {
      throw new NotFoundException(`Chapter with ID ${chapterId} not found`);
    }

    // Find the manhwa
    const manhwa = await this.manhwaRepository.findOne({
      where: { id: chapter.manhwaId },
    });

    if (!manhwa) {
      throw new NotFoundException(
        `Manhwa with ID ${chapter.manhwaId} not found`,
      );
    }

    // Build URL
    const sourceUrl =
      dto.sourceUrl ||
      chapter.sourceUrl ||
      this.buildChapterUrl(manhwa, chapter.chapterNo);

    try {
      // Step 1: Delete existing images from S3
      const s3BasePath =
        chapter.s3BasePath ||
        `manhwa/${manhwa.id}/chapter-${chapter.chapterNo}`;
      const imagesPath = `${s3BasePath}/images`;

      let deletedImagesCount = 0;
      try {
        deletedImagesCount = await this.s3Service.deleteFolder(imagesPath);
      } catch (error) {
        this.logger.warn(
          `Failed to delete existing images (may not exist): ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }

      // Step 2: Re-crawl the chapter
      const crawlResult = await this.chapterCrawlerService.crawlChapter({
        manhwaId: manhwa.id,
        chapterId: String(chapter.chapterNo),
        url: sourceUrl,
      });

      // Step 3: Update chapter with new paths
      await this.chapterRepository.update(chapter.id, {
        s3BasePath: crawlResult.s3BasePath,
        enJsonPath: crawlResult.s3EnJsonPath || '',
        mmJsonPath: crawlResult.s3MmJsonPath || '',
        sourceUrl: sourceUrl,
      });

      return {
        chapterId: chapter.id,
        manhwaId: manhwa.id,
        manhwaTitle: manhwa.title,
        chapterNo: chapter.chapterNo,
        type: 'full',
        s3BasePath: crawlResult.s3BasePath,
        imagesCount: crawlResult.imagesCount,
        deletedImagesCount,
        s3EnJsonPath: crawlResult.s3EnJsonPath,
        s3MmJsonPath: crawlResult.s3MmJsonPath,
        totalTextBoxes: 0, // Will be calculated if OCR is available
        success: true,
        message: `Successfully re-crawled chapter. Deleted ${deletedImagesCount} old images, uploaded ${crawlResult.imagesCount} new images.`,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Full re-crawl failed: ${errorMessage}`);
      throw new BadRequestException(`Full re-crawl failed: ${errorMessage}`);
    }
  }

  /**
   * Re-crawl a chapter - JSON only (en.json, mm.json)
   * Only re-downloads OCR data without touching images
   */
  async reCrawlJsonOnly(
    chapterId: string,
    dto: ReCrawlDto,
  ): Promise<ReCrawlResponse> {
    // Find the chapter
    const chapter = await this.chapterRepository.findOne({
      where: { id: chapterId },
    });

    if (!chapter) {
      throw new NotFoundException(`Chapter with ID ${chapterId} not found`);
    }

    // Find the manhwa
    const manhwa = await this.manhwaRepository.findOne({
      where: { id: chapter.manhwaId },
    });

    if (!manhwa) {
      throw new NotFoundException(
        `Manhwa with ID ${chapter.manhwaId} not found`,
      );
    }

    // Build URL
    const sourceUrl =
      dto.sourceUrl ||
      chapter.sourceUrl ||
      this.buildChapterUrl(manhwa, chapter.chapterNo);

    try {
      // Use the OCR-only crawl method
      const result = await this.chapterCrawlerService.crawlOcrOnly({
        manhwaId: manhwa.id,
        chapterId: String(chapter.chapterNo),
        url: sourceUrl,
      });

      // Update chapter with new OCR paths if successful
      if (result.success && result.s3EnJsonPath) {
        await this.chapterRepository.update(chapter.id, {
          enJsonPath: result.s3EnJsonPath,
          mmJsonPath: result.s3MmJsonPath || '',
        });
      }

      return {
        chapterId: chapter.id,
        manhwaId: manhwa.id,
        manhwaTitle: manhwa.title,
        chapterNo: chapter.chapterNo,
        type: 'json_only',
        s3BasePath: result.s3BasePath,
        s3EnJsonPath: result.s3EnJsonPath,
        s3MmJsonPath: result.s3MmJsonPath,
        totalTextBoxes: result.totalTextBoxes,
        success: result.success,
        message: result.message,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`JSON-only re-crawl failed: ${errorMessage}`);
      throw new BadRequestException(
        `JSON-only re-crawl failed: ${errorMessage}`,
      );
    }
  }

  /**
   * Create a batch with tasks
   */
  private async createBatchWithTasks(
    type: CrawlBatchType,
    description: string,
    taskData: { manhwa: Manhwa; chapterNo: number; sourceUrl: string }[],
  ): Promise<CrawlBatch> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Create batch
      const batch = queryRunner.manager.create(CrawlBatch, {
        type,
        status: CrawlBatchStatus.PENDING,
        totalTasks: taskData.length,
        description,
      });
      const savedBatch = await queryRunner.manager.save(batch);

      // Create tasks
      for (const data of taskData) {
        const task = queryRunner.manager.create(CrawlTask, {
          manhwaId: data.manhwa.id,
          chapterNo: data.chapterNo,
          sourceUrl: data.sourceUrl,
          batchId: savedBatch.id,
          status: CrawlTaskStatus.PENDING,
        });
        await queryRunner.manager.save(task);
      }

      await queryRunner.commitTransaction();
      return savedBatch;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Add all tasks from a batch to the Redis queue
   */
  private async queueBatchTasks(batchId: string): Promise<void> {
    // Update batch status to IN_PROGRESS
    await this.crawlBatchRepository.update(batchId, {
      status: CrawlBatchStatus.IN_PROGRESS,
      startedAt: new Date(),
    });

    // Get all tasks for this batch
    const tasks = await this.crawlTaskRepository.find({
      where: { batchId },
      order: { createdAt: 'ASC' },
    });

    // Add each task to the queue
    for (const task of tasks) {
      await this.addTaskToQueue(task, batchId);
    }
  }

  /**
   * Get batch response with tasks
   */
  async getBatchResponse(batchId: string): Promise<CrawlBatchResponse> {
    const batch = await this.crawlBatchRepository.findOne({
      where: { id: batchId },
    });

    if (!batch) {
      throw new NotFoundException(`Batch with ID ${batchId} not found`);
    }

    const tasks = await this.crawlTaskRepository.find({
      where: { batchId },
      relations: ['manhwa'],
      order: { createdAt: 'ASC' },
    });

    return {
      batchId: batch.id,
      type: batch.type,
      status: batch.status,
      totalTasks: batch.totalTasks,
      completedTasks: batch.completedTasks,
      failedTasks: batch.failedTasks,
      progressPercent: batch.progressPercent,
      startedAt: batch.startedAt,
      completedAt: batch.completedAt,
      tasks: tasks.map((t) => this.mapTaskToResponse(t)),
    };
  }

  /**
   * Get single task status
   */
  async getTaskStatus(taskId: string): Promise<CrawlTaskResponse> {
    const task = await this.crawlTaskRepository.findOne({
      where: { id: taskId },
      relations: ['manhwa'],
    });

    if (!task) {
      throw new NotFoundException(`Task with ID ${taskId} not found`);
    }

    return this.mapTaskToResponse(task);
  }

  /**
   * Get all batches with pagination
   */
  async listBatches(
    page: number = 1,
    limit: number = 20,
  ): Promise<{
    data: CrawlBatch[];
    total: number;
    page: number;
    limit: number;
  }> {
    const [data, total] = await this.crawlBatchRepository.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { data, total, page, limit };
  }

  /**
   * Get crawl status for all manhwas
   */
  async getManhwaCrawlStatuses(): Promise<ManhwaCrawlStatus[]> {
    const manhwas = await this.manhwaRepository.find({
      where: { isActive: true },
      order: { title: 'ASC' },
    });

    const statuses: ManhwaCrawlStatus[] = [];

    for (const manhwa of manhwas) {
      // Get last task for this manhwa
      const lastTask = await this.crawlTaskRepository.findOne({
        where: { manhwaId: manhwa.id },
        order: { createdAt: 'DESC' },
        relations: ['manhwa'],
      });

      statuses.push({
        manhwaId: manhwa.id,
        title: manhwa.title,
        sourceUrl: manhwa.sourceUrl,
        lastCrawledChapter: manhwa.totalChapters,
        nextChapterToCrawl: manhwa.totalChapters + 1,
        crawlEnabled: manhwa.crawlEnabled,
        lastTask: lastTask ? this.mapTaskToResponse(lastTask) : null,
      });
    }

    return statuses;
  }

  /**
   * Get crawl status for a single manhwa
   */
  async getManhwaCrawlStatus(manhwaId: string): Promise<ManhwaCrawlStatus> {
    const manhwa = await this.manhwaRepository.findOne({
      where: { id: manhwaId },
    });

    if (!manhwa) {
      throw new NotFoundException(`Manhwa with ID ${manhwaId} not found`);
    }

    const lastTask = await this.crawlTaskRepository.findOne({
      where: { manhwaId },
      order: { createdAt: 'DESC' },
      relations: ['manhwa'],
    });

    return {
      manhwaId: manhwa.id,
      title: manhwa.title,
      sourceUrl: manhwa.sourceUrl,
      lastCrawledChapter: manhwa.lastCrawledChapter,
      nextChapterToCrawl: manhwa.lastCrawledChapter + 1,
      crawlEnabled: manhwa.crawlEnabled,
      lastTask: lastTask ? this.mapTaskToResponse(lastTask) : null,
    };
  }

  /**
   * Retry a failed task
   */
  async retryTask(taskId: string): Promise<CrawlTaskResponse> {
    const task = await this.crawlTaskRepository.findOne({
      where: { id: taskId },
      relations: ['manhwa'],
    });

    if (!task) {
      throw new NotFoundException(`Task with ID ${taskId} not found`);
    }

    if (task.status !== CrawlTaskStatus.FAILED) {
      throw new BadRequestException('Can only retry failed tasks');
    }

    // Reset task for retry
    await this.crawlTaskRepository.update(taskId, {
      status: CrawlTaskStatus.PENDING,
      retryCount: 0,
      errorMessage: null,
      startedAt: null,
      completedAt: null,
    });

    // Reload task
    const updatedTask = await this.crawlTaskRepository.findOne({
      where: { id: taskId },
      relations: ['manhwa'],
    });

    // Add to queue for processing
    if (updatedTask && task.batchId) {
      await this.addTaskToQueue(updatedTask, task.batchId);
    }

    return this.mapTaskToResponse(updatedTask || task);
  }

  /**
   * Cancel a pending or in-progress batch
   */
  async cancelBatch(batchId: string): Promise<CrawlBatchResponse> {
    const batch = await this.crawlBatchRepository.findOne({
      where: { id: batchId },
    });

    if (!batch) {
      throw new NotFoundException(`Batch with ID ${batchId} not found`);
    }

    if (
      batch.status === CrawlBatchStatus.COMPLETED ||
      batch.status === CrawlBatchStatus.FAILED
    ) {
      throw new BadRequestException('Cannot cancel completed or failed batch');
    }

    // Get pending tasks to remove from queue
    const pendingTasks = await this.crawlTaskRepository.find({
      where: {
        batchId,
        status: In([CrawlTaskStatus.PENDING, CrawlTaskStatus.RETRYING]),
      },
    });

    // Remove jobs from Redis queue
    for (const task of pendingTasks) {
      try {
        const job = await this.crawlQueue.getJob(task.id);
        if (job) {
          await job.remove();
        }
      } catch (error) {
        this.logger.warn(
          `Failed to remove job ${task.id} from queue: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }

    // Update batch status
    await this.crawlBatchRepository.update(batchId, {
      status: CrawlBatchStatus.FAILED,
      completedAt: new Date(),
    });

    // Cancel pending tasks in DB
    await this.crawlTaskRepository.update(
      {
        batchId,
        status: In([CrawlTaskStatus.PENDING, CrawlTaskStatus.RETRYING]),
      },
      { status: CrawlTaskStatus.FAILED, errorMessage: 'Batch cancelled' },
    );

    return this.getBatchResponse(batchId);
  }

  private mapTaskToResponse(task: CrawlTask): CrawlTaskResponse {
    return {
      taskId: task.id,
      manhwaId: task.manhwaId,
      manhwaTitle: task.manhwa?.title,
      chapterNo: task.chapterNo,
      status: task.status,
      sourceUrl: task.sourceUrl,
      progressPercent: task.progressPercent,
      retryCount: task.retryCount,
      errorMessage: task.errorMessage,
      startedAt: task.startedAt,
      completedAt: task.completedAt,
    };
  }

  /**
   * Get queue status and statistics
   */
  async getQueueStatus(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    paused: boolean;
    isPaused: boolean;
  }> {
    const [waiting, active, completed, failed, delayed, isPaused] =
      await Promise.all([
        this.crawlQueue.getWaitingCount(),
        this.crawlQueue.getActiveCount(),
        this.crawlQueue.getCompletedCount(),
        this.crawlQueue.getFailedCount(),
        this.crawlQueue.getDelayedCount(),
        this.crawlQueue.isPaused(),
      ]);

    return {
      waiting,
      active,
      completed,
      failed,
      delayed,
      paused: isPaused,
      isPaused,
    };
  }

  /**
   * Pause the crawl queue
   */
  async pauseQueue(): Promise<void> {
    await this.crawlQueue.pause();
  }

  /**
   * Resume the crawl queue
   */
  async resumeQueue(): Promise<void> {
    await this.crawlQueue.resume();
  }

  /**
   * Clean old completed/failed jobs from queue
   */
  async cleanQueue(
    grace: number = 24 * 60 * 60 * 1000,
  ): Promise<{ completed: number; failed: number }> {
    const completed = await this.crawlQueue.clean(grace, 'completed');
    const failed = await this.crawlQueue.clean(grace, 'failed');
    await this.crawlQueue.obliterate({ force: true });

    return {
      completed: completed.length,
      failed: failed.length,
    };
  }

  /**
   * Empty the entire queue (remove all jobs)
   */
  async emptyQueue(): Promise<{ removed: number }> {
    // Get counts before emptying
    const waiting = await this.crawlQueue.getWaitingCount();
    const active = await this.crawlQueue.getActiveCount();
    const delayed = await this.crawlQueue.getDelayedCount();

    // Empty the queue
    await this.crawlQueue.empty();

    // Also clean completed and failed
    await this.crawlQueue.clean(0, 'completed');
    await this.crawlQueue.clean(0, 'failed');

    const removed = waiting + active + delayed;

    return { removed };
  }
}
