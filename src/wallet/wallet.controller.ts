import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../common/enums/user-role.enum';
import {
  ApproveCoinRequestDto,
  CreateCoinRequestDto,
  CreatePackageCoinRequestDto,
  UnlockChapterDto,
  WalletStatusResponse,
} from './dto/wallet.dto';
import { ChapterUnlock } from './model/chapter-unlock.entity';
import { CoinRequest } from './model/coin-request.entity';
import { WalletService } from './wallet.service';

@ApiTags('wallet')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get('status')
  @ApiOperation({
    summary: 'Get current user wallet status (balance, pending requests)',
  })
  getWalletStatus(
    @CurrentUser('id') userId: string,
  ): Promise<WalletStatusResponse> {
    return this.walletService.getWalletStatus(userId);
  }

  @Post('request')
  @ApiOperation({
    summary: 'Create a new request to buy coins (manual payment)',
  })
  createCoinRequest(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateCoinRequestDto,
  ): Promise<CoinRequest> {
    return this.walletService.createCoinRequest(userId, dto);
  }

  @Post('purchase-request')
  @UseInterceptors(FileInterceptor('invoice'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Create a coin purchase request from a catalog package (upload payment invoice)',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['invoice', 'coinPackageId', 'currency', 'priceAmount'],
      properties: {
        invoice: {
          type: 'string',
          format: 'binary',
          description: 'Payment proof image (jpg, png, webp, gif). Max 5MB.',
        },
        coinPackageId: { type: 'string', format: 'uuid' },
        currency: {
          type: 'string',
          example: 'USD',
          description: 'ISO 4217 (must match package)',
        },
        priceAmount: {
          type: 'string',
          example: '4.99',
          description: 'Must match package price for this currency',
        },
      },
    },
  })
  createPurchaseRequest(
    @CurrentUser('id') userId: string,
    @Body() dto: CreatePackageCoinRequestDto,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<CoinRequest> {
    return this.walletService.createPurchaseRequest(userId, dto, file);
  }

  @Get('my-requests')
  @ApiOperation({ summary: 'Get history of coin requests for current user' })
  getMyRequests(@CurrentUser('id') userId: string): Promise<CoinRequest[]> {
    return this.walletService.getMyRequests(userId);
  }

  @Post('unlock')
  @ApiOperation({ summary: 'Unlock a chapter using coins' })
  unlockChapter(
    @CurrentUser('id') userId: string,
    @Body() dto: UnlockChapterDto,
  ): Promise<ChapterUnlock> {
    return this.walletService.unlockChapter(userId, dto);
  }

  @Get('unlocked-chapters')
  @ApiOperation({ summary: 'Get list of chapter IDs unlocked by current user' })
  getUnlockedChapters(@CurrentUser('id') userId: string): Promise<string[]> {
    return this.walletService.getUnlockedChapters(userId);
  }

  // Admin Endpoints

  @Get('admin/pending-requests')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin: Get all pending coin requests' })
  getAllPendingRequests(): Promise<CoinRequest[]> {
    return this.walletService.getAllPendingRequests();
  }

  @Patch('admin/requests/:id/approve')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin: Approve a coin request' })
  approveRequest(
    @Param('id') requestId: string,
    @Body() dto: ApproveCoinRequestDto,
  ): Promise<CoinRequest> {
    return this.walletService.approveRequest(requestId, dto);
  }

  @Patch('admin/requests/:id/reject')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin: Reject a coin request' })
  rejectRequest(
    @Param('id') requestId: string,
    @Body() dto: ApproveCoinRequestDto,
  ): Promise<CoinRequest> {
    return this.walletService.rejectRequest(requestId, dto);
  }
}
