import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Chapter } from '../../chapter/model/chapter.entity';
import { ManhwaStatus } from './manhwa-status.enum';

@Entity('manhwas')
@Index(['isActive', 'status'])
@Index(['slugUrl'], { unique: true })
export class Manhwa {
  @ApiProperty({
    description: 'Manhwa UUID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({
    description: 'Manhwa title',
    example: 'Solo Leveling',
  })
  @Column({ type: 'varchar' })
  title: string;

  @ApiPropertyOptional({
    description: 'URL slug derived from title (unique)',
    example: 'solo-leveling',
  })
  @Column({ type: 'varchar', unique: true, nullable: true })
  slugUrl: string | null;

  @ApiPropertyOptional({
    description: 'Manhwa title in Myanmar',
    example: 'ဆိုလိုလက်ဗယ်လင်း',
  })
  @Column({ type: 'varchar', nullable: true })
  titleMm: string | null;

  @ApiPropertyOptional({
    description: 'Manhwa description in Myanmar',
  })
  @Column({ type: 'text', nullable: true })
  descriptionMm: string | null;

  @ApiPropertyOptional({
    description: 'Prompt template file path (used by AI generation)',
    example: 'prompts/manhwa/prompt_en.md',
  })
  @Column({ type: 'varchar', nullable: true })
  promptPath: string | null;

  @ApiPropertyOptional({
    description: 'Alternative titles',
    example: 'Na Honjaman Level Up, 나 혼자만 레벨업',
  })
  @Column({ type: 'text', nullable: true })
  alternativeTitles: string | null;

  @ApiPropertyOptional({
    description: 'Manhwa description/synopsis',
    example: 'A story about a hunter who becomes the strongest.',
  })
  @Column({ type: 'text', nullable: true })
  description: string | null;

  @ApiPropertyOptional({
    description: 'Cover image URL',
    example: 'https://example.com/cover.jpg',
  })
  @Column({ type: 'varchar', nullable: true })
  coverImageUrl: string | null;

  @ApiPropertyOptional({
    description: 'Author name',
    example: 'Chugong',
  })
  @Column({ type: 'varchar', nullable: true })
  author: string | null;

  @ApiPropertyOptional({
    description: 'Artist name',
    example: 'Jang Sung-rak',
  })
  @Column({ type: 'varchar', nullable: true })
  artist: string | null;

  @ApiProperty({
    description: 'Genres/tags',
    example: ['action', 'fantasy', 'adventure'],
  })
  @Column({ type: 'simple-array', nullable: true })
  genres: string[] | null;

  @ApiPropertyOptional({
    description: 'Release year',
    example: '2018',
  })
  @Column({ type: 'varchar', nullable: true })
  releaseYear: string | null;

  @ApiPropertyOptional({
    description: 'Original language',
    example: 'Korean',
  })
  @Column({ type: 'varchar', nullable: true })
  originalLanguage: string | null;

  // === CRAWLING CONFIG ===

  @ApiPropertyOptional({
    description: 'Source URL base (without chapter number)',
    example: 'https://manhuarmtl.com/manga/the-knight-only-lives-today/',
  })
  @Column({ type: 'varchar', nullable: true })
  sourceUrl: string | null;

  @ApiPropertyOptional({
    description: 'Custom URL pattern with {chapter} placeholder',
    example: 'https://other-site.com/read/{chapter}.html',
  })
  @Column({ type: 'varchar', nullable: true })
  sourceUrlPattern: string | null;

  @ApiProperty({
    description: 'Last successfully crawled chapter number',
    example: 96,
  })
  @Column({ type: 'int', default: 0 })
  lastCrawledChapter: number;

  @ApiProperty({
    description: 'Whether auto-crawling is enabled for this manhwa',
    example: true,
  })
  @Column({ type: 'boolean', default: true })
  crawlEnabled: boolean;

  @ApiProperty({
    description: 'Whether manhwa is active',
    example: true,
  })
  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @ApiProperty({
    description: 'Manhwa status',
    enum: ManhwaStatus,
    example: ManhwaStatus.ONGOING,
  })
  @Column({
    type: 'enum',
    enum: ManhwaStatus,
    default: ManhwaStatus.ONGOING,
  })
  status: ManhwaStatus;

  // === STATS ===

  @ApiProperty({
    description: 'Total view count across all chapters',
    example: 50000,
  })
  @Column({ type: 'int', default: 0 })
  totalViews: number;

  @ApiProperty({
    description: 'Total published chapters count',
    example: 120,
  })
  @Column({ type: 'int', default: 0 })
  totalChapters: number;

  @ApiProperty({
    description: 'Number of subscribers/followers',
    example: 1500,
  })
  @Column({ type: 'int', default: 0 })
  subscriberCount: number;

  @ApiProperty({
    description: 'Average rating (1-5)',
    example: 4.5,
  })
  @Column({ type: 'decimal', precision: 2, scale: 1, default: 0 })
  rating: number;

  // === RELATIONS ===

  @ApiPropertyOptional({
    description: 'Chapters belonging to this manhwa',
    type: () => [Chapter],
  })
  @OneToMany(() => Chapter, (chapter) => chapter.manhwa)
  chapters: Chapter[];

  @ApiProperty({ description: 'Creation timestamp' })
  @CreateDateColumn()
  createdAt: Date;

  @ApiProperty({ description: 'Last update timestamp' })
  @UpdateDateColumn()
  updatedAt: Date;
}
