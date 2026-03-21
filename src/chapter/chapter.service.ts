import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  ChapterCrawlerService,
  CrawlResponse,
} from '../chapter-crawler/chapter-crawler.service';
import { UserRole } from '../common/enums/user-role.enum';
import {
  createPaginatedResponse,
  PaginatedResponse,
} from '../common/interfaces/pagination.interface';
import { Manhwa } from '../manhwa/model/manhwa.entity';
import { S3Service } from '../s3/s3.service';
import { UsersService } from '../users/users.service';
import {
  CreateChapterCrawlDto,
  SaveTranslationDto,
  SubmitTranslationDto,
} from './model/chapter.dto';
import { Chapter } from './model/chapter.entity';
import { ChapterStatus } from './model/chapter.enum';

export interface ChapterDetailResponse extends Chapter {
  enJson: unknown;
  mmJson: unknown;
  imagePaths: string[];
}

@Injectable()
export class ChapterService {
  constructor(
    @InjectRepository(Chapter)
    private readonly chapterRepository: Repository<Chapter>,
    @InjectRepository(Manhwa)
    private readonly manhwaRepository: Repository<Manhwa>,
    private readonly dataSource: DataSource,
    private readonly chapterCrawlerService: ChapterCrawlerService,
    private readonly s3Service: S3Service,
    private readonly usersService: UsersService,
  ) {}

  async createChapter(createDto: CreateChapterCrawlDto): Promise<Chapter> {
    // Check if chapter already exists
    const existingChapter = await this.chapterRepository.findOne({
      where: {
        manhwaId: createDto.manhwaId,
        chapterNo: createDto.chapterNo,
      },
    });

    if (existingChapter) {
      throw new BadRequestException(
        `Chapter ${createDto.chapterNo} already exists for this manhwa`,
      );
    }

    // Trigger crawler first - don't create chapter record if crawl fails
    let crawlResponse: CrawlResponse;
    try {
      crawlResponse = await this.chapterCrawlerService.crawlChapter({
        manhwaId: createDto.manhwaId,
        chapterId: `${createDto.chapterNo}`,
        url: createDto.sourceUrl,
      });
    } catch (error) {
      // If crawling fails, break and don't create chapter record
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new HttpException(
        `Failed to crawl chapter: ${errorMessage}. Chapter record not created.`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const chapter = this.chapterRepository.create({
      manhwaId: createDto.manhwaId,
      chapterNo: createDto.chapterNo,
      sourceUrl: createDto.sourceUrl,
      status: ChapterStatus.RAW,
      s3BasePath: crawlResponse.s3BasePath || '',
      enJsonPath: crawlResponse.s3EnJsonPath || '',
      mmJsonPath: crawlResponse.s3MmJsonPath || '',
    });

    const savedChapter = await this.chapterRepository.save(chapter);

    // Update manhwa total chapters count
    await this.manhwaRepository.increment(
      { id: createDto.manhwaId },
      'totalChapters',
      1,
    );

    return savedChapter;
  }

  // Start cleaning (inpainting) - sets status to CLEANING. Only from RAW.
  async startCleaning(chapterId: string): Promise<Chapter> {
    const chapter = await this.chapterRepository.findOne({
      where: { id: chapterId },
      relations: ['assignedContributor', 'manhwa'],
    });

    if (!chapter) {
      throw new NotFoundException(`Chapter with ID ${chapterId} not found`);
    }

    if (chapter.status !== ChapterStatus.RAW) {
      throw new BadRequestException(
        `Chapter must be in RAW status to start cleaning. Current status: ${chapter.status}`,
      );
    }

    chapter.status = ChapterStatus.CLEANING;
    return await this.chapterRepository.save(chapter);
  }

  /**
   * Save cleaning result: update en.json and/or replace chapter images.
   * Chapter must be in CLEANING status. At least one of enJson or images must be provided.
   */
  async saveCleaning(
    chapterId: string,
    enJson?: object,
    imageFiles?: Express.Multer.File[],
  ): Promise<Chapter> {
    const chapter = await this.chapterRepository.findOne({
      where: { id: chapterId },
      relations: ['assignedContributor', 'manhwa'],
    });

    if (!chapter) {
      throw new NotFoundException(`Chapter with ID ${chapterId} not found`);
    }

    if (chapter.status !== ChapterStatus.CLEANING) {
      throw new BadRequestException(
        `Chapter must be in CLEANING status to save cleaning. Current status: ${chapter.status}`,
      );
    }

    if (!enJson && (!imageFiles || imageFiles.length === 0)) {
      throw new BadRequestException(
        'Provide at least one of enJson (body) or images (files) to save.',
      );
    }

    if (enJson && chapter.enJsonPath) {
      await this.s3Service.uploadJson(chapter.enJsonPath, enJson);
    }

    if (imageFiles && imageFiles.length > 0 && chapter.s3BasePath) {
      const imagesPath = `${chapter.s3BasePath}/images`;
      const noCache = 'no-cache, max-age=0, must-revalidate';
      for (const file of imageFiles) {
        const raw =
          file.originalname?.trim() ||
          `image_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
        const basename = raw.includes('/')
          ? raw.split('/').pop()
          : raw.includes('\\')
            ? raw.split('\\').pop()
            : raw;
        const name =
          (basename || raw)
            .split('?')[0]
            .split('#')[0]
            .replace(/[^a-zA-Z0-9_.-]/g, '_')
            .replace(/^_+|_+$/g, '') || `image_${Date.now()}.jpg`;
        const key = `${imagesPath}/${name}`;
        await this.s3Service.uploadFile(
          key,
          file.buffer,
          file.mimetype || 'image/jpeg',
          noCache,
        );
      }
    }

    return this.chapterRepository.save(chapter);
  }

  // Start translation - auto-assigns user and sets status to IN_PROGRESS
  async startTranslation(chapterId: string, userId: string): Promise<Chapter> {
    const chapter = await this.chapterRepository.findOne({
      where: { id: chapterId },
      relations: ['assignedContributor', 'manhwa'],
    });

    if (!chapter) {
      throw new NotFoundException(`Chapter with ID ${chapterId} not found`);
    }

    if (
      chapter.status !== ChapterStatus.RAW &&
      chapter.status !== ChapterStatus.CLEANING
    ) {
      throw new BadRequestException(
        `Chapter must be in RAW or CLEANING status to start translation. Current status: ${chapter.status}`,
      );
    }

    // Auto-assign the user who starts the translation
    chapter.assignedContributorId = userId;
    chapter.status = ChapterStatus.IN_PROGRESS;
    return await this.chapterRepository.save(chapter);
  }

  // Save translation data to S3 (draft save, no status change)
  async saveTranslation(
    chapterId: string,
    userId: string,
    saveDto: SaveTranslationDto,
  ): Promise<Chapter> {
    const chapter = await this.chapterRepository.findOne({
      where: { id: chapterId },
      relations: ['assignedContributor', 'manhwa'],
    });

    if (!chapter) {
      throw new NotFoundException(`Chapter with ID ${chapterId} not found`);
    }

    if (chapter.assignedContributorId !== userId) {
      throw new BadRequestException('You are not assigned to this chapter');
    }

    if (chapter.status !== ChapterStatus.IN_PROGRESS) {
      throw new BadRequestException(
        `Chapter must be in IN_PROGRESS status to save. Current status: ${chapter.status}`,
      );
    }

    // Upload translation data to S3 (replaces existing file)
    const s3Path = this.s3Service.getS3Path(
      chapter.manhwaId,
      chapter.chapterNo,
    );
    const mmJsonKey = `${s3Path}/mm.json`;
    await this.s3Service.uploadJson(mmJsonKey, saveDto.data as object);

    // Update mmJsonPath and save chapter
    chapter.mmJsonPath = mmJsonKey;
    return await this.chapterRepository.save(chapter);
  }

  // Submit translation with data - uploads to S3 and sets status to IN_REVIEW
  async submitTranslation(
    chapterId: string,
    userId: string,
    submitDto: SubmitTranslationDto,
  ): Promise<Chapter> {
    const chapter = await this.chapterRepository.findOne({
      where: { id: chapterId },
      relations: ['assignedContributor', 'manhwa'],
    });

    if (!chapter) {
      throw new NotFoundException(`Chapter with ID ${chapterId} not found`);
    }

    if (chapter.assignedContributorId !== userId) {
      throw new BadRequestException('You are not assigned to this chapter');
    }

    if (chapter.status !== ChapterStatus.IN_PROGRESS) {
      throw new BadRequestException(
        `Chapter must be in IN_PROGRESS status to submit. Current status: ${chapter.status}`,
      );
    }

    // Upload translation data to S3
    const s3Path = this.s3Service.getS3Path(
      chapter.manhwaId,
      chapter.chapterNo,
    );
    const mmJsonKey = `${s3Path}/mm.json`;
    await this.s3Service.uploadJson(mmJsonKey, submitDto.data as object);

    // Update chapter with mmJsonPath and change status
    chapter.mmJsonPath = mmJsonKey;
    chapter.status = ChapterStatus.IN_REVIEW;
    await this.chapterRepository.save(chapter);
    // Restore one translation slot for the contributor (submit frees a slot)
    await this.usersService.incrementAvailableTranslateSlot(userId);
    return chapter;
  }

  // Admin approves a chapter in review
  async approveChapter(
    chapterId: string,
    isQualityApproval: boolean = false,
  ): Promise<Chapter> {
    const chapter = await this.chapterRepository.findOne({
      where: { id: chapterId },
      relations: ['assignedContributor', 'manhwa'],
    });

    if (!chapter) {
      throw new NotFoundException(`Chapter with ID ${chapterId} not found`);
    }

    if (chapter.status !== ChapterStatus.IN_REVIEW) {
      throw new BadRequestException(
        `Chapter must be in IN_REVIEW status to approve. Current status: ${chapter.status}`,
      );
    }

    chapter.status = ChapterStatus.TRANSLATED;
    chapter.publishedAt = new Date();

    const savedChapter = await this.chapterRepository.save(chapter);

    // Update contributor stats
    if (chapter.assignedContributorId) {
      // Update stats (increments chapters, updates streaks, etc.)
      await this.usersService.incrementTranslationStats(
        chapter.assignedContributorId,
      );
    }

    void isQualityApproval;

    return savedChapter;
  }

  // Admin rejects a chapter in review
  async rejectChapter(chapterId: string): Promise<Chapter> {
    const chapter = await this.chapterRepository.findOne({
      where: { id: chapterId },
      relations: ['assignedContributor', 'manhwa'],
    });

    if (!chapter) {
      throw new NotFoundException(`Chapter with ID ${chapterId} not found`);
    }

    if (chapter.status !== ChapterStatus.IN_REVIEW) {
      throw new BadRequestException(
        `Chapter must be in IN_REVIEW status to reject. Current status: ${chapter.status}`,
      );
    }

    // Revert to RAW status - contributor needs to redo the translation
    chapter.status = ChapterStatus.RAW;
    chapter.mmJsonPath = ''; // Clear the mmJsonPath

    const savedChapter = await this.chapterRepository.save(chapter);

    return savedChapter;
  }

  async updateChapterStatus(
    chapterId: string,
    newStatus: ChapterStatus,
  ): Promise<Chapter> {
    const chapter = await this.chapterRepository.findOne({
      where: { id: chapterId },
      relations: ['assignedContributor', 'manhwa'],
    });

    if (!chapter) {
      throw new NotFoundException(`Chapter with ID ${chapterId} not found`);
    }

    // Validate status transitions
    const validTransitions: Record<ChapterStatus, ChapterStatus[]> = {
      [ChapterStatus.RAW]: [ChapterStatus.IN_PROGRESS, ChapterStatus.CLEANING],
      [ChapterStatus.CLEANING]: [ChapterStatus.RAW, ChapterStatus.IN_PROGRESS],
      [ChapterStatus.IN_PROGRESS]: [ChapterStatus.RAW, ChapterStatus.IN_REVIEW],
      [ChapterStatus.IN_REVIEW]: [ChapterStatus.RAW, ChapterStatus.TRANSLATED],
      [ChapterStatus.TRANSLATED]: [ChapterStatus.RAW, ChapterStatus.PUBLISHED],
      [ChapterStatus.PUBLISHED]: [ChapterStatus.RAW],
    };

    const allowedStatuses = validTransitions[chapter.status] || [];
    if (!allowedStatuses.includes(newStatus)) {
      throw new BadRequestException(
        `Cannot change status from ${chapter.status} to ${newStatus}. Valid transitions: ${allowedStatuses.join(', ')}`,
      );
    }

    const previousStatus = chapter.status;
    chapter.status = newStatus;

    // Set publishedAt when chapter goes live
    if (newStatus === ChapterStatus.PUBLISHED && !chapter.publishedAt) {
      chapter.publishedAt = new Date();
    }

    const savedChapter = await this.chapterRepository.save(chapter);

    // Update contributor stats when newly translated
    if (
      newStatus === ChapterStatus.TRANSLATED &&
      previousStatus !== ChapterStatus.TRANSLATED &&
      chapter.assignedContributorId
    ) {
      await this.usersService.incrementTranslationStats(
        chapter.assignedContributorId,
      );
    }

    return savedChapter;
  }

  // Revert chapter to RAW status (admin only)
  async revertToRaw(chapterId: string): Promise<Chapter> {
    const chapter = await this.chapterRepository.findOne({
      where: { id: chapterId },
      relations: ['assignedContributor', 'manhwa'],
    });

    if (!chapter) {
      throw new NotFoundException(`Chapter with ID ${chapterId} not found`);
    }

    chapter.status = ChapterStatus.RAW;
    chapter.assignedContributorId = null;

    return await this.chapterRepository.save(chapter);
  }

  // Publish a translated chapter (admin/editor only)
  async publishChapter(chapterId: string): Promise<Chapter> {
    const chapter = await this.chapterRepository.findOne({
      where: { id: chapterId },
      relations: ['assignedContributor', 'manhwa'],
    });

    if (!chapter) {
      throw new NotFoundException(`Chapter with ID ${chapterId} not found`);
    }

    if (chapter.status !== ChapterStatus.TRANSLATED) {
      throw new BadRequestException(
        `Chapter must be in TRANSLATED status to publish. Current status: ${chapter.status}`,
      );
    }

    chapter.status = ChapterStatus.PUBLISHED;
    if (!chapter.publishedAt) {
      chapter.publishedAt = new Date();
    }

    return this.chapterRepository.save(chapter);
  }

  async getChapterById(chapterId: string): Promise<ChapterDetailResponse> {
    const chapter = await this.chapterRepository.findOne({
      where: { id: chapterId },
      relations: ['assignedContributor', 'manhwa'],
    });

    if (!chapter) {
      throw new NotFoundException(`Chapter with ID ${chapterId} not found`);
    }

    // Fetch en.json content from S3
    let enJson: unknown = null;
    if (chapter.enJsonPath) {
      try {
        enJson = await this.s3Service.getJsonFile(chapter.enJsonPath);
      } catch (error) {
        // Log error but don't fail the request
        console.error(`Failed to fetch en.json: ${error}`);
      }
    }

    // Fetch mm.json content from S3 if exists
    let mmJson: unknown = null;
    if (chapter.mmJsonPath) {
      try {
        mmJson = await this.s3Service.getJsonFile(chapter.mmJsonPath);
      } catch (error) {
        // Log error but don't fail the request
        console.error(`Failed to fetch mm.json: ${error}`);
      }
    }

    // Fetch image paths from S3
    let imagePaths: string[] = [];
    if (chapter.s3BasePath) {
      try {
        imagePaths = await this.s3Service.listImages(chapter.s3BasePath);
      } catch (error) {
        // Log error but don't fail the request
        console.error(`Failed to list images: ${error}`);
      }
    }

    return {
      ...chapter,
      enJson,
      mmJson,
      imagePaths,
    };
  }

  async listChapters(
    userId: string,
    userRole: UserRole,
    filters: {
      page: number;
      limit: number;
      status?: ChapterStatus;
      manhwaId?: string;
      startDate?: string;
      endDate?: string;
    },
  ): Promise<PaginatedResponse<Chapter>> {
    const page = +filters.page;
    const limit = +filters.limit;
    const skip = (page - 1) * limit;

    // Build query builder
    const queryBuilder = this.chapterRepository
      .createQueryBuilder('chapter')
      .leftJoinAndSelect('chapter.assignedContributor', 'assignedContributor')
      .leftJoinAndSelect('chapter.manhwa', 'manhwa');

    // Role-based filtering: CONTRIBUTOR can only see their assigned chapters
    // if (userRole === UserRole.CONTRIBUTOR) {
    //   queryBuilder.where('chapter.assignedContributorId = :userId', {
    //     userId,
    //   });
    // }

    // Apply filters
    if (filters.status) {
      queryBuilder.andWhere('chapter.status = :status', {
        status: filters.status,
      });
    }

    if (filters.manhwaId) {
      queryBuilder.andWhere('chapter.manhwaId = :manhwaId', {
        manhwaId: filters.manhwaId,
      });
    }

    if (filters.startDate) {
      queryBuilder.andWhere('chapter.createdAt >= :startDate', {
        startDate: new Date(filters.startDate),
      });
    }

    if (filters.endDate) {
      queryBuilder.andWhere('chapter.createdAt <= :endDate', {
        endDate: new Date(filters.endDate),
      });
    }

    // Order by chapter number descending
    queryBuilder.orderBy('chapter.chapterNo', 'ASC');

    // Get total count before pagination
    const total = await queryBuilder.getCount();

    // Apply pagination
    queryBuilder.skip(skip).take(limit);

    // Execute query
    const data = await queryBuilder.getMany();

    return createPaginatedResponse(data, total, page, limit);
  }

  // Increment view count and update related stats
  async incrementViewCount(chapterId: string): Promise<void> {
    const chapter = await this.chapterRepository.findOne({
      where: { id: chapterId },
    });

    if (!chapter) return;

    // Increment chapter view count
    await this.chapterRepository.increment({ id: chapterId }, 'viewCount', 1);

    // Update manhwa total views
    await this.manhwaRepository.increment(
      { id: chapter.manhwaId },
      'totalViews',
      1,
    );

    // Update contributor's total views
    if (chapter.assignedContributorId) {
      await this.usersService.incrementContributorViews(
        chapter.assignedContributorId,
        1,
      );
    }
  }

  // Like a chapter
  async likeChapter(chapterId: string): Promise<void> {
    await this.chapterRepository.increment({ id: chapterId }, 'likeCount', 1);
  }

  // Unlike a chapter
  async unlikeChapter(chapterId: string): Promise<void> {
    const chapter = await this.chapterRepository.findOne({
      where: { id: chapterId },
    });
    if (chapter && chapter.likeCount > 0) {
      await this.chapterRepository.decrement({ id: chapterId }, 'likeCount', 1);
    }
  }
}
