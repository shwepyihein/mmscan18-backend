import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Min,
} from 'class-validator';

export class CreateCoinRequestDto {
  @ApiProperty({ description: 'Amount of coins to buy', example: 100 })
  @IsInt()
  @Min(1)
  amount: number;

  @ApiPropertyOptional({
    description: 'Path to payment proof image',
    example: 'proofs/abc.jpg',
  })
  @IsString()
  @IsOptional()
  proofImageUrl?: string;
}

export class CreatePackageCoinRequestDto {
  @ApiProperty({ description: 'Catalog coin package id', format: 'uuid' })
  @IsUUID()
  coinPackageId: string;

  @ApiProperty({
    example: 'USD',
    description: 'ISO 4217 currency code (must match package)',
  })
  @IsString()
  @Length(3, 3)
  @Transform(({ value }: { value: unknown }): string => {
    if (typeof value === 'string') {
      return value.trim().toUpperCase();
    }
    if (
      typeof value === 'number' ||
      typeof value === 'bigint' ||
      typeof value === 'boolean'
    ) {
      return String(value);
    }
    return '';
  })
  currency: string;

  @ApiProperty({
    example: '4.99',
    description:
      'Price in major units (must match package price for this currency)',
  })
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message: 'priceAmount must be a decimal with at most 2 fractional digits',
  })
  priceAmount: string;
}

export class ApproveCoinRequestDto {
  @ApiPropertyOptional({ description: 'Admin note for approval/rejection' })
  @IsString()
  @IsOptional()
  adminNote?: string;
}

export class UnlockChapterDto {
  @ApiProperty({ description: 'Chapter UUID to unlock' })
  @IsUUID()
  @IsNotEmpty()
  chapterId: string;
}

export class WalletStatusResponse {
  @ApiProperty({ example: 100 })
  coinBalance: number;

  @ApiProperty({ description: 'Number of pending coin requests', example: 1 })
  pendingRequestsCount: number;
}
