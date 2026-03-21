import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
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
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CrawlService } from './crawl.service';
import {
  CrawlAllDto,
  CrawlBatchResponse,
  CrawlNextChapterDto,
  CrawlOcrOnlyDto,
  CrawlOcrOnlyResponse,
  CrawlRangeDto,
  CrawlSpecificChapterDto,
  CrawlTaskResponse,
  ManhwaCrawlStatus,
  ReCrawlDto,
  ReCrawlResponse,
} from './model/crawl.dto';

@ApiTags('Crawl')
@ApiBearerAuth()
@Controller('crawl')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'USER')
export class CrawlController {
  constructor(private readonly crawlService: CrawlService) {}

  // ============================================
  // STATIC ROUTES FIRST (before dynamic params)
  // ============================================

  @Post('all')
  @ApiOperation({ summary: 'Crawl latest chapter for all active manhwas' })
  @ApiResponse({
    status: 201,
    description: 'Crawl started for all manhwas',
    type: CrawlBatchResponse,
  })
  async crawlAllManhwas(@Body() dto: CrawlAllDto): Promise<CrawlBatchResponse> {
    return this.crawlService.crawlAllManhwas(dto);
  }

  // ============================================
  // QUEUE MANAGEMENT (Redis)
  // ============================================

  @Get('queue/status')
  @ApiOperation({ summary: 'Get Redis queue status and statistics' })
  @ApiResponse({
    status: 200,
    description: 'Queue status',
  })
  async getQueueStatus() {
    return this.crawlService.getQueueStatus();
  }

  @Post('queue/pause')
  @ApiOperation({ summary: 'Pause the crawl queue' })
  @Roles('ADMIN')
  @ApiResponse({
    status: 200,
    description: 'Queue paused',
  })
  async pauseQueue() {
    await this.crawlService.pauseQueue();
    return { message: 'Queue paused successfully' };
  }

  @Post('queue/resume')
  @ApiOperation({ summary: 'Resume the crawl queue' })
  @Roles('ADMIN')
  @ApiResponse({
    status: 200,
    description: 'Queue resumed',
  })
  async resumeQueue() {
    await this.crawlService.resumeQueue();
    return { message: 'Queue resumed successfully' };
  }

  @Post('queue/clean')
  @ApiOperation({ summary: 'Clean old completed/failed jobs from queue' })
  @Roles('ADMIN')
  @ApiResponse({
    status: 200,
    description: 'Queue cleaned',
  })
  async cleanQueue() {
    return this.crawlService.cleanQueue();
  }

  @Post('queue/empty')
  @ApiOperation({ summary: 'Empty the entire queue (remove all jobs)' })
  @Roles('ADMIN')
  @ApiResponse({
    status: 200,
    description: 'Queue emptied',
  })
  async emptyQueue() {
    return this.crawlService.emptyQueue();
  }

  // ============================================
  // BATCH MANAGEMENT
  // ============================================

  @Get('batches')
  @ApiOperation({ summary: 'List all crawl batches' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: 'List of crawl batches',
  })
  async listBatches(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ) {
    return this.crawlService.listBatches(+page, +limit);
  }

  @Get('batches/:batchId')
  @ApiOperation({ summary: 'Get batch details with tasks' })
  @ApiParam({ name: 'batchId', description: 'Batch UUID' })
  @ApiResponse({
    status: 200,
    description: 'Batch details with tasks',
    type: CrawlBatchResponse,
  })
  async getBatchDetails(
    @Param('batchId', ParseUUIDPipe) batchId: string,
  ): Promise<CrawlBatchResponse> {
    return this.crawlService.getBatchResponse(batchId);
  }

  @Delete('batches/:batchId')
  @ApiOperation({ summary: 'Cancel a batch' })
  @ApiParam({ name: 'batchId', description: 'Batch UUID' })
  @ApiResponse({
    status: 200,
    description: 'Batch cancelled',
    type: CrawlBatchResponse,
  })
  async cancelBatch(
    @Param('batchId', ParseUUIDPipe) batchId: string,
  ): Promise<CrawlBatchResponse> {
    return this.crawlService.cancelBatch(batchId);
  }

  // ============================================
  // TASK MANAGEMENT
  // ============================================

  @Get('tasks/:taskId')
  @ApiOperation({ summary: 'Get task status' })
  @ApiParam({ name: 'taskId', description: 'Task UUID' })
  @ApiResponse({
    status: 200,
    description: 'Task status',
    type: CrawlTaskResponse,
  })
  async getTaskStatus(
    @Param('taskId', ParseUUIDPipe) taskId: string,
  ): Promise<CrawlTaskResponse> {
    return this.crawlService.getTaskStatus(taskId);
  }

  @Post('tasks/:taskId/retry')
  @ApiOperation({ summary: 'Retry a failed task' })
  @ApiParam({ name: 'taskId', description: 'Task UUID' })
  @ApiResponse({
    status: 200,
    description: 'Task retry started',
    type: CrawlTaskResponse,
  })
  async retryTask(
    @Param('taskId', ParseUUIDPipe) taskId: string,
  ): Promise<CrawlTaskResponse> {
    return this.crawlService.retryTask(taskId);
  }

  // ============================================
  // MANHWA CRAWL STATUS
  // ============================================

  @Get('status')
  @ApiOperation({ summary: 'Get crawl status for all manhwas' })
  @ApiResponse({
    status: 200,
    description: 'Crawl status for all manhwas',
    type: [ManhwaCrawlStatus],
  })
  async getAllManhwaCrawlStatus(): Promise<ManhwaCrawlStatus[]> {
    return this.crawlService.getManhwaCrawlStatuses();
  }

  @Get('status/:manhwaId')
  @ApiOperation({ summary: 'Get crawl status for a specific manhwa' })
  @ApiParam({ name: 'manhwaId', description: 'Manhwa UUID' })
  @ApiResponse({
    status: 200,
    description: 'Crawl status for manhwa',
    type: ManhwaCrawlStatus,
  })
  async getManhwaCrawlStatus(
    @Param('manhwaId', ParseUUIDPipe) manhwaId: string,
  ): Promise<ManhwaCrawlStatus> {
    return this.crawlService.getManhwaCrawlStatus(manhwaId);
  }

  // ============================================
  // CRAWL ACTIONS (specific paths before dynamic)
  // ============================================

  @Post('next/:manhwaId')
  @ApiOperation({ summary: 'Crawl next chapter for a manhwa' })
  @ApiParam({ name: 'manhwaId', description: 'Manhwa UUID' })
  @ApiResponse({
    status: 201,
    description: 'Crawl started',
    type: CrawlBatchResponse,
  })
  async crawlNextChapter(
    @Param('manhwaId', ParseUUIDPipe) manhwaId: string,
    @Body() dto: CrawlNextChapterDto,
  ): Promise<CrawlBatchResponse> {
    return this.crawlService.crawlNextChapter(manhwaId, dto);
  }

  @Post('range/:manhwaId')
  @ApiOperation({ summary: 'Crawl a range of chapters for a manhwa' })
  @ApiParam({ name: 'manhwaId', description: 'Manhwa UUID' })
  @ApiResponse({
    status: 201,
    description: 'Crawl started',
    type: CrawlBatchResponse,
  })
  async crawlChapterRange(
    @Param('manhwaId', ParseUUIDPipe) manhwaId: string,
    @Body() dto: CrawlRangeDto,
  ): Promise<CrawlBatchResponse> {
    return this.crawlService.crawlChapterRange(manhwaId, dto);
  }

  // ============================================
  // OCR-ONLY CRAWL (for missing en.json)
  // ============================================

  @Post('ocr/:manhwaId/:chapterNo')
  @ApiOperation({
    summary: 'Crawl OCR data only for an existing chapter (en.json)',
  })
  @ApiParam({ name: 'manhwaId', description: 'Manhwa UUID' })
  @ApiParam({ name: 'chapterNo', description: 'Chapter number' })
  @ApiResponse({
    status: 201,
    description: 'OCR crawl completed',
    type: CrawlOcrOnlyResponse,
  })
  async crawlOcrOnly(
    @Param('manhwaId', ParseUUIDPipe) manhwaId: string,
    @Param('chapterNo', ParseIntPipe) chapterNo: number,
    @Body() dto: CrawlOcrOnlyDto,
  ): Promise<CrawlOcrOnlyResponse> {
    return this.crawlService.crawlOcrOnly(manhwaId, chapterNo, dto);
  }

  @Post('ocr-range/:manhwaId')
  @ApiOperation({
    summary: 'Crawl OCR data for a range of existing chapters',
  })
  @ApiParam({ name: 'manhwaId', description: 'Manhwa UUID' })
  @ApiResponse({
    status: 201,
    description: 'OCR crawl results for range',
    type: [CrawlOcrOnlyResponse],
  })
  async crawlOcrRange(
    @Param('manhwaId', ParseUUIDPipe) manhwaId: string,
    @Body() dto: CrawlRangeDto,
  ): Promise<CrawlOcrOnlyResponse[]> {
    return this.crawlService.crawlOcrRange(
      manhwaId,
      dto.fromChapter,
      dto.toChapter,
      dto.sourceUrl,
    );
  }

  // ============================================
  // RE-CRAWL (by chapter ID)
  // ============================================

  @Post('recrawl/:chapterId')
  @ApiOperation({
    summary: 'Re-crawl entire chapter (delete old images + re-download all)',
    description:
      'Deletes existing images from S3 and re-crawls everything including images and JSON files. Use this when images need to be replaced.',
  })
  @ApiParam({ name: 'chapterId', description: 'Chapter UUID' })
  @ApiResponse({
    status: 201,
    description: 'Full re-crawl completed',
    type: ReCrawlResponse,
  })
  async reCrawlFull(
    @Param('chapterId', ParseUUIDPipe) chapterId: string,
    @Body() dto: ReCrawlDto,
  ): Promise<ReCrawlResponse> {
    return this.crawlService.reCrawlFull(chapterId, dto);
  }

  @Post('recrawl/:chapterId/json-only')
  @ApiOperation({
    summary: 'Re-crawl only JSON files (en.json, mm.json)',
    description:
      'Only re-crawls OCR data and updates JSON files without touching images. Use this when only OCR data needs to be refreshed.',
  })
  @ApiParam({ name: 'chapterId', description: 'Chapter UUID' })
  @ApiResponse({
    status: 201,
    description: 'JSON-only re-crawl completed',
    type: ReCrawlResponse,
  })
  async reCrawlJsonOnly(
    @Param('chapterId', ParseUUIDPipe) chapterId: string,
    @Body() dto: ReCrawlDto,
  ): Promise<ReCrawlResponse> {
    return this.crawlService.reCrawlJsonOnly(chapterId, dto);
  }

  // ============================================
  // DYNAMIC ROUTES LAST (catch-all pattern)
  // ============================================

  @Post(':manhwaId/:chapterNo')
  @ApiOperation({ summary: 'Crawl a specific chapter for a manhwa' })
  @ApiParam({ name: 'manhwaId', description: 'Manhwa UUID' })
  @ApiParam({ name: 'chapterNo', description: 'Chapter number to crawl' })
  @ApiResponse({
    status: 201,
    description: 'Crawl started',
    type: CrawlBatchResponse,
  })
  async crawlSpecificChapter(
    @Param('manhwaId', ParseUUIDPipe) manhwaId: string,
    @Param('chapterNo', ParseIntPipe) chapterNo: number,
    @Body() dto: CrawlSpecificChapterDto,
  ): Promise<CrawlBatchResponse> {
    return this.crawlService.crawlSpecificChapter(manhwaId, chapterNo, dto);
  }
}
