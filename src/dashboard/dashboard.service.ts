import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Chapter } from '../chapter/model/chapter.entity';
import { ChapterStatus } from '../chapter/model/chapter.enum';
import { CrawlService } from '../crawler/crawl.service';
import { UserRole } from '../common/enums/user-role.enum';
import { Manhwa } from '../manhwa/model/manhwa.entity';
import { S3Service } from '../s3/s3.service';
import {
  DashboardChaptersByStatusDto,
  DashboardRecentManhwaDto,
  DashboardResponseDto,
  DashboardStatsDto,
} from './dto/dashboard.dto';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Chapter)
    private readonly chapterRepository: Repository<Chapter>,
    @InjectRepository(Manhwa)
    private readonly manhwaRepository: Repository<Manhwa>,
    private readonly crawlService: CrawlService,
    private readonly s3Service: S3Service,
  ) {}

  async getDashboard(role: UserRole): Promise<DashboardResponseDto> {
    const [totalChapters, translated, pendingReview, chaptersByStatus, recentManhwas] =
      await Promise.all([
        this.chapterRepository.count(),
        this.chapterRepository.count({
          where: { status: ChapterStatus.TRANSLATED },
        }),
        this.chapterRepository.count({
          where: { status: ChapterStatus.IN_REVIEW },
        }),
        this.getChaptersByStatus(),
        this.getRecentManhwas(10),
      ]);

    const stats: DashboardStatsDto = {
      totalChapters,
      translated,
      pendingReview,
    };

    if (role === UserRole.ADMIN) {
      const queueStatus = await this.crawlService.getQueueStatus();
      stats.crawlJobs = queueStatus.waiting + queueStatus.active;
    }

    return {
      stats,
      chaptersByStatus,
      recentManhwas,
    };
  }

  private async getChaptersByStatus(): Promise<DashboardChaptersByStatusDto> {
    const [raw, cleaning, inProgress, inReview, translated] = await Promise.all([
      this.chapterRepository.count({ where: { status: ChapterStatus.RAW } }),
      this.chapterRepository.count({
        where: { status: ChapterStatus.CLEANING },
      }),
      this.chapterRepository.count({
        where: { status: ChapterStatus.IN_PROGRESS },
      }),
      this.chapterRepository.count({
        where: { status: ChapterStatus.IN_REVIEW },
      }),
      this.chapterRepository.count({
        where: { status: ChapterStatus.TRANSLATED },
      }),
    ]);
    return {
      raw,
      cleaning,
      inProgress,
      inReview,
      translated,
    };
  }

  private async getRecentManhwas(
    limit: number,
  ): Promise<DashboardRecentManhwaDto[]> {
    const manhwas = await this.manhwaRepository.find({
      where: { isActive: true },
      order: { updatedAt: 'DESC' },
      take: limit,
      select: [
        'id',
        'title',
        'slugUrl',
        'coverImageUrl',
        'totalChapters',
        'status',
        'updatedAt',
      ],
    });
    return manhwas.map((m) => ({
      id: m.id,
      title: m.title,
      slugUrl: m.slugUrl,
      coverImageUrl: this.s3Service.getFullUrl(m.coverImageUrl),
      totalChapters: m.totalChapters,
      status: m.status,
      updatedAt: m.updatedAt,
    }));
  }
}
