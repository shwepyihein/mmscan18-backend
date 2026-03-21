import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateCoinRequestDto {
  @ApiProperty({ description: 'Amount of coins to buy', example: 100 })
  @IsInt()
  @Min(1)
  amount: number;

  @ApiPropertyOptional({ description: 'Path to payment proof image', example: 'proofs/abc.jpg' })
  @IsString()
  @IsOptional()
  proofImageUrl?: string;
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
