import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Chapter } from '../chapter/model/chapter.entity';
import { User } from '../users/model/user.entity';
import {
  ApproveCoinRequestDto,
  CreateCoinRequestDto,
  UnlockChapterDto,
  WalletStatusResponse,
} from './dto/wallet.dto';
import { ChapterUnlock } from './model/chapter-unlock.entity';
import { CoinRequest, CoinRequestStatus } from './model/coin-request.entity';

@Injectable()
export class WalletService {
  constructor(
    @InjectRepository(CoinRequest)
    private readonly coinRequestRepository: Repository<CoinRequest>,
    @InjectRepository(ChapterUnlock)
    private readonly chapterUnlockRepository: Repository<ChapterUnlock>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Chapter)
    private readonly chapterRepository: Repository<Chapter>,
    private readonly dataSource: DataSource,
  ) {}

  async getWalletStatus(userId: string): Promise<WalletStatusResponse> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['coinBalance'],
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const pendingRequestsCount = await this.coinRequestRepository.count({
      where: { userId, status: CoinRequestStatus.PENDING },
    });

    return {
      coinBalance: user.coinBalance,
      pendingRequestsCount,
    };
  }

  async createCoinRequest(
    userId: string,
    dto: CreateCoinRequestDto,
  ): Promise<CoinRequest> {
    const request = this.coinRequestRepository.create({
      userId,
      amount: dto.amount,
      proofImageUrl: dto.proofImageUrl,
      status: CoinRequestStatus.PENDING,
    });

    return this.coinRequestRepository.save(request);
  }

  async getMyRequests(userId: string): Promise<CoinRequest[]> {
    return this.coinRequestRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  // Admin: Get all pending requests
  async getAllPendingRequests(): Promise<CoinRequest[]> {
    return this.coinRequestRepository.find({
      where: { status: CoinRequestStatus.PENDING },
      relations: ['user'],
      order: { createdAt: 'ASC' },
    });
  }

  // Admin: Approve request
  async approveRequest(
    requestId: string,
    dto: ApproveCoinRequestDto,
  ): Promise<CoinRequest> {
    return this.dataSource.transaction(async (manager) => {
      const request = await manager.findOne(CoinRequest, {
        where: { id: requestId },
        relations: ['user'],
      });

      if (!request) {
        throw new NotFoundException('Request not found');
      }

      if (request.status !== CoinRequestStatus.PENDING) {
        throw new BadRequestException('Request is already processed');
      }

      request.status = CoinRequestStatus.APPROVED;
      request.adminNote = dto.adminNote || 'Approved by admin';

      // Add coins to user balance
      const user = request.user;
      user.coinBalance += request.amount;

      await manager.save(request);
      await manager.save(user);

      return request;
    });
  }

  // Admin: Reject request
  async rejectRequest(
    requestId: string,
    dto: ApproveCoinRequestDto,
  ): Promise<CoinRequest> {
    const request = await this.coinRequestRepository.findOne({
      where: { id: requestId },
    });

    if (!request) {
      throw new NotFoundException('Request not found');
    }

    if (request.status !== CoinRequestStatus.PENDING) {
      throw new BadRequestException('Request is already processed');
    }

    request.status = CoinRequestStatus.REJECTED;
    request.adminNote = dto.adminNote || 'Rejected by admin';

    return this.coinRequestRepository.save(request);
  }

  // User: Unlock chapter
  async unlockChapter(
    userId: string,
    dto: UnlockChapterDto,
  ): Promise<ChapterUnlock> {
    return this.dataSource.transaction(async (manager) => {
      const user = await manager.findOne(User, { where: { id: userId } });
      const chapter = await manager.findOne(Chapter, {
        where: { id: dto.chapterId },
      });

      if (!user || !chapter) {
        throw new NotFoundException('User or Chapter not found');
      }

      if (!chapter.isLocked) {
        throw new BadRequestException('Chapter is already free');
      }

      // Check if already unlocked
      const existingUnlock = await manager.findOne(ChapterUnlock, {
        where: { userId, chapterId: dto.chapterId },
      });
      if (existingUnlock) {
        throw new ConflictException('Chapter is already unlocked for this user');
      }

      if (user.coinBalance < chapter.coinPrice) {
        throw new BadRequestException('Insufficient coin balance');
      }

      // Deduct coins
      user.coinBalance -= chapter.coinPrice;
      await manager.save(user);

      // Create unlock record
      const unlock = manager.create(ChapterUnlock, {
        userId,
        chapterId: dto.chapterId,
        coinsSpent: chapter.coinPrice,
      });

      return manager.save(unlock);
    });
  }

  async getUnlockedChapters(userId: string): Promise<string[]> {
    const unlocks = await this.chapterUnlockRepository.find({
      where: { userId },
      select: ['chapterId'],
    });
    return unlocks.map((u) => u.chapterId);
  }

  async isChapterUnlocked(userId: string, chapterId: string): Promise<boolean> {
    const count = await this.chapterUnlockRepository.count({
      where: { userId, chapterId },
    });
    return count > 0;
  }
}
