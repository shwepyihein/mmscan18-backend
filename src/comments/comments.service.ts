import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Chapter } from '../chapter/model/chapter.entity';
import {
  createPaginatedResponse,
  PaginatedResponse,
} from '../common/interfaces/pagination.interface';
import {
  CommentResponseDto,
  CreateCommentDto,
  UpdateCommentDto,
} from './model/comment.dto';
import { Comment } from './model/comment.entity';

@Injectable()
export class CommentsService {
  constructor(
    @InjectRepository(Comment)
    private readonly commentRepository: Repository<Comment>,
    @InjectRepository(Chapter)
    private readonly chapterRepository: Repository<Chapter>,
  ) {}

  async createComment(
    createDto: CreateCommentDto,
    userId?: string,
  ): Promise<CommentResponseDto> {
    // Verify chapter exists
    const chapter = await this.chapterRepository.findOne({
      where: { id: createDto.chapterId },
    });

    if (!chapter) {
      throw new NotFoundException(
        `Chapter with ID ${createDto.chapterId} not found`,
      );
    }

    // Create comment
    const comment = this.commentRepository.create({
      chapterId: createDto.chapterId,
      userId: userId || null,
      guestName: userId ? null : createDto.guestName || 'Anonymous',
      content: createDto.content,
      parentId: createDto.parentId || null,
    });

    const savedComment = await this.commentRepository.save(comment);

    // Update chapter comment count
    await this.chapterRepository.increment(
      { id: createDto.chapterId },
      'commentCount',
      1,
    );

    // Reload with user relation
    return this.getCommentById(savedComment.id);
  }

  async getCommentById(commentId: string): Promise<CommentResponseDto> {
    const comment = await this.commentRepository.findOne({
      where: { id: commentId, isVisible: true },
      relations: ['user'],
    });

    if (!comment) {
      throw new NotFoundException(`Comment with ID ${commentId} not found`);
    }

    return this.toResponseDto(comment);
  }

  async getCommentsByChapter(
    chapterId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedResponse<CommentResponseDto>> {
    const skip = (page - 1) * limit;

    const [comments, total] = await this.commentRepository.findAndCount({
      where: { chapterId, isVisible: true, parentId: IsNull() },
      relations: ['user'],
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    const data = comments.map((c) => this.toResponseDto(c));
    return createPaginatedResponse(data, total, page, limit);
  }

  async getReplies(
    parentId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedResponse<CommentResponseDto>> {
    const skip = (page - 1) * limit;

    const [replies, total] = await this.commentRepository.findAndCount({
      where: { parentId, isVisible: true },
      relations: ['user'],
      order: { createdAt: 'ASC' },
      skip,
      take: limit,
    });

    const data = replies.map((c) => this.toResponseDto(c));
    return createPaginatedResponse(data, total, page, limit);
  }

  async updateComment(
    commentId: string,
    updateDto: UpdateCommentDto,
    userId: string,
  ): Promise<CommentResponseDto> {
    const comment = await this.commentRepository.findOne({
      where: { id: commentId },
    });

    if (!comment) {
      throw new NotFoundException(`Comment with ID ${commentId} not found`);
    }

    // Only the author can edit their comment
    if (comment.userId !== userId) {
      throw new ForbiddenException('You can only edit your own comments');
    }

    comment.content = updateDto.content;
    await this.commentRepository.save(comment);

    return this.getCommentById(commentId);
  }

  async deleteComment(
    commentId: string,
    userId: string,
    isAdmin: boolean,
  ): Promise<void> {
    const comment = await this.commentRepository.findOne({
      where: { id: commentId },
    });

    if (!comment) {
      throw new NotFoundException(`Comment with ID ${commentId} not found`);
    }

    // Only the author or admin can delete
    if (!isAdmin && comment.userId !== userId) {
      throw new ForbiddenException('You can only delete your own comments');
    }

    // Soft delete by setting isVisible to false
    comment.isVisible = false;
    await this.commentRepository.save(comment);

    // Decrement chapter comment count
    const chapter = await this.chapterRepository.findOne({
      where: { id: comment.chapterId },
    });
    if (chapter && chapter.commentCount > 0) {
      await this.chapterRepository.decrement(
        { id: comment.chapterId },
        'commentCount',
        1,
      );
    }
  }

  async likeComment(commentId: string): Promise<void> {
    const comment = await this.commentRepository.findOne({
      where: { id: commentId, isVisible: true },
    });

    if (!comment) {
      throw new NotFoundException(`Comment with ID ${commentId} not found`);
    }

    await this.commentRepository.increment({ id: commentId }, 'likes', 1);
  }

  private toResponseDto(comment: Comment): CommentResponseDto {
    return {
      id: comment.id,
      chapterId: comment.chapterId,
      userId: comment.userId,
      guestName: comment.guestName,
      content: comment.content,
      likes: comment.likes,
      parentId: comment.parentId,
      createdAt: comment.createdAt,
      user: comment.user
        ? {
            id: comment.user.id,
            username: comment.user.username,
            name: comment.user.name,
            avatarUrl: comment.user.avatarUrl,
          }
        : null,
    };
  }
}
