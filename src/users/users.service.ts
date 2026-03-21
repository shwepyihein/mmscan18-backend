import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { Chapter } from '../chapter/model/chapter.entity';
import { ChapterStatus } from '../chapter/model/chapter.enum';
import {
  calculateLevel,
  ContributorLevel,
} from '../common/enums/contributor-level.enum';
import { UserRole } from '../common/enums/user-role.enum';
import {
  createPaginatedResponse,
  PaginatedResponse,
} from '../common/interfaces/pagination.interface';
import { S3Service } from '../s3/s3.service';
import {
  CreateUserDto,
  PublicContributorDto,
  SaveTelegramUserDto,
  UpdateUserDto,
} from './model/user.dto';
import { User } from './model/user.entity';
import { TelegramUser } from './model/telegram-user.entity';

// Badge definitions
const BADGES = {
  first_translation: { requirement: 1, type: 'chapters' },
  ten_translations: { requirement: 10, type: 'chapters' },
  fifty_translations: { requirement: 50, type: 'chapters' },
  century_club: { requirement: 100, type: 'chapters' },
  speed_demon: { requirement: 5, type: 'daily' },
  streak_7: { requirement: 7, type: 'streak' },
  streak_30: { requirement: 30, type: 'streak' },
  popular_1k: { requirement: 1000, type: 'views' },
  popular_10k: { requirement: 10000, type: 'views' },
};

// Allowed image mime types for avatar
const ALLOWED_AVATAR_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
];

const MAX_AVATAR_SIZE = 5 * 1024 * 1024; // 5MB

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Chapter)
    private readonly chapterRepository: Repository<Chapter>,
    @InjectRepository(TelegramUser)
    private readonly telegramUserRepository: Repository<TelegramUser>,
    private readonly s3Service: S3Service,
  ) {}

  async saveTelegramUser(
    dto: SaveTelegramUserDto,
    authenticatedUserId?: string,
  ): Promise<TelegramUser> {
    let telegramUser = await this.telegramUserRepository.findOne({
      where: { telegramId: dto.telegramId },
    });

    if (telegramUser) {
      // Update existing
      Object.assign(telegramUser, dto);
      telegramUser = await this.telegramUserRepository.save(telegramUser);
    } else {
      // Create new
      telegramUser = this.telegramUserRepository.create(dto);
      telegramUser = await this.telegramUserRepository.save(telegramUser);
    }

    // If user is logged in, link this telegram profile to their account
    if (authenticatedUserId) {
      const user = await this.userRepository.findOne({
        where: { id: authenticatedUserId },
      });
      if (user) {
        user.telegramId = dto.telegramId;
        user.telegramProfileId = telegramUser.id;
        await this.userRepository.save(user);
      }
    }

    return telegramUser;
  }

  async create(
    createUserDto: CreateUserDto,
    requestingUserRole?: UserRole,
  ): Promise<User> {
    // Only ADMIN can create ADMIN users
    if (
      createUserDto.role === UserRole.ADMIN &&
      requestingUserRole !== UserRole.ADMIN
    ) {
      throw new ForbiddenException('Only ADMIN can create ADMIN users');
    }

    // Check if user already exists
    const existingUser = await this.userRepository.findOne({
      where: { email: createUserDto.email },
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Check if username is taken
    if (createUserDto.username) {
      const existingUsername = await this.userRepository.findOne({
        where: { username: createUserDto.username },
      });
      if (existingUsername) {
        throw new ConflictException('Username is already taken');
      }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);

    // Create user
    const user = this.userRepository.create({
      ...createUserDto,
      password: hashedPassword,
      level: ContributorLevel.BRONZE,
      totalChaptersTranslated: 0,
      totalViews: 0,
      currentStreak: 0,
      longestStreak: 0,
      badges: [],
    });

    return this.userRepository.save(user);
  }

  async findById(
    id: string,
    requestingUserId?: string,
    requestingUserRole?: UserRole,
  ): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    // Users can only view their own profile unless they're ADMIN
    if (requestingUserRole !== UserRole.ADMIN && requestingUserId !== id) {
      throw new ForbiddenException('You can only view your own profile');
    }

    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { email } });
  }

  async findByUsername(username: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { username } });
  }

  async findAll(
    page: number = 1,
    limit: number = 20,
  ): Promise<PaginatedResponse<User>> {
    const skip = (page - 1) * limit;

    const [data, total] = await this.userRepository.findAndCount({
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    return createPaginatedResponse(data, total, page, limit);
  }

  async findContributors(
    page: number = 1,
    limit: number = 20,
  ): Promise<PaginatedResponse<User>> {
    const skip = (page - 1) * limit;

    const [data, total] = await this.userRepository.findAndCount({
      where: { role: UserRole.USER, isActive: true },
      order: { totalChaptersTranslated: 'DESC' },
      skip,
      take: limit,
    });

    return createPaginatedResponse(data, total, page, limit);
  }

  async getPublicProfile(username: string): Promise<PublicContributorDto> {
    const user = await this.userRepository.findOne({
      where: { username, isActive: true },
    });

    if (!user) {
      throw new NotFoundException(`Contributor @${username} not found`);
    }

    return {
      id: user.id,
      username: user.username,
      name: user.name,
      avatarUrl: this.s3Service.getFullUrl(user.avatarUrl),
      bio: user.bio,
      level: user.level,
      totalChaptersTranslated: user.totalChaptersTranslated,
      totalViews: user.totalViews,
      currentStreak: user.currentStreak,
      longestStreak: user.longestStreak,
      badges: user.badges,
      createdAt: user.createdAt,
    };
  }

  async update(
    id: string,
    updateUserDto: UpdateUserDto,
    requestingUserId?: string,
    requestingUserRole?: UserRole,
  ): Promise<User> {
    const user = await this.findById(id, requestingUserId, requestingUserRole);

    // Only ADMIN can change roles or update other users
    if (updateUserDto.role && requestingUserRole !== UserRole.ADMIN) {
      throw new ForbiddenException('Only ADMIN can change user roles');
    }

    // Only ADMIN can update other users
    if (requestingUserId !== id && requestingUserRole !== UserRole.ADMIN) {
      throw new ForbiddenException('You can only update your own profile');
    }

    // Only ADMIN can change role to ADMIN
    if (
      updateUserDto.role === UserRole.ADMIN &&
      requestingUserRole !== UserRole.ADMIN
    ) {
      throw new ForbiddenException('Only ADMIN can assign ADMIN role');
    }

    // Check if email is being updated and if it's already taken
    if (updateUserDto.email && updateUserDto.email !== user.email) {
      const existingUser = await this.userRepository.findOne({
        where: { email: updateUserDto.email },
      });

      if (existingUser) {
        throw new ConflictException('User with this email already exists');
      }
    }

    // Check if username is being updated and if it's already taken
    if (updateUserDto.username && updateUserDto.username !== user.username) {
      const existingUsername = await this.userRepository.findOne({
        where: { username: updateUserDto.username },
      });

      if (existingUsername) {
        throw new ConflictException('Username is already taken');
      }
    }

    // Update user
    Object.assign(user, updateUserDto);
    return this.userRepository.save(user);
  }

  async delete(id: string): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    user.isActive = false;
    await this.userRepository.save(user);
  }

  // Upload avatar for a user
  async uploadAvatar(
    userId: string,
    file: Express.Multer.File,
    requestingUserId: string,
    requestingUserRole: UserRole,
  ): Promise<{ avatarPath: string; avatarUrl: string }> {
    // Check permissions - users can only upload their own avatar unless ADMIN
    if (requestingUserRole !== UserRole.ADMIN && requestingUserId !== userId) {
      throw new ForbiddenException('You can only upload your own avatar');
    }

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    // Validate file type
    if (!ALLOWED_AVATAR_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        `Invalid file type. Allowed types: ${ALLOWED_AVATAR_TYPES.join(', ')}`,
      );
    }

    // Validate file size
    if (file.size > MAX_AVATAR_SIZE) {
      throw new BadRequestException(
        `File too large. Maximum size is ${MAX_AVATAR_SIZE / (1024 * 1024)}MB`,
      );
    }

    // Upload to S3 - returns both key (path) and full URL
    const { key, url } = await this.s3Service.uploadUserAvatar(
      userId,
      file.buffer,
      file.mimetype,
    );

    // Store only the path in database
    user.avatarUrl = key;
    await this.userRepository.save(user);

    return { avatarPath: key, avatarUrl: url };
  }

  // Delete avatar for a user
  async deleteAvatar(
    userId: string,
    requestingUserId: string,
    requestingUserRole: UserRole,
  ): Promise<{ success: boolean }> {
    // Check permissions
    if (requestingUserRole !== UserRole.ADMIN && requestingUserId !== userId) {
      throw new ForbiddenException('You can only delete your own avatar');
    }

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    // Clear avatar URL
    user.avatarUrl = null;
    await this.userRepository.save(user);

    return { success: true };
  }

  async getContributorStats(contributorId: string): Promise<{
    totalAssignedChapters: number;
    rawChapters: number;
    inProgressChapters: number;
    cleaningChapters: number;
    translatedChapters: number;
    availableTranslateSlot: number;
    level: ContributorLevel;
    badges: string[];
  }> {
    const user = await this.userRepository.findOne({
      where: { id: contributorId },
    });
    if (!user) {
      throw new NotFoundException(`User with ID ${contributorId} not found`);
    }
    if (user.role !== UserRole.USER) {
      throw new ForbiddenException('User is not a standard user');
    }

    const totalAssignedChapters = await this.chapterRepository.count({
      where: { assignedContributorId: contributorId },
    });

    const rawChapters = await this.chapterRepository.count({
      where: {
        assignedContributorId: contributorId,
        status: ChapterStatus.RAW,
      },
    });

    const inProgressChapters = await this.chapterRepository.count({
      where: {
        assignedContributorId: contributorId,
        status: ChapterStatus.IN_PROGRESS,
      },
    });

    const cleaningChapters = await this.chapterRepository.count({
      where: {
        assignedContributorId: contributorId,
        status: ChapterStatus.CLEANING,
      },
    });

    const translatedChapters = await this.chapterRepository.count({
      where: {
        assignedContributorId: contributorId,
        status: ChapterStatus.TRANSLATED,
      },
    });

    return {
      totalAssignedChapters,
      rawChapters,
      inProgressChapters,
      cleaningChapters,
      translatedChapters,
      availableTranslateSlot: user.availableTranslateSlot ?? 5,
      level: user.level,
      badges: user.badges || [],
    };
  }

  async getAssignedChapters(
    contributorId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<PaginatedResponse<Chapter>> {
    const user = await this.userRepository.findOne({
      where: { id: contributorId },
    });
    if (!user) {
      throw new NotFoundException(`User with ID ${contributorId} not found`);
    }
    if (user.role !== UserRole.USER) {
      throw new ForbiddenException('User is not a standard user');
    }

    const skip = (page - 1) * limit;

    const [data, total] = await this.chapterRepository.findAndCount({
      where: { assignedContributorId: contributorId },
      relations: ['manhwa'],
      order: { chapterNo: 'DESC' },
      skip,
      take: limit,
    });

    return createPaginatedResponse(data, total, page, limit);
  }

  private static readonly MAX_TRANSLATE_SLOTS = 5;

  /** Restore one translation slot (e.g. when contributor submits chapter for review). Capped at MAX_TRANSLATE_SLOTS. */
  async incrementAvailableTranslateSlot(userId: string): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });
    if (!user) return;
    const current =
      user.availableTranslateSlot ?? UsersService.MAX_TRANSLATE_SLOTS;
    user.availableTranslateSlot = Math.min(
      UsersService.MAX_TRANSLATE_SLOTS,
      current + 1,
    );
    await this.userRepository.save(user);
  }

  /** Reduce one translation slot (e.g. when contributor releases a chapter without submitting). Capped at 0. */
  async decrementAvailableTranslateSlot(userId: string): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });
    if (!user) return;
    const current =
      user.availableTranslateSlot ?? UsersService.MAX_TRANSLATE_SLOTS;
    user.availableTranslateSlot = Math.max(0, current - 1);
    await this.userRepository.save(user);
  }

  // Called when a translation is approved
  async incrementTranslationStats(contributorId: string): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { id: contributorId },
    });
    if (!user) return;

    const now = new Date();
    const lastTranslation = user.lastTranslationAt;

    // Increment chapters count
    user.totalChaptersTranslated += 1;

    // Update streak
    if (lastTranslation) {
      const daysSinceLastTranslation = Math.floor(
        (now.getTime() - lastTranslation.getTime()) / (1000 * 60 * 60 * 24),
      );

      if (daysSinceLastTranslation === 1) {
        // Consecutive day
        user.currentStreak += 1;
        if (user.currentStreak > user.longestStreak) {
          user.longestStreak = user.currentStreak;
        }
      } else if (daysSinceLastTranslation > 1) {
        // Streak broken
        user.currentStreak = 1;
      }
      // Same day - don't change streak
    } else {
      // First translation
      user.currentStreak = 1;
      user.longestStreak = 1;
    }

    user.lastTranslationAt = now;

    // Update level
    user.level = calculateLevel(user.totalChaptersTranslated);

    // Check and award badges
    const newBadges = this.checkBadges(user);
    if (newBadges.length > 0) {
      user.badges = [...(user.badges || []), ...newBadges];
    }

    await this.userRepository.save(user);
  }

  // Add views to contributor's total
  async incrementContributorViews(
    contributorId: string,
    views: number,
  ): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { id: contributorId },
    });
    if (!user) return;

    user.totalViews += views;

    // Check view-based badges
    const newBadges = this.checkBadges(user);
    if (newBadges.length > 0) {
      user.badges = [...(user.badges || []), ...newBadges];
    }

    await this.userRepository.save(user);
  }

  private checkBadges(user: User): string[] {
    const currentBadges = user.badges || [];
    const newBadges: string[] = [];

    for (const [badgeCode, badge] of Object.entries(BADGES)) {
      if (currentBadges.includes(badgeCode)) continue;

      let earned = false;

      switch (badge.type) {
        case 'chapters':
          earned = user.totalChaptersTranslated >= badge.requirement;
          break;
        case 'streak':
          earned = user.longestStreak >= badge.requirement;
          break;
        case 'views':
          earned = user.totalViews >= badge.requirement;
          break;
        // 'daily' badges need special handling (not implemented here)
      }

      if (earned) {
        newBadges.push(badgeCode);
      }
    }

    return newBadges;
  }

  // Leaderboard queries
  async getTopContributors(
    page: number = 1,
    limit: number = 10,
  ): Promise<PaginatedResponse<User>> {
    const skip = (page - 1) * limit;

    const [data, total] = await this.userRepository.findAndCount({
      where: { role: UserRole.USER, isActive: true },
      order: { totalChaptersTranslated: 'DESC' },
      skip,
      take: limit,
    });

    return createPaginatedResponse(data, total, page, limit);
  }

  async getTopContributorsByViews(
    page: number = 1,
    limit: number = 10,
  ): Promise<PaginatedResponse<User>> {
    const skip = (page - 1) * limit;

    const [data, total] = await this.userRepository.findAndCount({
      where: { role: UserRole.USER, isActive: true },
      order: { totalViews: 'DESC' },
      skip,
      take: limit,
    });

    return createPaginatedResponse(data, total, page, limit);
  }

  async getTopContributorsByStreak(
    page: number = 1,
    limit: number = 10,
  ): Promise<PaginatedResponse<User>> {
    const skip = (page - 1) * limit;

    const [data, total] = await this.userRepository.findAndCount({
      where: { role: UserRole.USER, isActive: true },
      order: { currentStreak: 'DESC' },
      skip,
      take: limit,
    });

    return createPaginatedResponse(data, total, page, limit);
  }
}
