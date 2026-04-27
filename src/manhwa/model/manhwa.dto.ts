import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';
import { ManhwaStatus } from './manhwa-status.enum';

export class CreateManhwaDto {
  @ApiProperty({
    description: 'Manhwa title',
    example: 'Solo Leveling',
  })
  @IsString()
  title: string;

  @ApiPropertyOptional({
    description: 'URL slug (auto-generated from title if not provided)',
    example: 'solo-leveling',
  })
  @IsString()
  @IsOptional()
  slugUrl?: string;

  @ApiPropertyOptional({
    description: 'Manhwa title in Myanmar',
    example: 'ဆိုလိုလက်ဗယ်လင်း',
  })
  @IsString()
  @IsOptional()
  titleMm?: string;

  @ApiPropertyOptional({
    description: 'Manhwa description in Myanmar',
  })
  @IsString()
  @IsOptional()
  descriptionMm?: string;

  @ApiPropertyOptional({
    description: 'Alternative titles',
    example: 'Na Honjaman Level Up, 나 혼자만 레벨업',
  })
  @IsString()
  @IsOptional()
  alternativeTitles?: string;

  @ApiPropertyOptional({
    description: 'Manhwa description/synopsis',
    example: 'A story about a hunter who becomes the strongest.',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    description: 'Cover image file (multipart/form-data)',
    type: 'string',
    format: 'binary',
  })
  @IsOptional()
  coverImage?: Express.Multer.File;

  @ApiPropertyOptional({
    description: 'Author name',
    example: 'Chugong',
  })
  @IsString()
  @IsOptional()
  author?: string;

  @ApiPropertyOptional({
    description: 'Artist name',
    example: 'Jang Sung-rak',
  })
  @IsString()
  @IsOptional()
  artist?: string;

  @ApiPropertyOptional({
    description: 'Genres/tags (comma-separated or array)',
    example: 'action,fantasy,adventure',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value === 'string') {
      return value
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
    }

    if (Array.isArray(value)) {
      return value
        .map((v) => (typeof v === 'string' ? v.trim().toLowerCase() : ''))
        .filter((v) => v.length > 0);
    }

    return undefined;
  })
  @IsArray()
  @IsString({ each: true })
  genres?: string[];

  @ApiPropertyOptional({
    description: 'Release year',
    example: '2018',
  })
  @IsString()
  @IsOptional()
  releaseYear?: string;

  @ApiPropertyOptional({
    description: 'Original language',
    example: 'Korean',
  })
  @IsString()
  @IsOptional()
  originalLanguage?: string;

  @ApiPropertyOptional({
    description: 'Source URL base (without chapter number)',
    example: 'https://manhuarmtl.com/manga/the-knight-only-lives-today/',
  })
  @IsString()
  @IsOptional()
  sourceUrl?: string;

  @ApiPropertyOptional({
    description: 'Custom URL pattern with {chapter} placeholder',
    example: 'https://other-site.com/read/{chapter}.html',
  })
  @IsString()
  @IsOptional()
  sourceUrlPattern?: string;

  @ApiPropertyOptional({
    description: 'Prompt template file path (used by AI generation)',
    example: 'prompts/manhwa/prompt_en.md',
  })
  @IsString()
  @IsOptional()
  promptPath?: string;

  @ApiPropertyOptional({
    description: 'Manhwa status',
    enum: ManhwaStatus,
    example: ManhwaStatus.ONGOING,
  })
  @IsOptional()
  @IsEnum(ManhwaStatus)
  @Transform(({ value }: { value: unknown }) => {
    if (!value) return ManhwaStatus.ONGOING;
    return value as ManhwaStatus;
  })
  status?: ManhwaStatus;
}

export class UpdateManhwaDto {
  @ApiPropertyOptional({
    description: 'Manhwa title',
    example: 'Solo Leveling',
  })
  @IsString()
  @IsOptional()
  title?: string;

  @ApiPropertyOptional({
    description:
      'URL slug (regenerated from title if title is updated and this is omitted)',
    example: 'solo-leveling',
  })
  @IsString()
  @IsOptional()
  slugUrl?: string;

  @ApiPropertyOptional({
    description: 'Manhwa title in Myanmar',
    example: 'ဆိုလိုလက်ဗယ်လင်း',
  })
  @IsString()
  @IsOptional()
  titleMm?: string;

  @ApiPropertyOptional({
    description: 'Manhwa description in Myanmar',
  })
  @IsString()
  @IsOptional()
  descriptionMm?: string;

  @ApiPropertyOptional({
    description: 'Alternative titles',
    example: 'Na Honjaman Level Up, 나 혼자만 레벨업',
  })
  @IsString()
  @IsOptional()
  alternativeTitles?: string;

  @ApiPropertyOptional({
    description: 'Manhwa description',
    example: 'A story about a hunter who becomes the strongest.',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    description: 'Cover image file (multipart/form-data)',
    type: 'string',
    format: 'binary',
  })
  @IsOptional()
  coverImage?: Express.Multer.File;

  @ApiPropertyOptional({
    description: 'Author name',
    example: 'Chugong',
  })
  @IsString()
  @IsOptional()
  author?: string;

  @ApiPropertyOptional({
    description: 'Artist name',
    example: 'Jang Sung-rak',
  })
  @IsString()
  @IsOptional()
  artist?: string;

  @ApiPropertyOptional({
    description: 'Genres/tags (comma-separated or array)',
    example: 'action,fantasy,adventure',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value === 'string') {
      return value
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
    }

    if (Array.isArray(value)) {
      return value
        .map((v) => (typeof v === 'string' ? v.trim().toLowerCase() : ''))
        .filter((v) => v.length > 0);
    }

    return undefined;
  })
  @IsArray()
  @IsString({ each: true })
  genres?: string[];

  @ApiPropertyOptional({
    description: 'Release year',
    example: '2018',
  })
  @IsString()
  @IsOptional()
  releaseYear?: string;

  @ApiPropertyOptional({
    description: 'Original language',
    example: 'Korean',
  })
  @IsString()
  @IsOptional()
  originalLanguage?: string;

  @ApiPropertyOptional({
    description: 'Whether manhwa is active',
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (typeof value === 'boolean') return value;
    return undefined;
  })
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Source URL base (without chapter number)',
    example: 'https://manhuarmtl.com/manga/the-knight-only-lives-today/',
  })
  @IsString()
  @IsOptional()
  sourceUrl?: string;

  @ApiPropertyOptional({
    description: 'Custom URL pattern with {chapter} placeholder',
    example: 'https://other-site.com/read/{chapter}.html',
  })
  @IsString()
  @IsOptional()
  sourceUrlPattern?: string;

  @ApiPropertyOptional({
    description: 'Prompt template file path (used by AI generation)',
    example: 'prompts/manhwa/prompt_en.md',
  })
  @IsString()
  @IsOptional()
  promptPath?: string;

  @ApiPropertyOptional({
    description: 'Enable crawling for this manhwa',
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (typeof value === 'boolean') return value;
    return undefined;
  })
  crawlEnabled?: boolean;

  @ApiPropertyOptional({
    description: 'Manhwa status',
    enum: ManhwaStatus,
    example: ManhwaStatus.ONGOING,
  })
  @IsEnum(ManhwaStatus)
  @IsOptional()
  status?: ManhwaStatus;
}

export class SetChapterLockDto {
  @ApiProperty({
    description: 'Set lock state: true=locked, false=unlocked',
    example: true,
  })
  @IsBoolean()
  @Transform(({ value }: { value: unknown }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (typeof value === 'boolean') return value;
    return undefined;
  })
  isLocked: boolean;
}

// Predefined genres for reference
export const MANHWA_GENRES = [
  'action',
  'adventure',
  'comedy',
  'drama',
  'fantasy',
  'horror',
  'isekai',
  'martial-arts',
  'mystery',
  'psychological',
  'romance',
  'school-life',
  'sci-fi',
  'slice-of-life',
  'sports',
  'supernatural',
  'thriller',
  'tragedy',
  'historical',
  'mature',
  'shounen',
  'shoujo',
  'seinen',
  'josei',
  'harem',
  'reverse-harem',
  'magic',
  'mecha',
  'military',
  'music',
  'parody',
  'police',
  'post-apocalyptic',
  'reincarnation',
  'revenge',
  'system',
  'tower',
  'dungeon',
  'game',
  'villainess',
  'regression',
] as const;

export type ManhwaGenre = (typeof MANHWA_GENRES)[number];
