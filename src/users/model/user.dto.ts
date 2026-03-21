import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { UserRole } from '../../common/enums/user-role.enum';

export class CreateUserDto {
  @ApiProperty({
    description: 'User email address',
    example: 'contributor@example.com',
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    description: 'User password (minimum 8 characters)',
    example: 'SecurePassword123!',
    minLength: 8,
  })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiPropertyOptional({
    description: 'User full name',
    example: 'John Doe',
  })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({
    description: 'Public username (unique, for profile URL)',
    example: 'translator_kim',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(30)
  @IsOptional()
  username?: string;

  @ApiProperty({
    description: 'User role',
    enum: UserRole,
    example: UserRole.USER,
  })
  @IsEnum(UserRole)
  role: UserRole;
}

export class UpdateUserDto {
  @ApiPropertyOptional({
    description: 'User email address',
    example: 'contributor@example.com',
  })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({
    description: 'User full name',
    example: 'John Doe',
  })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({
    description: 'Public username',
    example: 'translator_kim',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(30)
  @IsOptional()
  username?: string;

  @ApiPropertyOptional({
    description: 'User bio/description',
    example: 'Passionate manhwa translator from Korea',
  })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  bio?: string;

  @ApiPropertyOptional({
    description: 'User role (admin only)',
    enum: UserRole,
    example: UserRole.USER,
  })
  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole;

  @ApiPropertyOptional({
    description: 'Whether user account is active',
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class PublicContributorDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  username: string | null;

  @ApiProperty()
  name: string | null;

  @ApiProperty()
  avatarUrl: string | null;

  @ApiProperty()
  bio: string | null;

  @ApiProperty()
  level: string;

  @ApiProperty()
  totalChaptersTranslated: number;

  @ApiProperty()
  totalViews: number;

  @ApiProperty()
  currentStreak: number;

  @ApiProperty()
  longestStreak: number;

  @ApiProperty()
  badges: string[] | null;

  @ApiProperty()
  createdAt: Date;
}

export class SaveTelegramUserDto {
  @ApiProperty({ example: '123456789' })
  @IsString()
  telegramId: string;

  @ApiPropertyOptional({ example: 'John' })
  @IsString()
  @IsOptional()
  firstName?: string;

  @ApiPropertyOptional({ example: 'Doe' })
  @IsString()
  @IsOptional()
  lastName?: string;

  @ApiPropertyOptional({ example: 'johndoe' })
  @IsString()
  @IsOptional()
  username?: string;

  @ApiPropertyOptional({ example: 'en' })
  @IsString()
  @IsOptional()
  languageCode?: string;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isPremium?: boolean;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  allowsWriteToPm?: boolean;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  addedToAttachmentMenu?: boolean;
}
