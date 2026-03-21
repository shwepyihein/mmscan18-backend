import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DashboardChaptersByStatusDto {
  @ApiProperty({ description: 'Count of RAW chapters', example: 10 })
  raw: number;

  @ApiProperty({ description: 'Count of CLEANING chapters', example: 2 })
  cleaning: number;

  @ApiProperty({ description: 'Count of IN_PROGRESS chapters', example: 5 })
  inProgress: number;

  @ApiProperty({ description: 'Count of IN_REVIEW chapters', example: 3 })
  inReview: number;

  @ApiProperty({ description: 'Count of TRANSLATED chapters', example: 120 })
  translated: number;
}

export class DashboardStatsDto {
  @ApiProperty({
    description: 'Total chapters across all manhwas',
    example: 150,
  })
  totalChapters: number;

  @ApiProperty({
    description: 'Chapters available to readers (TRANSLATED)',
    example: 120,
  })
  translated: number;

  @ApiProperty({
    description: 'Chapters pending review (IN_REVIEW)',
    example: 5,
  })
  pendingReview: number;

  @ApiPropertyOptional({
    description: 'Crawl jobs currently running (waiting + active). Admin only.',
    example: 2,
  })
  crawlJobs?: number;
}

export class DashboardRecentManhwaDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiPropertyOptional()
  slugUrl: string | null;

  @ApiPropertyOptional()
  coverImageUrl: string | null;

  @ApiProperty()
  totalChapters: number;

  @ApiProperty()
  status: string;

  @ApiProperty()
  updatedAt: Date;
}

export class DashboardResponseDto {
  @ApiProperty({ description: 'Summary statistics', type: DashboardStatsDto })
  stats: DashboardStatsDto;

  @ApiProperty({
    description: 'Chapter counts by status',
    type: DashboardChaptersByStatusDto,
  })
  chaptersByStatus: DashboardChaptersByStatusDto;

  @ApiProperty({
    description: 'Recent manhwas',
    type: [DashboardRecentManhwaDto],
  })
  recentManhwas: DashboardRecentManhwaDto[];
}
