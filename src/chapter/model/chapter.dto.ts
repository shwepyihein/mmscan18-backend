import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { ChapterStatus } from './chapter.enum';

/** Per-text display settings (font, alignment, color, etc.) */
export class TranslationTextSettingsDto {
  @ApiPropertyOptional({
    description: 'Font family name',
    example: 'Noto Serif Myanmar',
  })
  @IsOptional()
  @IsString()
  fontFamily?: string;

  @ApiPropertyOptional({
    description: 'Text alignment',
    example: 'left',
  })
  @IsOptional()
  @IsString()
  textAlign?: string;

  @ApiPropertyOptional({
    description: 'Text color (e.g. hex)',
    example: 'black',
  })
  @IsOptional()
  @IsString()
  fontColor?: string;

  @ApiPropertyOptional({
    description: 'Text color alias (accepted from editor payloads)',
    example: '#000000',
  })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional({
    description: 'Font size in pixels',
    example: '24',
  })
  @IsOptional()
  @IsString()
  fontSize?: string;

  @ApiPropertyOptional({
    description: 'Line height multiplier',
    example: '1.2',
  })
  @IsOptional()
  @IsString()
  lineHeight?: string;

  @ApiPropertyOptional({
    description: 'Whether this text has been marked as OK in the editor',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  markedOk?: boolean;
}

export class CreateChapterCrawlDto {
  @ApiProperty({
    description: 'UUID of the manhwa',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  manhwaId: string;

  @ApiProperty({
    description: 'Chapter number',
    example: 1,
    minimum: 1,
  })
  @IsInt()
  @Min(1)
  chapterNo: number;

  @ApiProperty({
    description: 'Source URL to crawl the chapter from',
    example: 'https://example.com/manhwa/chapter-1',
  })
  @IsUrl()
  sourceUrl: string;
}

// Translation text entry with bounding box
export class TranslationTextDto {
  @ApiProperty({
    description: 'Bounding box coordinates [x, y, width, height]',
    example: [99, 734, 190, 117],
  })
  @IsArray()
  @IsNumber({}, { each: true })
  box: number[];

  @ApiProperty({
    description: 'Translated text',
    example: 'ငါ တောင်းဆိုချက်တစ်ခု ရှိတယ်။',
  })
  @IsString()
  text: string;

  @ApiProperty({
    description: 'Whether this text has been marked as OK',
    example: true,
    required: false,
  })
  @IsOptional()
  markedOk?: boolean;

  @ApiPropertyOptional({
    description: 'Per-text settings (markedOk, fontSize, style, etc.)',
    type: TranslationTextSettingsDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => TranslationTextSettingsDto)
  settings?: TranslationTextSettingsDto;

  @ApiProperty({
    description: 'Whether this text has been flagged for review',
    example: false,
    required: false,
  })
  @IsOptional()
  flagged?: boolean;

  @ApiProperty({
    description: 'Feedback or notes for this text',
    example: 'Needs better translation',
    required: false,
  })
  @IsOptional()
  @IsString()
  feedback?: string;
}

// Translation data for a single image
export class ImageTranslationDto {
  @ApiProperty({
    description: 'Image filename',
    example: 'split_001.webp',
  })
  @IsString()
  @IsNotEmpty()
  image: string;

  @ApiProperty({
    description: 'Array of translated texts with bounding boxes',
    type: [TranslationTextDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TranslationTextDto)
  texts: TranslationTextDto[];
}

export class SaveTranslationDto {
  @ApiProperty({
    description: 'Array of translation data for each image',
    type: [ImageTranslationDto],
    example: [
      {
        image: 'split_001.webp',
        texts: [
          { box: [99, 734, 190, 117], text: 'ငါ တောင်းဆိုချက်တစ်ခု ရှိတယ်။' },
        ],
      },
    ],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImageTranslationDto)
  data: ImageTranslationDto[];
}

export class SubmitTranslationDto extends SaveTranslationDto {}

export class RejectChapterDto {
  @ApiProperty({
    description: 'Reason for rejection',
    example: 'Translation quality needs improvement',
    required: false,
  })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class UpdateChapterStatusDto {
  @ApiProperty({
    description: 'New chapter status',
    enum: ChapterStatus,
    example: ChapterStatus.IN_PROGRESS,
  })
  @IsEnum(ChapterStatus)
  status: ChapterStatus;
}

/** Body for cleaning-save: enJson is sent as JSON string in multipart form */
export class SaveCleaningDto {
  @ApiProperty({
    description:
      'Updated English OCR/text JSON (stringified). Same structure as en.json. Optional if only updating images.',
    required: false,
  })
  @IsOptional()
  @IsString()
  enJson?: string;
}

export class ListChaptersQueryDto {
  @ApiProperty({
    description: 'Page number (1-based)',
    example: 1,
    minimum: 1,
    required: true,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number;

  @ApiProperty({
    description: 'Number of items per page',
    example: 10,
    minimum: 1,
    maximum: 100,
    required: true,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit: number;

  @ApiProperty({
    description: 'Filter by chapter status',
    enum: ChapterStatus,
    required: false,
  })
  @IsOptional()
  @IsEnum(ChapterStatus)
  status?: ChapterStatus;

  @ApiProperty({
    description: 'Filter by manhwa UUID',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  manhwaId?: string;

  @ApiProperty({
    description: 'Filter chapters created after this date (ISO 8601)',
    example: '2025-01-01T00:00:00Z',
    required: false,
  })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiProperty({
    description: 'Filter chapters created before this date (ISO 8601)',
    example: '2025-12-31T23:59:59Z',
    required: false,
  })
  @IsOptional()
  @IsString()
  endDate?: string;
}
