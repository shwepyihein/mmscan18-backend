import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Chapter } from '../../chapter/model/chapter.entity';
import { ContributorLevel } from '../../common/enums/contributor-level.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import { TelegramUser } from './telegram-user.entity';

@Entity('users')
@Index(['role', 'isActive'])
export class User {
  @ApiProperty({
    description: 'User UUID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({
    description: 'User email address',
    example: 'contributor@example.com',
  })
  @Column({ type: 'varchar', unique: true })
  email: string;

  @ApiProperty({
    description: 'Hashed password (not returned in responses)',
    writeOnly: true,
  })
  @Column({ type: 'varchar' })
  password: string;

  @ApiPropertyOptional({
    description: 'User full name',
    example: 'John Doe',
  })
  @Column({ type: 'varchar', nullable: true })
  name: string | null;

  @ApiPropertyOptional({
    description: 'Public username/display name',
    example: 'translator_kim',
  })
  @Column({ type: 'varchar', unique: true, nullable: true })
  username: string | null;

  @ApiPropertyOptional({
    description: 'Avatar image URL',
    example: 'https://example.com/avatar.jpg',
  })
  @Column({ type: 'varchar', nullable: true })
  avatarUrl: string | null;

  @ApiPropertyOptional({
    description: 'User bio/description',
    example: 'Passionate manhwa translator',
  })
  @Column({ type: 'text', nullable: true })
  bio: string | null;

  @ApiPropertyOptional({
    description: 'Telegram user ID for Mini App integration',
    example: '123456789',
  })
  @Column({ type: 'varchar', unique: true, nullable: true })
  telegramId: string | null;

  @ApiPropertyOptional({
    description: 'Detailed Telegram profile information',
    type: () => TelegramUser,
  })
  @OneToOne(() => TelegramUser, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'telegramProfileId' })
  telegramProfile: TelegramUser | null;

  @Column({ type: 'uuid', nullable: true })
  telegramProfileId: string | null;

  @ApiProperty({
    description: 'User role',
    enum: UserRole,
    example: UserRole.USER,
  })
  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.USER,
  })
  role: UserRole;

  @ApiProperty({
    description: 'Whether user account is active',
    example: true,
  })
  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  // === CONTRIBUTOR STATS ===

  @ApiProperty({
    description: 'Contributor level based on translations',
    enum: ContributorLevel,
    example: ContributorLevel.BRONZE,
  })
  @Column({
    type: 'enum',
    enum: ContributorLevel,
    default: ContributorLevel.BRONZE,
  })
  level: ContributorLevel;

  @ApiProperty({
    description: 'Total chapters translated and approved',
    example: 42,
  })
  @Column({ type: 'int', default: 0 })
  totalChaptersTranslated: number;

  @ApiProperty({
    description: 'Total views accumulated on translations',
    example: 15000,
  })
  @Column({ type: 'int', default: 0 })
  totalViews: number;

  @ApiProperty({
    description: 'Total points earned',
    example: 5000,
  })
  @Column({ type: 'int', default: 0 })
  totalPoints: number;

  @ApiProperty({
    description: 'Current coin balance for purchasing chapters',
    example: 100,
  })
  @Column({ type: 'int', default: 0 })
  coinBalance: number;

  @ApiProperty({
    description: 'Current streak (consecutive days with approved translation)',
    example: 7,
  })
  @Column({ type: 'int', default: 0 })
  currentStreak: number;

  @ApiProperty({
    description: 'Longest streak ever achieved',
    example: 14,
  })
  @Column({ type: 'int', default: 0 })
  longestStreak: number;

  @ApiPropertyOptional({
    description: 'Timestamp of last approved translation',
  })
  @Column({ type: 'timestamp', nullable: true })
  lastTranslationAt: Date | null;

  @ApiProperty({
    description: 'List of badge codes earned',
    example: ['first_translation', 'streak_7'],
  })
  @Column({ type: 'simple-array', nullable: true })
  badges: string[] | null;

  /** Available translation slots (default 5). Decremented when selecting a chapter, restored when submitting for review. */
  @ApiProperty({
    description:
      'Available translation slots (max 5). Decreases when selecting a chapter, increases when submitting for review.',
    example: 3,
  })
  @Column({ type: 'int', default: 5 })
  availableTranslateSlot: number;

  @ApiPropertyOptional({
    description: 'Chapters assigned to this contributor',
    type: () => [Chapter],
  })
  @OneToMany(() => Chapter, (chapter) => chapter.assignedContributor)
  assignedChapters: Chapter[];

  @ApiProperty({ description: 'Creation timestamp' })
  @CreateDateColumn()
  createdAt: Date;

  @ApiProperty({ description: 'Last update timestamp' })
  @UpdateDateColumn()
  updatedAt: Date;
}
