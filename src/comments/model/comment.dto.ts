import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateCommentDto {
  @ApiProperty({
    description: 'Chapter UUID to comment on',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  chapterId: string;

  @ApiProperty({
    description: 'Comment content',
    example: 'Great chapter! Thanks for the translation!',
    minLength: 1,
    maxLength: 1000,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  content: string;

  @ApiPropertyOptional({
    description: 'Guest name for anonymous comments',
    example: 'Anonymous Reader',
  })
  @IsString()
  @MaxLength(50)
  @IsOptional()
  guestName?: string;

  @ApiPropertyOptional({
    description: 'Parent comment UUID for replies',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  @IsOptional()
  parentId?: string;
}

export class UpdateCommentDto {
  @ApiProperty({
    description: 'Updated comment content',
    example: 'Edited: Great chapter!',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  content: string;
}

export class ListCommentsQueryDto {
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
    example: 20,
    minimum: 1,
    maximum: 100,
    required: true,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit: number;
}

export class CommentResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  chapterId: string;

  @ApiPropertyOptional()
  userId: string | null;

  @ApiPropertyOptional()
  guestName: string | null;

  @ApiProperty()
  content: string;

  @ApiProperty()
  likes: number;

  @ApiPropertyOptional()
  parentId: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiPropertyOptional({
    description: 'User details if authenticated',
  })
  user?: {
    id: string;
    username: string | null;
    name: string | null;
    avatarUrl: string | null;
  } | null;
}
