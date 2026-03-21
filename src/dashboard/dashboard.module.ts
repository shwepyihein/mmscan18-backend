import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Chapter } from '../chapter/model/chapter.entity';
import { CrawlerModule } from '../crawler/crawler.module';
import { Manhwa } from '../manhwa/model/manhwa.entity';
import { S3Module } from '../s3/s3.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Chapter, Manhwa]),
    CrawlerModule,
    S3Module,
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
