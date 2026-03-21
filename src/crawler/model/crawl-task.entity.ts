import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Manhwa } from '../../manhwa/model/manhwa.entity';

export enum CrawlTaskStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  RETRYING = 'RETRYING',
}

@Entity('crawl_tasks')
export class CrawlTask {
  @ApiProperty({ description: 'CrawlTask UUID' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ description: 'Manhwa ID' })
  @Column({ type: 'uuid' })
  manhwaId: string;

  @ManyToOne(() => Manhwa, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'manhwaId' })
  manhwa: Manhwa;

  @ApiPropertyOptional({ description: 'Chapter ID (if chapter was created)' })
  @Column({ type: 'uuid', nullable: true })
  chapterId: string | null;

  @ApiProperty({ description: 'Chapter number to crawl' })
  @Column({ type: 'int' })
  chapterNo: number;

  @ApiProperty({ description: 'Source URL used for crawling' })
  @Column({ type: 'text' })
  sourceUrl: string;

  @ApiProperty({ description: 'Task status', enum: CrawlTaskStatus })
  @Column({
    type: 'enum',
    enum: CrawlTaskStatus,
    default: CrawlTaskStatus.PENDING,
  })
  status: CrawlTaskStatus;

  @ApiPropertyOptional({
    description: 'Batch ID (if part of a batch operation)',
  })
  @Column({ type: 'uuid', nullable: true })
  batchId: string | null;

  @ApiProperty({ description: 'Number of retry attempts' })
  @Column({ type: 'int', default: 0 })
  retryCount: number;

  @ApiProperty({ description: 'Maximum retry attempts allowed' })
  @Column({ type: 'int', default: 3 })
  maxRetries: number;

  @ApiPropertyOptional({ description: 'Error message if failed' })
  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @ApiProperty({ description: 'Number of images downloaded' })
  @Column({ type: 'int', default: 0 })
  imagesDownloaded: number;

  @ApiProperty({ description: 'Total images to download' })
  @Column({ type: 'int', default: 0 })
  totalImages: number;

  @ApiProperty({ description: 'Progress percentage (0-100)' })
  @Column({ type: 'int', default: 0 })
  progressPercent: number;

  @ApiPropertyOptional({ description: 'When task started' })
  @Column({ type: 'timestamp', nullable: true })
  startedAt: Date | null;

  @ApiPropertyOptional({ description: 'When task completed' })
  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date | null;

  @ApiProperty({ description: 'Creation timestamp' })
  @CreateDateColumn()
  createdAt: Date;

  @ApiProperty({ description: 'Last update timestamp' })
  @UpdateDateColumn()
  updatedAt: Date;
}
