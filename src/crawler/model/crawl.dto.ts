import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CrawlNextChapterDto {
  @ApiPropertyOptional({
    description: 'Custom source URL (optional, overrides manhwa sourceUrl)',
  })
  @IsString()
  @IsOptional()
  sourceUrl?: string;
}

export class CrawlSpecificChapterDto {
  @ApiPropertyOptional({
    description: 'Custom source URL (optional, overrides default)',
  })
  @IsString()
  @IsOptional()
  sourceUrl?: string;
}

export class CrawlRangeDto {
  @ApiProperty({
    description: 'Start chapter number',
    example: 1,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  fromChapter: number;

  @ApiProperty({
    description: 'End chapter number',
    example: 10,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  toChapter: number;

  @ApiPropertyOptional({
    description: 'Custom source URL pattern (optional)',
  })
  @IsString()
  @IsOptional()
  sourceUrl?: string;
}

export class CrawlAllDto {
  @ApiPropertyOptional({
    description: 'Only crawl manhwas with these IDs (optional)',
  })
  @IsOptional()
  @IsUUID('4', { each: true })
  manhwaIds?: string[];
}

export class CrawlOcrOnlyDto {
  @ApiPropertyOptional({
    description:
      'Custom source URL (optional, uses manhwa sourceUrl config if not provided)',
    example: 'https://manhuarmtl.com/manga/some-title/chapter-1',
  })
  @IsString()
  @IsOptional()
  sourceUrl?: string;
}

export class CrawlOcrOnlyResponse {
  @ApiProperty()
  chapterId: string;

  @ApiProperty()
  manhwaId: string;

  @ApiPropertyOptional()
  manhwaTitle?: string;

  @ApiProperty()
  chapterNo: number;

  @ApiProperty()
  s3BasePath: string;

  @ApiPropertyOptional()
  s3EnJsonPath: string | null;

  @ApiPropertyOptional()
  s3MmJsonPath: string | null;

  @ApiProperty()
  totalImages: number;

  @ApiProperty()
  totalTextBoxes: number;

  @ApiProperty()
  success: boolean;

  @ApiProperty()
  message: string;
}

export class CrawlTaskResponse {
  @ApiProperty()
  taskId: string;

  @ApiProperty()
  manhwaId: string;

  @ApiPropertyOptional()
  manhwaTitle?: string;

  @ApiProperty()
  chapterNo: number;

  @ApiProperty()
  status: string;

  @ApiProperty()
  sourceUrl: string;

  @ApiProperty()
  progressPercent: number;

  @ApiProperty()
  retryCount: number;

  @ApiPropertyOptional()
  errorMessage?: string | null;

  @ApiPropertyOptional()
  startedAt?: Date | null;

  @ApiPropertyOptional()
  completedAt?: Date | null;
}

export class CrawlBatchResponse {
  @ApiProperty()
  batchId: string;

  @ApiProperty()
  type: string;

  @ApiProperty()
  status: string;

  @ApiProperty()
  totalTasks: number;

  @ApiProperty()
  completedTasks: number;

  @ApiProperty()
  failedTasks: number;

  @ApiProperty()
  progressPercent: number;

  @ApiProperty({ type: [CrawlTaskResponse] })
  tasks: CrawlTaskResponse[];

  @ApiPropertyOptional()
  startedAt?: Date | null;

  @ApiPropertyOptional()
  completedAt?: Date | null;
}

export class ManhwaCrawlStatus {
  @ApiProperty()
  manhwaId: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  sourceUrl: string | null;

  @ApiProperty()
  lastCrawledChapter: number;

  @ApiProperty()
  nextChapterToCrawl: number;

  @ApiProperty()
  crawlEnabled: boolean;

  @ApiPropertyOptional()
  lastTask?: CrawlTaskResponse | null;
}

// ============================================
// RE-CRAWL DTOs
// ============================================

export class ReCrawlDto {
  @ApiPropertyOptional({
    description:
      'Custom source URL (optional, uses chapter sourceUrl if not provided)',
    example: 'https://manhuarmtl.com/manga/some-title/chapter-1',
  })
  @IsString()
  @IsOptional()
  sourceUrl?: string;
}

export class ReCrawlResponse {
  @ApiProperty({ description: 'Chapter ID' })
  chapterId: string;

  @ApiProperty({ description: 'Manhwa ID' })
  manhwaId: string;

  @ApiPropertyOptional({ description: 'Manhwa title' })
  manhwaTitle?: string;

  @ApiProperty({ description: 'Chapter number' })
  chapterNo: number;

  @ApiProperty({ description: 'Re-crawl type: "full" or "json_only"' })
  type: 'full' | 'json_only';

  @ApiProperty({ description: 'S3 base path for the chapter' })
  s3BasePath: string;

  @ApiPropertyOptional({ description: 'Number of images re-crawled (for full)' })
  imagesCount?: number;

  @ApiPropertyOptional({ description: 'Number of images deleted before re-crawl' })
  deletedImagesCount?: number;

  @ApiPropertyOptional({ description: 'S3 path to en.json' })
  s3EnJsonPath?: string | null;

  @ApiPropertyOptional({ description: 'S3 path to mm.json' })
  s3MmJsonPath?: string | null;

  @ApiProperty({ description: 'Total text boxes extracted' })
  totalTextBoxes: number;

  @ApiProperty({ description: 'Whether the operation was successful' })
  success: boolean;

  @ApiProperty({ description: 'Status message' })
  message: string;
}
