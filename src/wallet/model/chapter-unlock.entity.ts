import { ApiProperty } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/model/user.entity';
import { Chapter } from '../../chapter/model/chapter.entity';

@Entity('chapter_unlocks')
@Index(['userId', 'chapterId'], { unique: true })
export class ChapterUnlock {
  @ApiProperty({ description: 'Unlock entry UUID' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ description: 'User ID' })
  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @ApiProperty({ description: 'Chapter ID' })
  @Column({ type: 'uuid' })
  chapterId: string;

  @ManyToOne(() => Chapter)
  @JoinColumn({ name: 'chapterId' })
  chapter: Chapter;

  @ApiProperty({ description: 'Amount of coins spent' })
  @Column({ type: 'int' })
  coinsSpent: number;

  @CreateDateColumn()
  createdAt: Date;
}
