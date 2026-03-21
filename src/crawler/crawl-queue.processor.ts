import {
  OnQueueActive,
  OnQueueCompleted,
  OnQueueError,
  OnQueueFailed,
  OnQueueStalled,
  OnQueueWaiting,
  Process,
  Processor,
} from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as Bull from 'bull';
import { Repository } from 'typeorm';
import { ChapterCrawlerService } from '../chapter-crawler/chapter-crawler.service';
import { Chapter } from '../chapter/model/chapter.entity';
import { ChapterStatus } from '../chapter/model/chapter.enum';
import { Manhwa } from '../manhwa/model/manhwa.entity';
import { CrawlBatch, CrawlBatchStatus } from './model/crawl-batch.entity';
import { CrawlTask, CrawlTaskStatus } from './model/crawl-task.entity';

export const CRAWL_QUEUE_NAME = 'crawl-queue';

export interface CrawlJobData {
  taskId: string;
  batchId: string;
  manhwaId: string;
  chapterNo: number;
  sourceUrl: string;
  attempt?: number;
}

export interface CrawlJobResult {
  taskId: string;
  success: boolean;
  chapterId?: string;
  imagesCount?: number;
  errorMessage?: string;
}

@Processor(CRAWL_QUEUE_NAME)
export class CrawlQueueProcessor {
  private readonly logger = new Logger(CrawlQueueProcessor.name);

  constructor(
    @InjectRepository(CrawlTask)
    private readonly crawlTaskRepository: Repository<CrawlTask>,
    @InjectRepository(CrawlBatch)
    private readonly crawlBatchRepository: Repository<CrawlBatch>,
    @InjectRepository(Chapter)
    private readonly chapterRepository: Repository<Chapter>,
    @InjectRepository(Manhwa)
    private readonly manhwaRepository: Repository<Manhwa>,
    private readonly chapterCrawlerService: ChapterCrawlerService,
  ) {}

  @Process({ concurrency: 1 }) // Default processor for all jobs
  async handleCrawlJob(job: Bull.Job<CrawlJobData>): Promise<CrawlJobResult> {
    const { taskId, manhwaId, chapterNo, sourceUrl } = job.data;

    // Idempotency and duplicate protection:
    // - If the task is already COMPLETED with a chapterId, we skip re-processing
    // - If a chapter for (manhwaId, chapterNo) already exists, we also skip re-processing
    const existingTask = await this.crawlTaskRepository.findOne({
      where: { id: taskId },
    });

    if (
      existingTask &&
      existingTask.status === CrawlTaskStatus.COMPLETED &&
      existingTask.chapterId
    ) {
      const existingChapter = await this.chapterRepository.findOne({
        where: { id: existingTask.chapterId },
      });

      if (existingChapter) {
        this.logger.warn(
          `Job ${job.id} skipped: task ${taskId} already completed for chapter ${existingChapter.chapterNo}`,
        );

        return {
          taskId,
          success: true,
          chapterId: existingChapter.id,
          imagesCount: existingTask.totalImages,
        };
      }
    }

    // Also guard against duplicate chapter creation by (manhwaId, chapterNo)
    const existingChapterByKey = await this.chapterRepository.findOne({
      where: { manhwaId, chapterNo },
    });

    if (existingChapterByKey) {
      this.logger.warn(
        `Job ${job.id} detected existing chapter for manhwa ${manhwaId} chapter ${chapterNo}. Marking task ${taskId} as completed without re-crawling.`,
      );

      await this.crawlTaskRepository.update(taskId, {
        chapterId: existingChapterByKey.id,
        status: CrawlTaskStatus.COMPLETED,
        completedAt: new Date(),
        errorMessage: null,
      });

      return {
        taskId,
        success: true,
        chapterId: existingChapterByKey.id,
        imagesCount: existingTask?.totalImages,
      };
    }

    // Update task status to IN_PROGRESS
    await this.crawlTaskRepository.update(taskId, {
      status: CrawlTaskStatus.IN_PROGRESS,
      startedAt: new Date(),
    });

    try {
      // Perform the actual crawl
      const crawlResult = await this.chapterCrawlerService.crawlChapter({
        manhwaId,
        chapterId: String(chapterNo),
        url: sourceUrl,
      });

      // Update task progress
      await this.crawlTaskRepository.update(taskId, {
        totalImages: crawlResult.imagesCount,
        imagesDownloaded: crawlResult.imagesCount,
        progressPercent: 100,
      });

      // Create chapter record
      const chapter = this.chapterRepository.create({
        manhwaId,
        chapterNo,
        sourceUrl,
        status: ChapterStatus.RAW,
        s3BasePath: crawlResult.s3BasePath || '',
        enJsonPath: crawlResult.s3EnJsonPath || '',
        mmJsonPath: crawlResult.s3MmJsonPath || '',
      });

      const savedChapter = await this.chapterRepository.save(chapter);

      // Update task with chapter ID and mark as completed
      await this.crawlTaskRepository.update(taskId, {
        chapterId: savedChapter.id,
        status: CrawlTaskStatus.COMPLETED,
        completedAt: new Date(),
        errorMessage: null,
      });

      // Update manhwa stats
      const manhwa = await this.manhwaRepository.findOne({
        where: { id: manhwaId },
      });

      if (manhwa) {
        await this.manhwaRepository.update(manhwaId, {
          lastCrawledChapter: Math.max(manhwa.lastCrawledChapter, chapterNo),
          totalChapters: manhwa.totalChapters + 1,
        });
      }

      return {
        taskId,
        success: true,
        chapterId: savedChapter.id,
        imagesCount: crawlResult.imagesCount,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Job ${job.id} failed: ${errorMessage}`);

      // Update task with error (Bull will handle retries)
      await this.crawlTaskRepository.update(taskId, {
        status: CrawlTaskStatus.RETRYING,
        errorMessage,
        retryCount: job.attemptsMade,
      });

      throw error; // Re-throw to let Bull handle retries
    }
  }

  @OnQueueActive()
  onActive(job: Bull.Job<CrawlJobData>) {
    void job;
  }

  @OnQueueCompleted()
  async onCompleted(job: Bull.Job<CrawlJobData>, result: CrawlJobResult) {
    void result;
    // Update batch progress
    await this.updateBatchProgress(job.data.batchId);
  }

  @OnQueueFailed()
  async onFailed(job: Bull.Job<CrawlJobData>, error: Error) {
    this.logger.error(`Job ${job.id} failed permanently: ${error.message}`);

    // Mark task as failed after all retries exhausted
    await this.crawlTaskRepository.update(job.data.taskId, {
      status: CrawlTaskStatus.FAILED,
      errorMessage: error.message,
      completedAt: new Date(),
    });

    // Update batch progress
    await this.updateBatchProgress(job.data.batchId);
  }

  @OnQueueStalled()
  onStalled(job: Bull.Job<CrawlJobData>) {
    this.logger.warn(`Job ${job.id} stalled: Task ${job.data.taskId}`);
  }

  @OnQueueError()
  onError(error: Error) {
    this.logger.error(`Queue error: ${error.message}`, error.stack);
  }

  @OnQueueWaiting()
  onWaiting(jobId: string) {
    void jobId;
  }

  private async updateBatchProgress(batchId: string): Promise<void> {
    const tasks = await this.crawlTaskRepository.find({
      where: { batchId },
    });

    const completed = tasks.filter(
      (t) => t.status === CrawlTaskStatus.COMPLETED,
    ).length;
    const failed = tasks.filter(
      (t) => t.status === CrawlTaskStatus.FAILED,
    ).length;
    const total = tasks.length;
    const processed = completed + failed;

    const progressPercent =
      total > 0 ? Math.round((processed / total) * 100) : 0;

    // Determine batch status
    let status: CrawlBatchStatus;
    if (processed < total) {
      status = CrawlBatchStatus.IN_PROGRESS;
    } else if (failed === 0) {
      status = CrawlBatchStatus.COMPLETED;
    } else if (completed === 0) {
      status = CrawlBatchStatus.FAILED;
    } else {
      status = CrawlBatchStatus.PARTIAL;
    }

    await this.crawlBatchRepository.update(batchId, {
      completedTasks: completed,
      failedTasks: failed,
      progressPercent,
      status,
      ...(processed === total ? { completedAt: new Date() } : {}),
    });
  }
}
