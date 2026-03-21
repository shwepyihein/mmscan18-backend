import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Chapter } from '../chapter/model/chapter.entity';
import { ChapterStatus } from '../chapter/model/chapter.enum';
import {
  createPaginatedResponse,
  PaginatedResponse,
} from '../common/interfaces/pagination.interface';
import { Manhwa } from '../manhwa/model/manhwa.entity';
import { S3Service } from '../s3/s3.service';
import { User } from '../users/model/user.entity';

/** Manhwa + last two PUBLISHED chapters (for cards / `getLastTwoChapters` on the client). */
export type PublicManhwaWithChapters = Manhwa & {
  chapters: Pick<
    Chapter,
    'id' | 'chapterNo' | 'title' | 'manhwaId' | 'status'
  >[];
};

@Injectable()
export class PublicService {
  constructor(
    @InjectRepository(Manhwa)
    private readonly manhwaRepository: Repository<Manhwa>,
    @InjectRepository(Chapter)
    private readonly chapterRepository: Repository<Chapter>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly s3Service: S3Service,
  ) {}

  // === MANHWA ===

  async listManhwa(
    page: number,
    limit: number,
    genre?: string,
    sortBy: 'latest' | 'popular' | 'rating' = 'latest',
  ): Promise<PaginatedResponse<PublicManhwaWithChapters>> {
    const skip = (page - 1) * limit;

    const queryBuilder = this.manhwaRepository
      .createQueryBuilder('manhwa')
      .where('manhwa.isActive = :isActive', { isActive: true })
      // Only list manhwa that have at least one published chapter (public catalog)
      .andWhere(
        `EXISTS (
          SELECT 1 FROM chapters c
          WHERE c."manhwaId" = manhwa.id AND c.status = :publishedStatus
        )`,
        { publishedStatus: ChapterStatus.PUBLISHED },
      );

    // Filter by genre if provided
    if (genre) {
      queryBuilder.andWhere('manhwa.genres LIKE :genre', {
        genre: `%${genre}%`,
      });
    }

    // Sort order
    switch (sortBy) {
      case 'popular':
        queryBuilder.orderBy('manhwa.totalViews', 'DESC');
        break;
      case 'rating':
        queryBuilder.orderBy('manhwa.rating', 'DESC');
        break;
      case 'latest':
      default:
        // Newest first by latest PUBLISHED chapter time (not manhwa row update time)
        queryBuilder.orderBy(
          `(SELECT MAX(c2."publishedAt") FROM chapters c2 WHERE c2."manhwaId" = manhwa.id AND c2.status = :publishedStatus)`,
          'DESC',
          'NULLS LAST',
        );
        break;
    }

    const [data, total] = await queryBuilder
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    // Transform S3 paths to full URLs
    const transformedData = data.map((m) => this.transformManhwaUrls(m));

    const withChapters =
      await this.attachLastTwoPublishedChapters(transformedData);

    return createPaginatedResponse(withChapters, total, page, limit);
  }

  async getManhwaById(manhwaId: string): Promise<PublicManhwaWithChapters> {
    const manhwa = await this.manhwaRepository.findOne({
      where: { id: manhwaId, isActive: true },
    });

    if (!manhwa) {
      throw new NotFoundException(`Manhwa with ID ${manhwaId} not found`);
    }

    const transformed = this.transformManhwaUrls(manhwa);
    const [withChapters] = await this.attachLastTwoPublishedChapters([
      transformed,
    ]);
    return withChapters;
  }

  async getChaptersByManhwaId(manhwaId: string): Promise<Chapter[]> {
    return this.chapterRepository.find({
      where: {
        manhwaId,
        status: ChapterStatus.PUBLISHED,
      },
      order: { chapterNo: 'ASC' },
    });
  }

  // === CHAPTERS ===

  async getChapterRange(manhwaId: string): Promise<{
    startChapterNo: number;
    endChapterNo: number;
  }> {
    const result = await this.chapterRepository
      .createQueryBuilder('chapter')
      .select('MIN(chapter.chapterNo)', 'minNo')
      .addSelect('MAX(chapter.chapterNo)', 'maxNo')
      .where('chapter.manhwaId = :manhwaId', { manhwaId })
      .andWhere('chapter.status = :status', { status: ChapterStatus.PUBLISHED })
      .getRawOne<{ minNo: string; maxNo: string }>();

    if (!result?.minNo || result.minNo == null) {
      return { startChapterNo: 0, endChapterNo: 0 };
    }

    const startChapterNo = parseInt(result.minNo, 10);
    const endChapterNo = parseInt(result.maxNo, 10);
    return { startChapterNo, endChapterNo };
  }

  async getChapterForReadingByNumber(
    manhwaId: string,
    chapterNo: number,
  ): Promise<{
    chapter: Chapter;
    images: string[];
    mmJson: unknown;
    enJson: unknown;
    contributor: {
      id: string;
      username: string | null;
      name: string | null;
      avatarUrl: string | null;
      level: string;
    } | null;
    prevChapterId: string | null;
    nextChapterId: string | null;
    prevChapterNo: number | null;
    nextChapterNo: number | null;
  }> {
    const chapter = await this.chapterRepository.findOne({
      where: { manhwaId, chapterNo, status: ChapterStatus.PUBLISHED },
      relations: ['assignedContributor', 'manhwa'],
    });

    if (!chapter) {
      throw new NotFoundException(
        `Chapter ${chapterNo} for manhwa ${manhwaId} not found`,
      );
    }

    return this.buildChapterReadingResponse(chapter);
  }

  private async buildChapterReadingResponse(chapter: Chapter): Promise<{
    chapter: Chapter;
    images: string[];
    mmJson: unknown;
    enJson: unknown;
    contributor: {
      id: string;
      username: string | null;
      name: string | null;
      avatarUrl: string | null;
      level: string;
    } | null;
    prevChapterId: string | null;
    nextChapterId: string | null;
    prevChapterNo: number | null;
    nextChapterNo: number | null;
  }> {
    // Increment view count
    await this.chapterRepository.increment({ id: chapter.id }, 'viewCount', 1);
    await this.manhwaRepository.increment(
      { id: chapter.manhwaId },
      'totalViews',
      1,
    );

    if (chapter.assignedContributorId) {
      await this.userRepository.increment(
        { id: chapter.assignedContributorId },
        'totalViews',
        1,
      );
    }

    let images: string[] = [];
    if (chapter.s3BasePath) {
      try {
        images = await this.s3Service.listImages(chapter.s3BasePath);
      } catch (error) {
        console.error(`Failed to list images: ${error}`);
      }
    }

    let mmJson: unknown = null;
    if (chapter.mmJsonPath) {
      try {
        mmJson = await this.s3Service.getJsonFile(chapter.mmJsonPath);
      } catch (error) {
        console.error(`Failed to get mm.json: ${error}`);
      }
    }

    let enJson: unknown = null;
    if (chapter.enJsonPath) {
      try {
        enJson = await this.s3Service.getJsonFile(chapter.enJsonPath);
      } catch (error) {
        console.error(`Failed to get en.json: ${error}`);
      }
    }

    const [prevChapter, nextChapter] = await Promise.all([
      this.chapterRepository.findOne({
        where: {
          manhwaId: chapter.manhwaId,
          chapterNo: chapter.chapterNo - 1,
          status: ChapterStatus.PUBLISHED,
        },
        select: ['id', 'chapterNo'],
      }),
      this.chapterRepository.findOne({
        where: {
          manhwaId: chapter.manhwaId,
          chapterNo: chapter.chapterNo + 1,
          status: ChapterStatus.PUBLISHED,
        },
        select: ['id', 'chapterNo'],
      }),
    ]);

    const contributor = chapter.assignedContributor
      ? {
          id: chapter.assignedContributor.id,
          username: chapter.assignedContributor.username,
          name: chapter.assignedContributor.name,
          avatarUrl: this.s3Service.getFullUrl(
            chapter.assignedContributor.avatarUrl,
          ),
          level: chapter.assignedContributor.level,
        }
      : null;

    if (chapter.manhwa) {
      chapter.manhwa = this.transformManhwaUrls(chapter.manhwa);
    }

    return {
      chapter,
      images,
      mmJson,
      enJson,
      contributor,
      prevChapterId: prevChapter?.id ?? null,
      nextChapterId: nextChapter?.id ?? null,
      prevChapterNo: prevChapter?.chapterNo ?? null,
      nextChapterNo: nextChapter?.chapterNo ?? null,
    };
  }

  // === DISCOVERY ===

  async getLatestChapters(limit: number = 10): Promise<Chapter[]> {
    const subQuery = this.chapterRepository
      .createQueryBuilder('c')
      .select('c.id')
      .distinctOn(['c.manhwaId'])
      .where('c.status = :status', { status: ChapterStatus.PUBLISHED })
      .orderBy('c.manhwaId')
      .addOrderBy('c.updatedAt', 'DESC');

    const chapters = await this.chapterRepository
      .createQueryBuilder('chapter')
      .leftJoinAndSelect('chapter.manhwa', 'manhwa')
      .leftJoinAndSelect('chapter.assignedContributor', 'assignedContributor')
      .where(`chapter.id IN (${subQuery.getQuery()})`)
      .setParameters(subQuery.getParameters())
      .orderBy('chapter.updatedAt', 'DESC')
      .take(limit)
      .getMany();

    return chapters.map((c) => this.transformChapterUrls(c));
  }

  async getPopularChapters(limit: number = 10): Promise<Chapter[]> {
    const chapters = await this.chapterRepository.find({
      where: {
        status: ChapterStatus.PUBLISHED,
      },
      relations: ['manhwa', 'assignedContributor'],
      order: { viewCount: 'DESC' },
      take: limit,
    });
    return chapters.map((c) => this.transformChapterUrls(c));
  }

  async getPopularManhwa(limit: number = 10): Promise<Manhwa[]> {
    const manhwas = await this.manhwaRepository.find({
      where: { isActive: true },
      order: { totalViews: 'DESC' },
      take: limit,
    });
    return manhwas.map((m) => this.transformManhwaUrls(m));
  }

  async searchManhwa(
    query: string,
    page: number,
    limit: number,
  ): Promise<PaginatedResponse<Manhwa>> {
    const skip = (page - 1) * limit;

    const [data, total] = await this.manhwaRepository
      .createQueryBuilder('manhwa')
      .where('manhwa.isActive = :isActive', { isActive: true })
      .andWhere(
        '(manhwa.title ILIKE :query OR manhwa.author ILIKE :query OR manhwa.description ILIKE :query)',
        { query: `%${query}%` },
      )
      .orderBy('manhwa.totalViews', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    const transformedData = data.map((m) => this.transformManhwaUrls(m));

    return createPaginatedResponse(transformedData, total, page, limit);
  }

  // === HELPER METHODS ===

  /**
   * For each manhwa, attach up to 2 latest **PUBLISHED** chapters (by chapterNo),
   * ordered ascending for card UI (e.g. Ch. 9, Ch. 10).
   */
  private async attachLastTwoPublishedChapters(
    manhwas: Manhwa[],
  ): Promise<PublicManhwaWithChapters[]> {
    if (manhwas.length === 0) {
      return [];
    }

    const chapterLists = await Promise.all(
      manhwas.map((m) =>
        this.chapterRepository.find({
          where: { manhwaId: m.id, status: ChapterStatus.PUBLISHED },
          order: { chapterNo: 'DESC' },
          take: 2,
          select: [
            'id',
            'chapterNo',
            'title',
            'manhwaId',
            'status',
            'createdAt',
            'updatedAt',
            'publishedAt',
          ],
        }),
      ),
    );

    return manhwas.map((m, i) => ({
      ...m,
      chapters: chapterLists[i].slice().reverse(),
    }));
  }

  // Transform S3 paths to full URLs for manhwa
  private transformManhwaUrls(manhwa: Manhwa): Manhwa {
    return {
      ...manhwa,
      coverImageUrl: this.s3Service.getFullUrl(manhwa.coverImageUrl),
    };
  }

  // Transform S3 paths to full URLs for chapter with relations
  private transformChapterUrls(chapter: Chapter): Chapter {
    return {
      ...chapter,
      manhwa: chapter.manhwa
        ? this.transformManhwaUrls(chapter.manhwa)
        : undefined,
      assignedContributor: chapter.assignedContributor
        ? {
            ...chapter.assignedContributor,
            avatarUrl: this.s3Service.getFullUrl(
              chapter.assignedContributor.avatarUrl,
            ),
          }
        : undefined,
    } as Chapter;
  }
}
