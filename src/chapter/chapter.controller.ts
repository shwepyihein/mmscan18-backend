import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../common/enums/user-role.enum';
import { ChapterDetailResponse, ChapterService } from './chapter.service';
import {
  CreateChapterCrawlDto,
  ListChaptersQueryDto,
  RejectChapterDto,
  SaveCleaningDto,
  SaveTranslationDto,
  SubmitTranslationDto,
  UpdateChapterStatusDto,
} from './model/chapter.dto';
import { ChapterStatus } from './model/chapter.enum';

@ApiTags('chapters')
@Controller('chapters')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class ChapterController {
  constructor(private readonly chapterService: ChapterService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'USER')
  @ApiOperation({
    summary: 'Create and crawl a new chapter (ADMIN/USER only)',
    description:
      'Creates a new chapter record and triggers the crawler to download images and OCR data from the source URL',
  })
  @ApiResponse({
    status: 201,
    description: 'Chapter created and crawled successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Chapter already exists or invalid input',
  })
  async createChapter(@Body() createDto: CreateChapterCrawlDto) {
    return this.chapterService.createChapter(createDto);
  }

  @Post(':id/start-cleaning')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'USER')
  @ApiOperation({
    summary: 'Start cleaning (inpainting)',
    description:
      'Sets chapter status to CLEANING. Only allowed when chapter is RAW. Use before or as part of image text-removal workflow.',
  })
  @ApiParam({ name: 'id', description: 'Chapter UUID' })
  @ApiResponse({
    status: 200,
    description: 'Cleaning started successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Chapter must be in RAW status',
  })
  @ApiResponse({ status: 404, description: 'Chapter not found' })
  async startCleaning(@Param('id') id: string) {
    return this.chapterService.startCleaning(id);
  }

  @Post(':id/cleaning-save')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'USER')
  @UseInterceptors(FileFieldsInterceptor([{ name: 'images', maxCount: 500 }]))
  @ApiOperation({
    summary: 'Save cleaning result (en.json + images)',
    description:
      'Upload updated en.json and/or cleaned images for a chapter in CLEANING status. Each image is uploaded by its filename and replaces the existing image with the same name in S3 (no new files created). Send enJson as form field (JSON string) and/or images as multiple files with originalname = existing S3 filename (e.g. split_001.webp).',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        enJson: {
          type: 'string',
          description:
            'Updated English OCR/text JSON as string. Same structure as en.json. Optional if only updating images.',
        },
        images: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
          description:
            'Cleaned images. Each file’s name (originalname) must match the existing image name in the chapter (e.g. split_001.webp). Replaces that file in S3.',
        },
      },
    },
  })
  @ApiParam({ name: 'id', description: 'Chapter UUID' })
  @ApiResponse({ status: 200, description: 'Cleaning saved; chapter returned' })
  @ApiResponse({
    status: 400,
    description:
      'Chapter not in CLEANING, or invalid enJson, or neither enJson nor images provided',
  })
  @ApiResponse({ status: 404, description: 'Chapter not found' })
  async saveCleaning(
    @Param('id') id: string,
    @Body() body: SaveCleaningDto,
    @UploadedFiles() files: { images?: Express.Multer.File[] },
  ) {
    let enJsonObj: object | undefined;
    if (body.enJson?.trim()) {
      try {
        enJsonObj = JSON.parse(body.enJson) as object;
      } catch {
        throw new BadRequestException(
          'enJson must be a valid JSON string when provided.',
        );
      }
    }
    const imageFiles = files?.images ?? [];
    return this.chapterService.saveCleaning(id, enJsonObj, imageFiles);
  }

  @Post(':id/start')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'USER')
  @ApiOperation({
    summary: 'Start working on translation',
    description:
      'Auto-assigns the user and sets chapter to IN_PROGRESS. Both ADMIN and USER can translate.',
  })
  @ApiParam({ name: 'id', description: 'Chapter UUID' })
  @ApiResponse({
    status: 200,
    description: 'Translation started successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Chapter must be in RAW status',
  })
  @ApiResponse({ status: 404, description: 'Chapter not found' })
  async startTranslation(
    @Param('id') id: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.chapterService.startTranslation(id, user.id);
  }

  @Post(':id/save')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'USER')
  @ApiOperation({
    summary: 'Save translation draft',
    description:
      'Saves translation data to S3 without changing status. Use for auto-save or draft functionality.',
  })
  @ApiParam({ name: 'id', description: 'Chapter UUID' })
  @ApiResponse({
    status: 200,
    description: 'Translation saved successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Chapter must be in IN_PROGRESS status',
  })
  @ApiResponse({ status: 404, description: 'Chapter not found' })
  async saveTranslation(
    @Param('id') id: string,
    @Body() saveDto: SaveTranslationDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.chapterService.saveTranslation(id, user.id, saveDto);
  }

  @Post(':id/submit')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'USER')
  @ApiOperation({
    summary: 'Submit translation for review',
    description:
      'Uploads translation data to S3 and changes status to IN_REVIEW. Admin will then approve or reject.',
  })
  @ApiParam({ name: 'id', description: 'Chapter UUID' })
  @ApiResponse({
    status: 200,
    description: 'Translation submitted for review',
  })
  @ApiResponse({
    status: 400,
    description: 'Chapter must be in IN_PROGRESS status',
  })
  @ApiResponse({ status: 404, description: 'Chapter not found' })
  async submitTranslation(
    @Param('id') id: string,
    @Body() submitDto: SubmitTranslationDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.chapterService.submitTranslation(id, user.id, submitDto);
  }

  @Post(':id/approve')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'USER')
  @ApiOperation({
    summary: 'Approve a submitted chapter (ADMIN/USER only)',
    description:
      'Changes chapter status from IN_REVIEW to TRANSLATED, updates contributor stats, and awards points.',
  })
  @ApiParam({ name: 'id', description: 'Chapter UUID' })
  @ApiQuery({
    name: 'quality',
    required: false,
    type: Boolean,
    description:
      'Set to true if approved without revisions (awards quality bonus points)',
  })
  @ApiResponse({
    status: 200,
    description: 'Chapter approved and published',
  })
  @ApiResponse({
    status: 400,
    description: 'Chapter must be in IN_REVIEW status',
  })
  @ApiResponse({ status: 404, description: 'Chapter not found' })
  async approveChapter(
    @Param('id') id: string,
    @Query('quality') quality?: boolean,
  ) {
    return this.chapterService.approveChapter(id, quality === true);
  }

  @Post(':id/reject')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'USER')
  @ApiOperation({
    summary: 'Reject a submitted chapter (ADMIN/USER only)',
    description:
      'Changes chapter status from IN_REVIEW back to RAW. User will need to redo translation.',
  })
  @ApiParam({ name: 'id', description: 'Chapter UUID' })
  @ApiResponse({
    status: 200,
    description: 'Chapter rejected and reverted to RAW',
  })
  @ApiResponse({
    status: 400,
    description: 'Chapter must be in IN_REVIEW status',
  })
  @ApiResponse({ status: 404, description: 'Chapter not found' })
  async rejectChapter(
    @Param('id') id: string,
    @Body() rejectDto: RejectChapterDto,
  ) {
    void rejectDto;
    return this.chapterService.rejectChapter(id);
  }

  @Post(':id/revert-to-raw')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'USER')
  @ApiOperation({
    summary: 'Revert chapter to RAW status (ADMIN/USER only)',
    description:
      'Reverts a chapter back to RAW status and removes user assignment',
  })
  @ApiParam({ name: 'id', description: 'Chapter UUID' })
  @ApiResponse({
    status: 200,
    description: 'Chapter reverted to RAW successfully',
  })
  @ApiResponse({ status: 404, description: 'Chapter not found' })
  async revertToRaw(@Param('id') id: string) {
    return this.chapterService.revertToRaw(id);
  }

  @Post(':id/publish')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'USER')
  @ApiOperation({
    summary: 'Publish chapter (ADMIN/USER only)',
    description:
      'Changes chapter status from TRANSLATED to PUBLISHED and sets publishedAt timestamp if missing.',
  })
  @ApiParam({ name: 'id', description: 'Chapter UUID' })
  @ApiResponse({
    status: 200,
    description: 'Chapter published successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Chapter must be in TRANSLATED status',
  })
  @ApiResponse({ status: 404, description: 'Chapter not found' })
  async publishChapter(@Param('id') id: string) {
    return this.chapterService.publishChapter(id);
  }

  @Put(':id/status')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'USER')
  @ApiOperation({
    summary: 'Update chapter status (ADMIN/USER only)',
    description:
      'Manually update chapter status. Validates status transitions.',
  })
  @ApiParam({ name: 'id', description: 'Chapter UUID' })
  @ApiResponse({
    status: 200,
    description: 'Chapter status updated successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid status transition',
  })
  @ApiResponse({ status: 404, description: 'Chapter not found' })
  async updateChapterStatus(
    @Param('id') id: string,
    @Body() updateDto: UpdateChapterStatusDto,
  ) {
    return this.chapterService.updateChapterStatus(id, updateDto.status);
  }

  @Get()
  @UseGuards(RolesGuard)
  @ApiOperation({
    summary: 'List chapters with filters and pagination',
    description:
      'Returns paginated list of chapters. USER can only see their assigned chapters. ADMIN can see all chapters.',
  })
  @ApiQuery({
    name: 'page',
    required: true,
    type: Number,
    description: 'Page number (required)',
  })
  @ApiQuery({
    name: 'limit',
    required: true,
    type: Number,
    description: 'Items per page (required, max: 100)',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ChapterStatus,
    description: 'Filter by chapter status',
  })
  @ApiQuery({
    name: 'manhwaId',
    required: false,
    type: String,
    description: 'Filter by manhwa UUID',
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    type: String,
    description: 'Filter chapters created after this date (ISO 8601)',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    type: String,
    description: 'Filter chapters created before this date (ISO 8601)',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of chapters',
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: { type: 'object' },
        },
        total: { type: 'number', example: 100 },
        page: { type: 'number', example: 1 },
        limit: { type: 'number', example: 10 },
        totalPages: { type: 'number', example: 10 },
      },
    },
  })
  async listChapters(
    @Query() query: ListChaptersQueryDto,
    @CurrentUser() user: { id: string; role: UserRole },
  ) {
    return this.chapterService.listChapters(user.id, user.role, {
      page: query.page,
      limit: query.limit,
      status: query.status,
      manhwaId: query.manhwaId,
      startDate: query.startDate,
      endDate: query.endDate,
    });
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get chapter by ID',
    description:
      'Returns chapter details including en.json content and image paths from S3',
  })
  @ApiParam({ name: 'id', description: 'Chapter UUID' })
  @ApiResponse({
    status: 200,
    description: 'Chapter details with en.json and image paths',
  })
  @ApiResponse({ status: 404, description: 'Chapter not found' })
  async getChapterById(
    @Param('id') id: string,
  ): Promise<ChapterDetailResponse> {
    return this.chapterService.getChapterById(id);
  }

  @Post(':id/like')
  @ApiOperation({ summary: 'Like a chapter' })
  @ApiParam({ name: 'id', description: 'Chapter UUID' })
  @ApiResponse({ status: 200, description: 'Chapter liked' })
  async likeChapter(@Param('id') id: string) {
    await this.chapterService.likeChapter(id);
    return { success: true };
  }

  @Post(':id/unlike')
  @ApiOperation({ summary: 'Unlike a chapter' })
  @ApiParam({ name: 'id', description: 'Chapter UUID' })
  @ApiResponse({ status: 200, description: 'Chapter unliked' })
  async unlikeChapter(@Param('id') id: string) {
    await this.chapterService.unlikeChapter(id);
    return { success: true };
  }
}
