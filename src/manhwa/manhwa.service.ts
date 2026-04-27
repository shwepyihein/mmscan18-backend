import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Chapter } from '../chapter/model/chapter.entity';
import { S3Service } from '../s3/s3.service';
import { ManhwaStatus } from './model/manhwa-status.enum';
import { CreateManhwaDto, UpdateManhwaDto } from './model/manhwa.dto';
import { Manhwa } from './model/manhwa.entity';

export interface PaginatedManhwaResponse {
  data: Manhwa[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

@Injectable()
export class ManhwaService {
  constructor(
    @InjectRepository(Manhwa)
    private readonly manhwaRepository: Repository<Manhwa>,
    @InjectRepository(Chapter)
    private readonly chapterRepository: Repository<Chapter>,
    private readonly s3Service: S3Service,
  ) {}

  async create(
    createManhwaDto: CreateManhwaDto,
    coverImage?: Express.Multer.File,
  ): Promise<Manhwa> {
    const baseSlug =
      createManhwaDto.slugUrl?.trim() || this.slugify(createManhwaDto.title);
    const slugUrl = await this.ensureUniqueSlug(baseSlug);
    const manhwa = this.manhwaRepository.create({
      title: createManhwaDto.title,
      slugUrl,
      titleMm: createManhwaDto.titleMm ?? null,
      descriptionMm: createManhwaDto.descriptionMm ?? null,
      alternativeTitles: createManhwaDto.alternativeTitles || null,
      description: createManhwaDto.description || null,
      coverImageUrl: null,
      author: createManhwaDto.author || null,
      artist: createManhwaDto.artist || null,
      genres: createManhwaDto.genres || null,
      releaseYear: createManhwaDto.releaseYear || null,
      originalLanguage: createManhwaDto.originalLanguage || null,
      sourceUrl: createManhwaDto.sourceUrl || null,
      sourceUrlPattern: createManhwaDto.sourceUrlPattern || null,
      promptPath: createManhwaDto.promptPath || null,
      crawlEnabled: true,
      lastCrawledChapter: 0,
      isActive: true,
      status: createManhwaDto.status || ManhwaStatus.ONGOING,
    });

    const saved = await this.manhwaRepository.save(manhwa);

    // Upload cover image to S3 if provided - now we have the manhwa ID
    if (coverImage) {
      const { key } = await this.s3Service.uploadManhwaCover(
        saved.id,
        saved.slugUrl ?? this.slugify(createManhwaDto.title),
        coverImage.buffer,
        coverImage.mimetype,
      );
      saved.coverImageUrl = key;
      await this.manhwaRepository.save(saved);
    }

    return this.transformManhwaUrls(saved);
  }

  async findById(id: string): Promise<Manhwa> {
    const manhwa = await this.manhwaRepository.findOne({ where: { id } });
    if (!manhwa) {
      throw new NotFoundException(`Manhwa with ID ${id} not found`);
    }
    return this.transformManhwaUrls(manhwa);
  }

  // Internal method to get raw manhwa without URL transformation
  async findByIdRaw(id: string): Promise<Manhwa> {
    const manhwa = await this.manhwaRepository.findOne({ where: { id } });
    if (!manhwa) {
      throw new NotFoundException(`Manhwa with ID ${id} not found`);
    }
    return manhwa;
  }

  async findAll(
    page: number = 1,
    limit: number = 20,
  ): Promise<PaginatedManhwaResponse> {
    const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
    const safeLimit =
      Number.isFinite(limit) && limit > 0
        ? Math.min(Math.floor(limit), 100)
        : 20;

    const [manhwas, total] = await this.manhwaRepository.findAndCount({
      where: { isActive: true },
      order: { createdAt: 'DESC' },
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
    });

    return {
      data: manhwas.map((m) => this.transformManhwaUrls(m)),
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit),
    };
  }

  async update(
    id: string,
    updateManhwaDto: UpdateManhwaDto,
    coverImage?: Express.Multer.File,
  ): Promise<Manhwa> {
    // Use raw to avoid transforming URLs before saving
    const manhwa = await this.findByIdRaw(id);

    // Upload new cover image if provided - store only path
    if (coverImage) {
      const { key } = await this.s3Service.uploadManhwaCover(
        manhwa.id,
        this.slugify(manhwa.title),
        coverImage.buffer,
        coverImage.mimetype,
      );
      manhwa.coverImageUrl = key;
    }

    if (updateManhwaDto.title !== undefined) {
      manhwa.title = updateManhwaDto.title;
      if (updateManhwaDto.slugUrl === undefined) {
        manhwa.slugUrl = await this.ensureUniqueSlug(
          this.slugify(updateManhwaDto.title),
          manhwa.id,
        );
      }
    }
    if (updateManhwaDto.slugUrl !== undefined) {
      manhwa.slugUrl = await this.ensureUniqueSlug(
        updateManhwaDto.slugUrl.trim(),
        manhwa.id,
      );
    }
    if (updateManhwaDto.titleMm !== undefined) {
      manhwa.titleMm = updateManhwaDto.titleMm || null;
    }
    if (updateManhwaDto.descriptionMm !== undefined) {
      manhwa.descriptionMm = updateManhwaDto.descriptionMm || null;
    }
    if (updateManhwaDto.alternativeTitles !== undefined) {
      manhwa.alternativeTitles = updateManhwaDto.alternativeTitles;
    }
    if (updateManhwaDto.description !== undefined) {
      manhwa.description = updateManhwaDto.description;
    }
    if (updateManhwaDto.author !== undefined) {
      manhwa.author = updateManhwaDto.author;
    }
    if (updateManhwaDto.artist !== undefined) {
      manhwa.artist = updateManhwaDto.artist;
    }
    if (updateManhwaDto.genres !== undefined) {
      manhwa.genres = updateManhwaDto.genres;
    }
    if (updateManhwaDto.releaseYear !== undefined) {
      manhwa.releaseYear = updateManhwaDto.releaseYear;
    }
    if (updateManhwaDto.originalLanguage !== undefined) {
      manhwa.originalLanguage = updateManhwaDto.originalLanguage;
    }
    if (updateManhwaDto.isActive !== undefined) {
      manhwa.isActive = updateManhwaDto.isActive;
    }
    if (updateManhwaDto.status !== undefined) {
      manhwa.status = updateManhwaDto.status;
    }
    // Crawl settings
    if (updateManhwaDto.sourceUrl !== undefined) {
      manhwa.sourceUrl = updateManhwaDto.sourceUrl;
    }
    if (updateManhwaDto.sourceUrlPattern !== undefined) {
      manhwa.sourceUrlPattern = updateManhwaDto.sourceUrlPattern;
    }
    if (updateManhwaDto.promptPath !== undefined) {
      manhwa.promptPath = updateManhwaDto.promptPath || null;
    }
    if (updateManhwaDto.crawlEnabled !== undefined) {
      manhwa.crawlEnabled = updateManhwaDto.crawlEnabled;
    }

    const saved = await this.manhwaRepository.save(manhwa);
    return this.transformManhwaUrls(saved);
  }

  async delete(id: string): Promise<void> {
    const manhwa = await this.findById(id);
    manhwa.isActive = false;
    await this.manhwaRepository.save(manhwa);
  }

  async findByGenre(genre: string): Promise<Manhwa[]> {
    const manhwas = await this.manhwaRepository
      .createQueryBuilder('manhwa')
      .where('manhwa.isActive = :isActive', { isActive: true })
      .andWhere('manhwa.genres LIKE :genre', { genre: `%${genre}%` })
      .orderBy('manhwa.totalViews', 'DESC')
      .getMany();
    return manhwas.map((m) => this.transformManhwaUrls(m));
  }

  async getAllGenres(): Promise<string[]> {
    const manhwas = await this.manhwaRepository.find({
      where: { isActive: true },
      select: ['genres'],
    });

    const genresSet = new Set<string>();
    for (const manhwa of manhwas) {
      if (manhwa.genres) {
        manhwa.genres.forEach((genre) => genresSet.add(genre));
      }
    }

    return Array.from(genresSet).sort();
  }

  async setAllChaptersLock(
    manhwaId: string,
    isLocked: boolean,
  ): Promise<{ manhwaId: string; isLocked: boolean; updatedCount: number }> {
    await this.findByIdRaw(manhwaId);

    const result = await this.chapterRepository.update(
      { manhwaId },
      { isLocked },
    );
    return {
      manhwaId,
      isLocked,
      updatedCount: result.affected ?? 0,
    };
  }

  async setSingleChapterLock(
    manhwaId: string,
    chapterId: string,
    isLocked: boolean,
  ): Promise<{ manhwaId: string; chapterId: string; isLocked: boolean }> {
    await this.findByIdRaw(manhwaId);

    const chapter = await this.chapterRepository.findOne({
      where: { id: chapterId, manhwaId },
      select: ['id'],
    });
    if (!chapter) {
      throw new NotFoundException('Chapter not found for this manhwa');
    }

    await this.chapterRepository.update(
      { id: chapterId, manhwaId },
      { isLocked },
    );
    return { manhwaId, chapterId, isLocked };
  }

  // Transform S3 paths to full URLs for response
  private transformManhwaUrls(manhwa: Manhwa): Manhwa {
    return {
      ...manhwa,
      coverImageUrl: this.s3Service.getFullUrl(manhwa.coverImageUrl),
      promptPath: this.s3Service.getFullUrl(manhwa.promptPath) || '',
    };
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  private async ensureUniqueSlug(
    baseSlug: string,
    excludeManhwaId?: string,
  ): Promise<string> {
    if (!baseSlug) return `manhwa-${Date.now()}`;
    let slug = baseSlug;
    let n = 1;
    for (;;) {
      const existing = await this.manhwaRepository.findOne({
        where: { slugUrl: slug },
      });
      if (!existing || existing.id === excludeManhwaId) return slug;
      slug = `${baseSlug}-${++n}`;
    }
  }
}
