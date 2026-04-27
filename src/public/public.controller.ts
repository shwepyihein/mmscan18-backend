import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/user.decorator';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { WalletService } from '../wallet/wallet.service';
import { PublicService } from './public.service';

@ApiTags('public')
@Controller('public')
export class PublicController {
  constructor(
    private readonly publicService: PublicService,
    private readonly walletService: WalletService,
  ) {}

  // === MANHWA ===

  @Get('manhwa')
  @ApiOperation({
    summary: 'List all manhwa',
    description:
      'Public catalog: active manhwa with at least one PUBLISHED chapter. Each item includes `chapters`: up to 2 latest PUBLISHED chapters (for cards), each with effective `isLocked` (send Bearer token to resolve unlocks for the current user).',
  })
  @ApiQuery({ name: 'page', required: true, type: Number })
  @ApiQuery({ name: 'limit', required: true, type: Number })
  @ApiQuery({ name: 'genre', required: false, type: String })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    enum: ['latest', 'popular', 'rating'],
    description:
      '`latest` = by most recent PUBLISHED chapter `publishedAt` (default). `popular` = totalViews. `rating` = manhwa rating.',
  })
  @ApiResponse({ status: 200, description: 'List of manhwa' })
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  async listManhwa(
    @Query('page') page: number,
    @Query('limit') limit: number,
    @Query('genre') genre?: string,
    @Query('sortBy') sortBy?: 'latest' | 'popular' | 'rating',
    @CurrentUser() user?: { id?: string },
  ) {
    return this.publicService.listManhwa(
      +page,
      +limit,
      genre,
      sortBy,
      user?.id,
    );
  }

  @Get('manhwa/:id')
  @ApiOperation({
    summary: 'Get manhwa details',
    description:
      'Get details of a specific manhwa. Includes `chapters`: up to 2 latest PUBLISHED chapters. Each chapter has effective `isLocked` (when Bearer token is sent, unlocks are resolved for the current user).',
  })
  @ApiParam({ name: 'id', description: 'Manhwa UUID' })
  @ApiResponse({ status: 200, description: 'Manhwa details' })
  @ApiResponse({ status: 404, description: 'Manhwa not found' })
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  async getManhwa(
    @Param('id') id: string,
    @CurrentUser() user?: { id?: string },
  ) {
    return this.publicService.getManhwaById(id, user?.id);
  }

  @Get('manhwa/:manhwaId/chapters/:chapterNo')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get chapter for reading by number',
    description:
      'Get chapter content by manhwaId and chapterNo. Guarded endpoint: if chapter is locked and not unlocked by current user, returns 403 Locked.',
  })
  @ApiParam({ name: 'manhwaId', description: 'Manhwa UUID' })
  @ApiParam({ name: 'chapterNo', description: 'Chapter number' })
  @ApiResponse({
    status: 200,
    description: 'Chapter content with images and translation',
  })
  @ApiResponse({ status: 403, description: 'Chapter is locked' })
  @ApiResponse({ status: 404, description: 'Chapter not found' })
  async getChapterForReadingByNumber(
    @Param('manhwaId') manhwaId: string,
    @Param('chapterNo', ParseIntPipe) chapterNo: number,
    @CurrentUser() user?: { id?: string },
  ) {
    const userId = user?.id;
    const readingData = await this.publicService.getChapterForReadingByNumber(
      manhwaId,
      chapterNo,
    );

    const { chapter } = readingData;

    if (chapter.isLocked) {
      if (!userId) {
        throw new ForbiddenException('Locked');
      }

      const unlockStatus = await this.walletService.getChapterUnlockStatus(
        userId,
        chapter.id,
      );

      if (!unlockStatus.isUnlocked) {
        throw new ForbiddenException('Locked');
      }
    }

    return readingData;
  }

  @Get('manhwa/:id/chapters-list')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get full chapter list for a manhwa with unlock status',
  })
  @ApiParam({ name: 'id', description: 'Manhwa UUID' })
  async listChaptersForManhwa(
    @Param('id') manhwaId: string,
    @CurrentUser() user?: { id?: string },
  ) {
    const userId = user?.id;
    const chapters = await this.publicService.getChaptersByManhwaId(manhwaId);
    const unlockedChapterIds = userId
      ? await this.walletService.getUnlockedChapters(userId)
      : [];

    return chapters.map((chapter) => ({
      ...chapter,
      isLocked: chapter.isLocked
        ? !unlockedChapterIds.includes(chapter.id)
        : false,
    }));
  }

  @Get('manhwa/:id/chapters')
  @ApiOperation({
    summary: 'Get chapter range for a manhwa',
    description: 'Returns start and end chapter numbers (PUBLISHED only)',
  })
  @ApiParam({ name: 'id', description: 'Manhwa UUID' })
  @ApiResponse({
    status: 200,
    description: 'startChapterNo and endChapterNo',
  })
  async getChapterRange(@Param('id') id: string) {
    return this.publicService.getChapterRange(id);
  }

  // === DISCOVERY ===

  @Get('latest')
  @ApiOperation({
    summary: 'Get latest published chapters',
    description: 'Returns recently published chapters across all manhwa',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Number of chapters to return (default: 10)',
  })
  @ApiResponse({ status: 200, description: 'List of latest chapters' })
  async getLatestChapters(@Query('limit') limit?: number) {
    return this.publicService.getLatestChapters(limit ? +limit : 10);
  }

  @Get('popular')
  @ApiOperation({
    summary: 'Get popular chapters',
    description: 'Returns most viewed chapters',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Number of chapters to return (default: 10)',
  })
  @ApiResponse({ status: 200, description: 'List of popular chapters' })
  async getPopularChapters(@Query('limit') limit?: number) {
    return this.publicService.getPopularChapters(limit ? +limit : 10);
  }

  @Get('popular-manhwa')
  @ApiOperation({
    summary: 'Get popular manhwa',
    description: 'Returns most viewed manhwa',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Number of manhwa to return (default: 10)',
  })
  @ApiResponse({ status: 200, description: 'List of popular manhwa' })
  async getPopularManhwa(@Query('limit') limit?: number) {
    return this.publicService.getPopularManhwa(limit ? +limit : 10);
  }

  @Get('search')
  @ApiOperation({
    summary: 'Search manhwa',
    description: 'Search manhwa by title, author, or description',
  })
  @ApiQuery({
    name: 'q',
    required: true,
    type: String,
    description: 'Search query',
  })
  @ApiQuery({ name: 'page', required: true, type: Number })
  @ApiQuery({ name: 'limit', required: true, type: Number })
  @ApiResponse({ status: 200, description: 'Search results' })
  async searchManhwa(
    @Query('q') query: string,
    @Query('page') page: number,
    @Query('limit') limit: number,
  ) {
    return this.publicService.searchManhwa(query, +page, +limit);
  }
}
