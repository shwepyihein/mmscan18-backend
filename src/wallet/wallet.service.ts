import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CoinPackage } from '../coin-packages/model/coin-package.entity';
import { Chapter } from '../chapter/model/chapter.entity';
import { S3Service } from '../s3/s3.service';
import { User } from '../users/model/user.entity';
import {
  ApproveCoinRequestDto,
  CreateCoinRequestDto,
  CreatePackageCoinRequestDto,
  UnlockChapterDto,
  WalletStatusResponse,
} from './dto/wallet.dto';
import { ChapterUnlock } from './model/chapter-unlock.entity';
import { CoinRequest, CoinRequestStatus } from './model/coin-request.entity';

const ALLOWED_PAYMENT_PROOF_MIME = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
];

const MAX_PAYMENT_PROOF_SIZE = 5 * 1024 * 1024; // 5MB (same as avatars)

function fiatMinorUnits(value: string): number {
  const n = Number.parseFloat(value.trim());
  if (Number.isNaN(n)) {
    throw new BadRequestException('Invalid price amount');
  }
  return Math.round(n * 100);
}

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
    @InjectRepository(CoinPackage)
    private readonly coinPackageRepository: Repository<CoinPackage>,
    private readonly dataSource: DataSource,
    private readonly s3Service: S3Service,
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

  async createPurchaseRequest(
    userId: string,
    dto: CreatePackageCoinRequestDto,
    file: Express.Multer.File,
  ): Promise<CoinRequest> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Invoice image is required');
    }

    if (!ALLOWED_PAYMENT_PROOF_MIME.includes(file.mimetype)) {
      throw new BadRequestException(
        `Invalid file type. Allowed types: ${ALLOWED_PAYMENT_PROOF_MIME.join(', ')}`,
      );
    }

    if (file.size > MAX_PAYMENT_PROOF_SIZE) {
      throw new BadRequestException(
        `File too large. Maximum size is ${MAX_PAYMENT_PROOF_SIZE / (1024 * 1024)}MB`,
      );
    }

    const pkg = await this.coinPackageRepository.findOne({
      where: { id: dto.coinPackageId },
    });

    if (!pkg) {
      throw new NotFoundException('Coin package not found');
    }

    if (!pkg.isActive) {
      throw new BadRequestException(
        'Coin package is not available for purchase',
      );
    }

    const pkgCurrency = pkg.currency.trim().toUpperCase();
    if (pkgCurrency !== dto.currency) {
      throw new BadRequestException(
        'Currency does not match the selected package',
      );
    }

    if (fiatMinorUnits(pkg.price) !== fiatMinorUnits(dto.priceAmount)) {
      throw new BadRequestException(
        'Price does not match the selected package',
      );
    }

    const { key } = await this.s3Service.uploadCoinPaymentProof(
      userId,
      file.buffer,
      file.mimetype,
    );

    const priceSnapshot = (fiatMinorUnits(dto.priceAmount) / 100).toFixed(2);

    const request = this.coinRequestRepository.create({
      userId,
      amount: pkg.coins,
      coinPackageId: pkg.id,
      currency: dto.currency,
      priceAmount: priceSnapshot,
      proofImageUrl: key,
      status: CoinRequestStatus.PENDING,
    });

    const saved = await this.coinRequestRepository.save(request);

    const withPackage = await this.coinRequestRepository.findOne({
      where: { id: saved.id },
      relations: ['coinPackage'],
    });

    if (!withPackage) {
      throw new NotFoundException('Coin request not found after save');
    }

    return withPackage;
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
      relations: ['user', 'coinPackage'],
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
        throw new ConflictException(
          'Chapter is already unlocked for this user',
        );
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
