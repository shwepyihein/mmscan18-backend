import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Manhwa } from '../../manhwa/model/manhwa.entity';
import { User } from '../../users/model/user.entity';
import { ChapterStatus } from './chapter.enum';

@Entity('chapters')
@Index(['manhwaId', 'chapterNo'], { unique: true })
@Index(['status'])
@Index(['assignedContributorId'])
@Index(['manhwaId', 'status'])
export class Chapter {
  @ApiProperty({
    description: 'Chapter UUID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({
    description: 'Manhwa UUID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @Column({
    type: 'uuid',
  })
  manhwaId: string;

  @ApiPropertyOptional({
    description: 'Manhwa details',
    type: () => Manhwa,
  })
  @ManyToOne(() => Manhwa, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'manhwaId' })
  manhwa: Manhwa;

  @ApiProperty({ description: 'Chapter number', example: 1 })
  @Column({ type: 'int' })
  chapterNo: number;

  @ApiPropertyOptional({
    description: 'Chapter title',
    example: 'Chapter 1: The Beginning',
  })
  @Column({ type: 'varchar', nullable: true })
  title: string | null;

  @ApiProperty({
    description: 'Source URL where chapter was crawled from',
    example: 'https://example.com/chapter-1',
  })
  @Column({ type: 'text' })
  sourceUrl: string;

  @ApiProperty({
    description: 'Current chapter status',
    enum: ChapterStatus,
    example: ChapterStatus.RAW,
  })
  @Column({
    type: 'enum',
    enum: ChapterStatus,
    default: ChapterStatus.RAW,
  })
  status: ChapterStatus;

  @ApiProperty({
    description: 'Whether the chapter requires coins to unlock',
    example: false,
  })
  @Column({ type: 'boolean', default: false })
  isLocked: boolean;

  @ApiProperty({
    description: 'Price in coins to unlock the chapter',
    example: 5,
  })
  @Column({ type: 'int', default: 5 })
  coinPrice: number;

  @ApiProperty({
    description: 'S3 base path for chapter assets',
    example: 'manhwa/123/chapters/1',
  })
  @Column({ type: 'text' })
  s3BasePath: string;

  @ApiProperty({
    description: 'S3 path to English JSON file',
    example: 'manhwa/123/chapters/1/en.json',
  })
  @Column({ type: 'text' })
  enJsonPath: string;

  @ApiProperty({
    description: 'S3 path to Myanmar (translated) JSON file',
    example: 'manhwa/123/chapters/1/mm.json',
  })
  @Column({ type: 'text', default: '' })
  mmJsonPath: string;

  // === CONTRIBUTOR ASSIGNMENT ===

  @ApiPropertyOptional({
    description: 'UUID of assigned contributor',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @Column({ type: 'uuid', nullable: true })
  assignedContributorId: string | null;

  @ApiPropertyOptional({
    description: 'Assigned contributor user details',
    type: () => User,
  })
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assignedContributorId' })
  assignedContributor: User | null;

  // === ENGAGEMENT STATS ===

  @ApiProperty({
    description: 'Total view count',
    example: 1500,
  })
  @Column({ type: 'int', default: 0 })
  viewCount: number;

  @ApiProperty({
    description: 'Total like count',
    example: 120,
  })
  @Column({ type: 'int', default: 0 })
  likeCount: number;

  @ApiProperty({
    description: 'Total comment count',
    example: 45,
  })
  @Column({ type: 'int', default: 0 })
  commentCount: number;

  @ApiPropertyOptional({
    description: 'Timestamp when chapter was published',
  })
  @Column({ type: 'timestamp', nullable: true })
  publishedAt: Date | null;

  @ApiProperty({ description: 'Creation timestamp' })
  @CreateDateColumn()
  createdAt: Date;

  @ApiProperty({ description: 'Last update timestamp' })
  @UpdateDateColumn()
  updatedAt: Date;
}
