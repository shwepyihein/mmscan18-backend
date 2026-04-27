import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
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
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ManhwaService } from './manhwa.service';
import {
  CreateManhwaDto,
  MANHWA_GENRES,
  SetChapterLockDto,
  UpdateManhwaDto,
} from './model/manhwa.dto';

@ApiTags('manhwa')
@Controller('manhwa')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class ManhwaController {
  constructor(private readonly manhwaService: ManhwaService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'USER')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('coverImage'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Create a new manhwa (ADMIN only)',
    description:
      'Creates a new manhwa entry with cover image upload. Supports form-data with file upload.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['title'],
      properties: {
        title: {
          type: 'string',
          description: 'Manhwa title',
          example: 'Solo Leveling',
        },
        alternativeTitles: {
          type: 'string',
          description: 'Alternative titles',
          example: 'Na Honjaman Level Up, 나 혼자만 레벨업',
        },
        description: {
          type: 'string',
          description: 'Manhwa synopsis',
          example: 'A story about a hunter who becomes the strongest.',
        },
        coverImage: {
          type: 'string',
          format: 'binary',
          description: 'Cover image file',
        },
        author: {
          type: 'string',
          description: 'Author name',
          example: 'Chugong',
        },
        artist: {
          type: 'string',
          description: 'Artist name',
          example: 'Jang Sung-rak',
        },
        genres: {
          type: 'string',
          description: 'Genres (comma-separated)',
          example: 'action,fantasy,adventure',
        },
        releaseYear: {
          type: 'string',
          description: 'Release year',
          example: '2018',
        },
        originalLanguage: {
          type: 'string',
          description: 'Original language',
          example: 'Korean',
        },
        status: {
          type: 'string',
          enum: ['ONGOING', 'STOPPED', 'COMPLETE'],
          description: 'Manhwa status',
          example: 'ONGOING',
        },
        sourceUrl: {
          type: 'string',
          description: 'Source URL base for crawling (without chapter number)',
          example: 'https://manhuarmtl.com/manga/solo-leveling/',
        },
        sourceUrlPattern: {
          type: 'string',
          description: 'Custom URL pattern with {chapter} placeholder',
          example: 'https://other-site.com/read/{chapter}.html',
        },
        promptPath: {
          type: 'string',
          description: 'Prompt template file path (used by AI generation)',
          example: 'prompts/manhwa/prompt_en.md',
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Manhwa created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  async createManhwa(
    @Body() createManhwaDto: CreateManhwaDto,
    @UploadedFile() coverImage?: Express.Multer.File,
  ) {
    return this.manhwaService.create(createManhwaDto, coverImage);
  }

  @Get()
  @ApiOperation({
    summary: 'List all active manhwas',
    description: 'Returns a paginated list of all active manhwas',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)',
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page (default: 20, max: 100)',
    example: 20,
  })
  @ApiResponse({ status: 200, description: 'Paginated list of manhwas' })
  async getAllManhwas(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.manhwaService.findAll(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Get('genres')
  @ApiOperation({
    summary: 'Get all available genres',
    description:
      'Returns list of all predefined genres and genres currently in use',
  })
  @ApiResponse({
    status: 200,
    description: 'List of genres',
    schema: {
      type: 'object',
      properties: {
        predefined: {
          type: 'array',
          items: { type: 'string' },
          description: 'Predefined genre list',
        },
        inUse: {
          type: 'array',
          items: { type: 'string' },
          description: 'Genres currently in use',
        },
      },
    },
  })
  async getGenres() {
    const inUse = await this.manhwaService.getAllGenres();
    return {
      predefined: MANHWA_GENRES,
      inUse,
    };
  }

  @Get('by-genre')
  @ApiOperation({
    summary: 'Get manhwas by genre',
    description: 'Returns manhwas filtered by a specific genre',
  })
  @ApiQuery({
    name: 'genre',
    required: true,
    type: String,
    description: 'Genre to filter by',
    example: 'action',
  })
  @ApiResponse({ status: 200, description: 'List of manhwas' })
  async getManhwasByGenre(@Query('genre') genre: string) {
    return this.manhwaService.findByGenre(genre);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get manhwa by ID',
    description: 'Returns detailed information about a specific manhwa',
  })
  @ApiParam({ name: 'id', description: 'Manhwa UUID' })
  @ApiResponse({ status: 200, description: 'Manhwa details' })
  @ApiResponse({ status: 404, description: 'Manhwa not found' })
  async getManhwaById(@Param('id') id: string) {
    return this.manhwaService.findById(id);
  }

  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'USER')
  @UseInterceptors(FileInterceptor('coverImage'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Update manhwa',
    description:
      'Updates manhwa information with optional cover image upload. ADMIN and USER only.',
  })
  @ApiParam({ name: 'id', description: 'Manhwa UUID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Manhwa title',
        },
        slugUrl: {
          type: 'string',
          description:
            'URL slug (unique). If omitted and title changes, slug is regenerated from title.',
          example: 'solo-leveling',
        },
        titleMm: {
          type: 'string',
          description: 'Manhwa title in Myanmar',
          example: 'ဆိုလိုလက်ဗယ်လင်း',
        },
        descriptionMm: {
          type: 'string',
          description: 'Manhwa description/synopsis in Myanmar',
        },
        alternativeTitles: {
          type: 'string',
          description: 'Alternative titles',
        },
        description: {
          type: 'string',
          description: 'Manhwa synopsis',
        },
        coverImage: {
          type: 'string',
          format: 'binary',
          description: 'Cover image file',
        },
        author: {
          type: 'string',
          description: 'Author name',
        },
        artist: {
          type: 'string',
          description: 'Artist name',
        },
        genres: {
          type: 'string',
          description: 'Genres (comma-separated)',
        },
        releaseYear: {
          type: 'string',
          description: 'Release year',
        },
        originalLanguage: {
          type: 'string',
          description: 'Original language',
        },
        isActive: {
          type: 'boolean',
          description: 'Whether manhwa is active',
        },
        status: {
          type: 'string',
          enum: ['ONGOING', 'STOPPED', 'COMPLETE'],
          description: 'Manhwa status',
        },
        sourceUrl: {
          type: 'string',
          description: 'Source URL base for crawling (without chapter number)',
          example: 'https://manhuarmtl.com/manga/solo-leveling/',
        },
        sourceUrlPattern: {
          type: 'string',
          description: 'Custom URL pattern with {chapter} placeholder',
          example: 'https://other-site.com/read/{chapter}.html',
        },
        promptPath: {
          type: 'string',
          description: 'Prompt template file path (used by AI generation)',
          example: 'prompts/manhwa/prompt_en.md',
        },
        crawlEnabled: {
          type: 'boolean',
          description: 'Enable/disable crawling for this manhwa',
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Manhwa updated successfully' })
  @ApiResponse({ status: 404, description: 'Manhwa not found' })
  async updateManhwa(
    @Param('id') id: string,
    @Body() updateManhwaDto: UpdateManhwaDto,
    @UploadedFile() coverImage?: Express.Multer.File,
  ) {
    return this.manhwaService.update(id, updateManhwaDto, coverImage);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'USER')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete manhwa (ADMIN only)',
    description: 'Soft deletes a manhwa by setting isActive to false',
  })
  @ApiParam({ name: 'id', description: 'Manhwa UUID' })
  @ApiResponse({ status: 204, description: 'Manhwa deleted successfully' })
  @ApiResponse({ status: 404, description: 'Manhwa not found' })
  async deleteManhwa(@Param('id') id: string) {
    return this.manhwaService.delete(id);
  }

  @Put(':id/chapters/lock')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'USER')
  @ApiOperation({
    summary: 'Set lock/unlock for all chapters of a manhwa',
    description:
      'Updates isLocked for all chapters under the given manhwa based on body.isLocked.',
  })
  @ApiParam({ name: 'id', description: 'Manhwa UUID' })
  @ApiBody({ type: SetChapterLockDto })
  @ApiResponse({
    status: 200,
    description: 'All chapters updated',
  })
  setAllChaptersLock(
    @Param('id') manhwaId: string,
    @Body() body: SetChapterLockDto,
  ) {
    return this.manhwaService.setAllChaptersLock(manhwaId, body.isLocked);
  }

  @Put(':id/chapters/:chapterId/lock')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'USER')
  @ApiOperation({
    summary: 'Set lock/unlock for a single chapter',
    description:
      'Updates isLocked for one chapter under the given manhwa based on body.isLocked.',
  })
  @ApiParam({ name: 'id', description: 'Manhwa UUID' })
  @ApiParam({ name: 'chapterId', description: 'Chapter UUID' })
  @ApiBody({ type: SetChapterLockDto })
  @ApiResponse({
    status: 200,
    description: 'Chapter lock status updated',
  })
  setSingleChapterLock(
    @Param('id') manhwaId: string,
    @Param('chapterId') chapterId: string,
    @Body() body: SetChapterLockDto,
  ) {
    return this.manhwaService.setSingleChapterLock(
      manhwaId,
      chapterId,
      body.isLocked,
    );
  }
}
