import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChapterCrawlerModule } from '../chapter-crawler/chapter-crawler.module';
import { Chapter } from '../chapter/model/chapter.entity';
import { Manhwa } from '../manhwa/model/manhwa.entity';
import { S3Module } from '../s3/s3.module';
import { CRAWL_QUEUE_NAME, CrawlQueueProcessor } from './crawl-queue.processor';
import { CrawlController } from './crawl.controller';
import { CrawlService } from './crawl.service';
import { CrawlBatch } from './model/crawl-batch.entity';
import { CrawlTask } from './model/crawl-task.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Chapter, CrawlTask, CrawlBatch, Manhwa]),
    BullModule.registerQueue({
      name: CRAWL_QUEUE_NAME,
      limiter: {
        max: 5,
        duration: 1000, // 5 jobs per second
      },
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        // Allow long-running crawl jobs (up to 10 minutes)
        timeout: 10 * 60 * 1000,
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      },
    }),
    S3Module,
    ChapterCrawlerModule,
  ],
  controllers: [CrawlController],
  providers: [CrawlService, CrawlQueueProcessor],
  exports: [CrawlService],
})
export class CrawlerModule {}
