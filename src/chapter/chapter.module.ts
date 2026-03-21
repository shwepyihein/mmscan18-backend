import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChapterCrawlerModule } from '../chapter-crawler/chapter-crawler.module';
import { Manhwa } from '../manhwa/model/manhwa.entity';
import { S3Module } from '../s3/s3.module';
import { UsersModule } from '../users/users.module';
import { ChapterController } from './chapter.controller';
import { ChapterService } from './chapter.service';
import { Chapter } from './model/chapter.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Chapter, Manhwa]),
    ChapterCrawlerModule,
    S3Module,
    forwardRef(() => UsersModule),
  ],
  controllers: [ChapterController],
  providers: [ChapterService],
  exports: [ChapterService],
})
export class ChapterModule {}
