import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { ContributorLevel } from '../common/enums/contributor-level.enum';
import { UserRole } from '../common/enums/user-role.enum';
import { User } from '../users/model/user.entity';
import { AuthResponseDto, LoginDto, RegisterDto } from './model/auth.dto';

const REFRESH_TOKEN_EXPIRY_SEC = 7 * 24 * 60 * 60; // 7 days in seconds

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  private buildTokens(user: User): {
    accessToken: string;
    refreshToken: string;
  } {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    const accessToken = this.jwtService.sign(payload);
    const refreshExpirySec =
      this.configService.get<number>('JWT_REFRESH_EXPIRY_SEC') ||
      REFRESH_TOKEN_EXPIRY_SEC;
    const refreshToken = this.jwtService.sign(
      { ...payload, type: 'refresh' },
      { expiresIn: refreshExpirySec },
    );
    return { accessToken, refreshToken };
  }

  async register(registerDto: RegisterDto): Promise<AuthResponseDto> {
    // Check if user already exists
    const existingUser = await this.userRepository.findOne({
      where: { email: registerDto.email },
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Check if username is taken (if provided)
    if (registerDto.username) {
      const existingUsername = await this.userRepository.findOne({
        where: { username: registerDto.username },
      });
      if (existingUsername) {
        throw new ConflictException('Username is already taken');
      }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(registerDto.password, 10);

    // Create user (default role is USER)
    const user = this.userRepository.create({
      email: registerDto.email,
      password: hashedPassword,
      name: registerDto.name || null,
      username: registerDto.username || null,
      role: UserRole.USER,
      isActive: true,
      level: ContributorLevel.BRONZE,
      totalChaptersTranslated: 0,
      totalViews: 0,
      currentStreak: 0,
      longestStreak: 0,
      badges: [],
    });

    const savedUser = await this.userRepository.save(user);
    const { accessToken, refreshToken } = this.buildTokens(savedUser);
    return {
      accessToken,
      refreshToken,
      user: {
        id: savedUser.id,
        email: savedUser.email,
        name: savedUser.name,
        username: savedUser.username,
        role: savedUser.role,
        level: savedUser.level,
      },
    };
  }

  async login(loginDto: LoginDto): Promise<AuthResponseDto> {
    // Find user by email
    const user = await this.userRepository.findOne({
      where: { email: loginDto.email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check if user is active
    if (!user.isActive) {
      throw new UnauthorizedException('Account is inactive');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      user.password,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const { accessToken, refreshToken } = this.buildTokens(user);
    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        username: user.username,
        role: user.role,
        level: user.level,
      },
    };
  }

  async refresh(refreshToken: string): Promise<AuthResponseDto> {
    let payload: { sub?: string; type?: string; email?: string; role?: string };
    try {
      payload = this.jwtService.verify(refreshToken);
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    if (payload.type !== 'refresh' || !payload.sub) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const user = await this.userRepository.findOne({
      where: { id: payload.sub, isActive: true },
    });
    if (!user) {
      throw new UnauthorizedException('User not found or inactive');
    }
    const tokens = this.buildTokens(user);
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        username: user.username,
        role: user.role,
        level: user.level,
      },
    };
  }

  async validateUser(userId: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { id: userId, isActive: true },
    });
  }

  async getCurrentUser(userId: string): Promise<{
    id: string;
    email: string;
    name: string | null;
    username: string | null;
    role: string;
    level: string;
    totalChaptersTranslated: number;
    totalViews: number;
    currentStreak: number;
    badges: string[] | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    avatarUrl: string | null;
  }> {
    const user = await this.userRepository.findOne({
      where: { id: userId, isActive: true },
    });

    if (!user) {
      throw new UnauthorizedException('User not found or inactive');
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      username: user.username,
      role: user.role,
      level: user.level,
      totalChaptersTranslated: user.totalChaptersTranslated,
      totalViews: user.totalViews,
      currentStreak: user.currentStreak,
      badges: user.badges,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      avatarUrl: user.avatarUrl,
    };
  }
}
