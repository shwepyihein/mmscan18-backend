import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum CrawlBatchStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  PARTIAL = 'PARTIAL', // Some tasks failed
  FAILED = 'FAILED',
}

export enum CrawlBatchType {
  SINGLE = 'SINGLE', // Single manhwa, single chapter
  NEXT = 'NEXT', // Single manhwa, next chapter
  RANGE = 'RANGE', // Single manhwa, range of chapters
  ALL = 'ALL', // All active manhwas
}

@Entity('crawl_batches')
export class CrawlBatch {
  @ApiProperty({ description: 'CrawlBatch UUID' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ description: 'Batch type', enum: CrawlBatchType })
  @Column({
    type: 'enum',
    enum: CrawlBatchType,
  })
  type: CrawlBatchType;

  @ApiProperty({ description: 'Batch status', enum: CrawlBatchStatus })
  @Column({
    type: 'enum',
    enum: CrawlBatchStatus,
    default: CrawlBatchStatus.PENDING,
  })
  status: CrawlBatchStatus;

  @ApiProperty({ description: 'Total tasks in batch' })
  @Column({ type: 'int', default: 0 })
  totalTasks: number;

  @ApiProperty({ description: 'Completed tasks count' })
  @Column({ type: 'int', default: 0 })
  completedTasks: number;

  @ApiProperty({ description: 'Failed tasks count' })
  @Column({ type: 'int', default: 0 })
  failedTasks: number;

  @ApiProperty({ description: 'Progress percentage (0-100)' })
  @Column({ type: 'int', default: 0 })
  progressPercent: number;

  @ApiPropertyOptional({ description: 'Optional description' })
  @Column({ type: 'text', nullable: true })
  description: string | null;

  @ApiPropertyOptional({ description: 'When batch started processing' })
  @Column({ type: 'timestamp', nullable: true })
  startedAt: Date | null;

  @ApiPropertyOptional({ description: 'When batch completed' })
  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date | null;

  @ApiProperty({ description: 'Creation timestamp' })
  @CreateDateColumn()
  createdAt: Date;

  @ApiProperty({ description: 'Last update timestamp' })
  @UpdateDateColumn()
  updatedAt: Date;
}
