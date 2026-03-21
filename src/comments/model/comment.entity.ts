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
import { Chapter } from '../../chapter/model/chapter.entity';
import { User } from '../../users/model/user.entity';

@Entity('comments')
@Index(['chapterId', 'createdAt'])
export class Comment {
  @ApiProperty({
    description: 'Comment UUID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({
    description: 'Chapter UUID this comment belongs to',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @Column({ type: 'uuid' })
  chapterId: string;

  @ManyToOne(() => Chapter, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'chapterId' })
  chapter: Chapter;

  @ApiPropertyOptional({
    description: 'User UUID (null for anonymous comments)',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'userId' })
  user: User | null;

  @ApiPropertyOptional({
    description: 'Guest name for anonymous comments',
    example: 'Anonymous Reader',
  })
  @Column({ type: 'varchar', nullable: true })
  guestName: string | null;

  @ApiProperty({
    description: 'Comment content',
    example: 'Great chapter! Thanks for translating!',
  })
  @Column({ type: 'text' })
  content: string;

  @ApiProperty({
    description: 'Number of likes on this comment',
    example: 5,
  })
  @Column({ type: 'int', default: 0 })
  likes: number;

  @ApiPropertyOptional({
    description: 'Parent comment UUID for replies',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @Column({ type: 'uuid', nullable: true })
  parentId: string | null;

  @ApiProperty({
    description: 'Whether the comment is visible',
    example: true,
  })
  @Column({ type: 'boolean', default: true })
  isVisible: boolean;

  @ApiProperty({ description: 'Creation timestamp' })
  @CreateDateColumn()
  createdAt: Date;

  @ApiProperty({ description: 'Last update timestamp' })
  @UpdateDateColumn()
  updatedAt: Date;
}
