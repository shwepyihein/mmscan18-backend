import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
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
import { CurrentUser } from '../auth/decorators/user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../common/enums/user-role.enum';
import { PaginatedResponse } from '../common/interfaces/pagination.interface';
import {
  CreateUserDto,
  SaveTelegramUserDto,
  UpdateUserDto,
} from './model/user.dto';
import { User } from './model/user.entity';
import { UsersService } from './users.service';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth('JWT-auth')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a new user (ADMIN only)',
    description:
      'Creates a new user account with specified role. Only ADMIN can create ADMIN users.',
  })
  @ApiResponse({ status: 201, description: 'User created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({
    status: 403,
    description: 'Only ADMIN can create ADMIN users',
  })
  @ApiResponse({ status: 409, description: 'Email already exists' })
  async createUser(
    @Body() createUserDto: CreateUserDto,
    @CurrentUser() user: { id: string; role: UserRole },
  ) {
    return this.usersService.create(createUserDto, user.role);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth('JWT-auth')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'List all users (ADMIN only)',
    description: 'Returns a paginated list of all users in the system',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page (default: 20)',
  })
  @ApiResponse({ status: 200, description: 'Paginated list of users' })
  async getAllUsers(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ): Promise<PaginatedResponse<User>> {
    return this.usersService.findAll(page || 1, limit || 20);
  }

  @Get('contributors')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth('JWT-auth')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'List Contributors (ADMIN only)',
    description: 'Returns a paginated list of all contributors in the system',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page (default: 20)',
  })
  @ApiResponse({ status: 200, description: 'Paginated list of contributors' })
  async getContributors(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ): Promise<PaginatedResponse<User>> {
    return this.usersService.findContributors(page || 1, limit || 20);
  }

  @Get('profile/:username')
  @ApiOperation({
    summary: 'Get public contributor profile by username',
    description: 'Returns public profile of a contributor',
  })
  @ApiParam({ name: 'username', description: 'Contributor username' })
  @ApiResponse({ status: 200, description: 'Contributor public profile' })
  @ApiResponse({ status: 404, description: 'Contributor not found' })
  async getPublicProfile(@Param('username') username: string) {
    return this.usersService.getPublicProfile(username);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get user by ID',
    description:
      'Returns user details. Users can view their own profile, ADMIN can view any user.',
  })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({ status: 200, description: 'User details' })
  @ApiResponse({
    status: 403,
    description: 'You can only view your own profile',
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getUserById(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: UserRole },
  ) {
    return this.usersService.findById(id, user.id, user.role);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Update user',
    description:
      'Users can update their own profile (except role). ADMIN can update any user including role changes.',
  })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({ status: 200, description: 'User updated successfully' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async updateUser(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
    @CurrentUser() user: { id: string; role: UserRole },
  ) {
    return this.usersService.update(id, updateUserDto, user.id, user.role);
  }

  @Delete('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete my account',
    description:
      'Soft-deletes the authenticated user (sets isActive to false). Use after login; tokens will stop working for protected routes.',
  })
  @ApiResponse({ status: 204, description: 'Account deactivated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async deleteMyAccount(@CurrentUser('id') userId: string): Promise<void> {
    return this.usersService.delete(userId);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth('JWT-auth')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete user (ADMIN only)',
    description: 'Soft deletes a user by setting isActive to false',
  })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({ status: 204, description: 'User deleted successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async deleteUser(@Param('id') id: string) {
    return this.usersService.delete(id);
  }

  @Post(':id/avatar')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth('JWT-auth')
  @UseInterceptors(FileInterceptor('avatar'))
  @ApiOperation({
    summary: 'Upload user avatar',
    description:
      'Upload avatar image for a user. Users can upload their own, ADMIN can upload for anyone.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        avatar: {
          type: 'string',
          format: 'binary',
          description: 'Avatar image file (jpg, png, webp, gif). Max 5MB.',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Avatar uploaded successfully',
    schema: {
      type: 'object',
      properties: {
        avatarPath: {
          type: 'string',
          description: 'S3 path (stored in database)',
          example: 'users/123/avatar_1234567890.jpg',
        },
        avatarUrl: {
          type: 'string',
          description: 'Full S3 URL for display',
          example:
            'https://bucket.s3.amazonaws.com/users/123/avatar_1234567890.jpg',
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid file type or size' })
  @ApiResponse({
    status: 403,
    description: 'Cannot upload avatar for other users',
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  async uploadAvatar(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: { id: string; role: UserRole },
  ) {
    return this.usersService.uploadAvatar(id, file, user.id, user.role);
  }

  @Delete(':id/avatar')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete user avatar',
    description:
      'Remove avatar for a user. Users can delete their own, ADMIN can delete for anyone.',
  })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({ status: 200, description: 'Avatar deleted successfully' })
  @ApiResponse({
    status: 403,
    description: 'Cannot delete avatar for other users',
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  async deleteAvatar(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: UserRole },
  ) {
    return this.usersService.deleteAvatar(id, user.id, user.role);
  }

  @Get(':id/stats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth('JWT-auth')
  @Roles('ADMIN', 'USER')
  @ApiOperation({
    summary: 'Get contributor statistics',
    description:
      'Returns user statistics including assigned chapters count. USER can only view their own stats.',
  })
  @ApiParam({ name: 'id', description: 'Contributor UUID' })
  @ApiResponse({
    status: 200,
    description: 'Contributor statistics',
  })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getContributorStats(
    @Param('id') id: string,
    @CurrentUser() currentUser: { id: string; role: string },
  ) {
    // USER can only view their own stats
    if (currentUser.role === 'USER' && currentUser.id !== id) {
      throw new ForbiddenException('You can only view your own statistics');
    }
    return this.usersService.getContributorStats(id);
  }

  @Get(':id/chapters')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth('JWT-auth')
  @Roles('ADMIN', 'USER')
  @ApiOperation({
    summary: 'Get assigned chapters for contributor',
    description:
      'Returns paginated chapters assigned to a user. USER can only view their own chapters.',
  })
  @ApiParam({ name: 'id', description: 'Contributor UUID' })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page (default: 20)',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of assigned chapters',
  })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getAssignedChapters(
    @Param('id') id: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @CurrentUser() currentUser?: { id: string; role: string },
  ) {
    // USER can only view their own chapters
    if (currentUser?.role === 'USER' && currentUser.id !== id) {
      throw new ForbiddenException('You can only view your own chapters');
    }
    return this.usersService.getAssignedChapters(id, page || 1, limit || 20);
  }

  @Post('telegram')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Save or update Telegram user data (Mini App)',
    description:
      'Saves full Telegram user profile. If user is authenticated, links it to their account.',
  })
  async saveTelegramUser(
    @Body() dto: SaveTelegramUserDto,
    @CurrentUser('id') userId?: string,
  ) {
    return this.usersService.saveTelegramUser(dto, userId);
  }
}
