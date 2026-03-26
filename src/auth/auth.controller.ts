import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/user.decorator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import {
  AuthResponseDto,
  LoginDto,
  RefreshTokenDto,
  RegisterDto,
  TelegramLoginDto,
  TelegramUserExistsDto,
  UserExistsResponseDto,
} from './model/auth.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Register a new user',
    description:
      'Creates a new user account. Default role is USER. Only ADMIN can create ADMIN users.',
  })
  @ApiBody({ type: RegisterDto })
  @ApiResponse({
    status: 201,
    description: 'User registered successfully',
    type: AuthResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input or email already exists',
  })
  async register(@Body() registerDto: RegisterDto): Promise<AuthResponseDto> {
    return this.authService.register(registerDto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Login user',
    description: 'Authenticates user and returns JWT access and refresh tokens',
  })
  @ApiBody({ type: LoginDto })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(@Body() loginDto: LoginDto): Promise<AuthResponseDto> {
    return this.authService.login(loginDto);
  }

  @Post('telegram-login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Login/register with Telegram',
    description:
      'Authenticate using Telegram identity. Creates a user on first login and returns JWT access/refresh tokens.',
  })
  @ApiBody({ type: TelegramLoginDto })
  @ApiResponse({
    status: 200,
    description: 'Telegram login successful',
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Account is inactive' })
  async telegramLogin(@Body() dto: TelegramLoginDto): Promise<AuthResponseDto> {
    return this.authService.telegramLogin(dto);
  }

  @Post('telegram-register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Register with Telegram',
    description:
      'Creates a new account from Telegram identity. Fails if telegramId already exists.',
  })
  @ApiBody({ type: TelegramLoginDto })
  @ApiResponse({
    status: 201,
    description: 'Telegram registration successful',
    type: AuthResponseDto,
  })
  @ApiResponse({
    status: 409,
    description: 'User with this telegramId already exists',
  })
  async telegramRegister(@Body() dto: TelegramLoginDto): Promise<AuthResponseDto> {
    return this.authService.telegramRegister(dto);
  }

  @Post('telegram-user-exists')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Check Telegram user existence',
    description: 'Checks whether a user already exists by telegramId.',
  })
  @ApiBody({ type: TelegramUserExistsDto })
  @ApiResponse({
    status: 200,
    description: 'Existence check result',
    type: UserExistsResponseDto,
  })
  async telegramUserExists(
    @Body() dto: TelegramUserExistsDto,
  ): Promise<UserExistsResponseDto> {
    return this.authService.telegramUserExists(dto.telegramId);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refresh access token',
    description:
      'Exchange a valid refresh token for a new access token and refresh token. Use before the access token expires to extend the session.',
  })
  @ApiBody({ type: RefreshTokenDto })
  @ApiResponse({
    status: 200,
    description: 'New tokens issued',
    type: AuthResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid or expired refresh token',
  })
  async refresh(@Body() body: RefreshTokenDto): Promise<AuthResponseDto> {
    return this.authService.refresh(body.refreshToken);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get current user information',
    description:
      "Returns the authenticated user's information based on the JWT token. Use this endpoint to verify token validity and get user details.",
  })
  @ApiResponse({
    status: 200,
    description: 'Current user information',
    schema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          example: '123e4567-e89b-12d3-a456-426614174000',
        },
        email: {
          type: 'string',
          example: 'translator@example.com',
        },
        name: {
          type: 'string',
          nullable: true,
          example: 'John Doe',
        },
        username: {
          type: 'string',
          nullable: true,
          example: 'john_doe',
        },
        telegramId: {
          type: 'string',
          nullable: true,
          example: '123456789',
        },
        telegramProfileId: {
          type: 'string',
          nullable: true,
          example: '123e4567-e89b-12d3-a456-426614174000',
        },
        role: {
          type: 'string',
          enum: ['ADMIN', 'USER'],
          example: 'USER',
        },
        isActive: {
          type: 'boolean',
          example: true,
        },
        createdAt: {
          type: 'string',
          format: 'date-time',
        },
        updatedAt: {
          type: 'string',
          format: 'date-time',
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or expired token',
  })
  async getCurrentUser(@CurrentUser() user: { id: string }) {
    return this.authService.getCurrentUser(user.id);
  }
}
