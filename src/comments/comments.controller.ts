import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserRole } from '../common/enums/user-role.enum';
import { CommentsService } from './comments.service';
import {
  CreateCommentDto,
  ListCommentsQueryDto,
  UpdateCommentDto,
} from './model/comment.dto';

@ApiTags('comments')
@Controller('comments')
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a new comment',
    description: 'Creates a comment on a chapter. Authentication is optional.',
  })
  @ApiResponse({ status: 201, description: 'Comment created successfully' })
  @ApiResponse({ status: 404, description: 'Chapter not found' })
  async createComment(
    @Body() createDto: CreateCommentDto,
    @CurrentUser() user?: { id: string },
  ) {
    return this.commentsService.createComment(createDto, user?.id);
  }

  @Post('authenticated')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Create a comment as authenticated user',
    description: 'Creates a comment with user attribution',
  })
  @ApiResponse({ status: 201, description: 'Comment created successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Chapter not found' })
  async createAuthenticatedComment(
    @Body() createDto: CreateCommentDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.commentsService.createComment(createDto, user.id);
  }

  @Get('chapter/:chapterId')
  @ApiOperation({
    summary: 'Get comments for a chapter',
    description: 'Returns paginated comments for a specific chapter',
  })
  @ApiParam({ name: 'chapterId', description: 'Chapter UUID' })
  @ApiQuery({ name: 'page', required: true, type: Number })
  @ApiQuery({ name: 'limit', required: true, type: Number })
  @ApiResponse({ status: 200, description: 'List of comments' })
  async getChapterComments(
    @Param('chapterId') chapterId: string,
    @Query() query: ListCommentsQueryDto,
  ) {
    return this.commentsService.getCommentsByChapter(
      chapterId,
      query.page,
      query.limit,
    );
  }

  @Get(':id/replies')
  @ApiOperation({
    summary: 'Get replies to a comment',
    description: 'Returns paginated replies to a specific comment',
  })
  @ApiParam({ name: 'id', description: 'Parent comment UUID' })
  @ApiQuery({ name: 'page', required: true, type: Number })
  @ApiQuery({ name: 'limit', required: true, type: Number })
  @ApiResponse({ status: 200, description: 'List of replies' })
  async getReplies(
    @Param('id') id: string,
    @Query() query: ListCommentsQueryDto,
  ) {
    return this.commentsService.getReplies(id, query.page, query.limit);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a comment by ID' })
  @ApiParam({ name: 'id', description: 'Comment UUID' })
  @ApiResponse({ status: 200, description: 'Comment details' })
  @ApiResponse({ status: 404, description: 'Comment not found' })
  async getComment(@Param('id') id: string) {
    return this.commentsService.getCommentById(id);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Update a comment',
    description: 'Updates a comment. Only the author can edit.',
  })
  @ApiParam({ name: 'id', description: 'Comment UUID' })
  @ApiResponse({ status: 200, description: 'Comment updated successfully' })
  @ApiResponse({ status: 403, description: 'Not authorized to edit' })
  @ApiResponse({ status: 404, description: 'Comment not found' })
  async updateComment(
    @Param('id') id: string,
    @Body() updateDto: UpdateCommentDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.commentsService.updateComment(id, updateDto, user.id);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Delete a comment',
    description: 'Deletes a comment. Author or admin can delete.',
  })
  @ApiParam({ name: 'id', description: 'Comment UUID' })
  @ApiResponse({ status: 200, description: 'Comment deleted successfully' })
  @ApiResponse({ status: 403, description: 'Not authorized to delete' })
  @ApiResponse({ status: 404, description: 'Comment not found' })
  async deleteComment(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: UserRole },
  ) {
    await this.commentsService.deleteComment(
      id,
      user.id,
      user.role === UserRole.ADMIN,
    );
    return { success: true };
  }

  @Post(':id/like')
  @ApiOperation({ summary: 'Like a comment' })
  @ApiParam({ name: 'id', description: 'Comment UUID' })
  @ApiResponse({ status: 200, description: 'Comment liked' })
  async likeComment(@Param('id') id: string) {
    await this.commentsService.likeComment(id);
    return { success: true };
  }
}
