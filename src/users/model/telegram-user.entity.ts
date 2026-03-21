import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('telegram_users')
export class TelegramUser {
  @ApiProperty({ description: 'Internal UUID' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ description: 'Telegram User ID', example: '123456789' })
  @Column({ type: 'varchar', unique: true })
  telegramId: string;

  @ApiPropertyOptional({ description: 'First name', example: 'John' })
  @Column({ type: 'varchar', nullable: true })
  firstName: string | null;

  @ApiPropertyOptional({ description: 'Last name', example: 'Doe' })
  @Column({ type: 'varchar', nullable: true })
  lastName: string | null;

  @ApiPropertyOptional({ description: 'Telegram username', example: 'johndoe' })
  @Column({ type: 'varchar', nullable: true })
  username: string | null;

  @ApiPropertyOptional({ description: 'Language code', example: 'en' })
  @Column({ type: 'varchar', nullable: true })
  languageCode: string | null;

  @ApiPropertyOptional({ description: 'Whether user has Telegram Premium' })
  @Column({ type: 'boolean', default: false })
  isPremium: boolean;

  @ApiPropertyOptional({ description: 'Whether user allows writing to PM' })
  @Column({ type: 'boolean', default: false })
  allowsWriteToPm: boolean;

  @ApiPropertyOptional({ description: 'Whether user added to attachment menu' })
  @Column({ type: 'boolean', default: false })
  addedToAttachmentMenu: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
