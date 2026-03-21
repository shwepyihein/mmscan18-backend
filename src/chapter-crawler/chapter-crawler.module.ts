import { Module } from '@nestjs/common';
import { PuppeteerModule } from '../crawler/puppeteer/puppeteer.module';
import { S3Module } from '../s3/s3.module';
import { ChapterCrawlerService } from './chapter-crawler.service';

@Module({
  imports: [PuppeteerModule, S3Module],
  providers: [ChapterCrawlerService],
  exports: [ChapterCrawlerService],
})
export class ChapterCrawlerModule {}
