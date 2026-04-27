import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import axios from 'axios';
import { DataSource, Repository } from 'typeorm';
import { Chapter } from '../chapter/model/chapter.entity';
import { CoinPackage } from '../coin-packages/model/coin-package.entity';
import { S3Service } from '../s3/s3.service';
import { User } from '../users/model/user.entity';
import {
  AdminUpdatePendingRequestDto,
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
  private readonly logger = new Logger(WalletService.name);

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
    private readonly configService: ConfigService,
  ) {}

  private withProofImageUrl(request: CoinRequest | null): CoinRequest | null {
    if (!request) {
      return null;
    }
    return {
      ...request,
      proofImageUrl: this.s3Service.getFullUrl(request.proofImageUrl),
    };
  }

  private async notifyTelegramPurchaseRequest(
    request: CoinRequest,
  ): Promise<void> {
    const botToken = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    const chatId = this.configService.get<string>('TELEGRAM_APPROVAL_CHAT_ID');

    if (!botToken || !chatId) {
      return;
    }

    const proofUrl = this.s3Service.getFullUrl(request.proofImageUrl);
    const lines = [
      'New coin purchase request',
      `Request ID: ${request.id}`,
      `User ID: ${request.userId}`,
      `Coins: ${request.amount}`,
      `Package ID: ${request.coinPackageId ?? '-'}`,
      `Currency: ${request.currency ?? '-'}`,
      `Price: ${request.priceAmount ?? '-'}`,
      `Status: ${request.status}`,
      `Proof: ${proofUrl ?? '-'}`,
    ];

    try {
      await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        chat_id: chatId,
        text: lines.join('\n'),
      });
    } catch (error) {
      this.logger.warn('Failed to send Telegram purchase notification');
      this.logger.debug(String(error));
    }
  }

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

    const saved = await this.coinRequestRepository.save(request);
    return this.withProofImageUrl(saved) as CoinRequest;
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

    await this.notifyTelegramPurchaseRequest(withPackage);
    return this.withProofImageUrl(withPackage) as CoinRequest;
  }

  async getMyRequests(userId: string): Promise<CoinRequest[]> {
    const requests = await this.coinRequestRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    return requests.map(
      (request) => this.withProofImageUrl(request) as CoinRequest,
    );
  }

  // Admin: Get all pending requests
  async getAllPendingRequests(): Promise<CoinRequest[]> {
    const requests = await this.coinRequestRepository.find({
      where: { status: CoinRequestStatus.PENDING },
      relations: ['user', 'coinPackage'],
      order: { createdAt: 'ASC' },
    });
    return requests.map(
      (request) => this.withProofImageUrl(request) as CoinRequest,
    );
  }

  // Admin: Get all requests (optionally filter by status)
  async getAllRequests(status?: CoinRequestStatus): Promise<CoinRequest[]> {
    const requests = await this.coinRequestRepository.find({
      where: status ? { status } : {},
      relations: ['user', 'coinPackage'],
      order: { createdAt: 'DESC' },
    });
    return requests.map(
      (request) => this.withProofImageUrl(request) as CoinRequest,
    );
  }

  // Admin: Edit pending request package/snapshot before approval
  async updatePendingRequest(
    requestId: string,
    dto: AdminUpdatePendingRequestDto,
  ): Promise<CoinRequest> {
    const request = await this.coinRequestRepository.findOne({
      where: { id: requestId },
      relations: ['coinPackage'],
    });

    if (!request) {
      throw new NotFoundException('Request not found');
    }

    if (request.status !== CoinRequestStatus.PENDING) {
      throw new BadRequestException('Only pending requests can be edited');
    }

    const targetPackageId = dto.coinPackageId ?? request.coinPackageId;
    if (!targetPackageId) {
      throw new BadRequestException(
        'coinPackageId is required for package-based request edits',
      );
    }

    const pkg = await this.coinPackageRepository.findOne({
      where: { id: targetPackageId },
    });

    if (!pkg) {
      throw new NotFoundException('Coin package not found');
    }

    if (!pkg.isActive) {
      throw new BadRequestException('Selected package is inactive');
    }

    const currency = (dto.currency ?? request.currency ?? pkg.currency)
      .trim()
      .toUpperCase();
    const priceAmount = dto.priceAmount ?? request.priceAmount ?? pkg.price;

    if (currency !== pkg.currency.trim().toUpperCase()) {
      throw new BadRequestException(
        'Currency does not match the selected package',
      );
    }

    if (fiatMinorUnits(priceAmount) !== fiatMinorUnits(pkg.price)) {
      throw new BadRequestException(
        'Price does not match the selected package',
      );
    }

    request.coinPackageId = pkg.id;
    request.amount = pkg.coins;
    request.currency = currency;
    request.priceAmount = (fiatMinorUnits(priceAmount) / 100).toFixed(2);
    if (dto.adminNote) {
      request.adminNote = dto.adminNote;
    }

    const saved = await this.coinRequestRepository.save(request);
    return this.withProofImageUrl(saved) as CoinRequest;
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

      return this.withProofImageUrl(request) as CoinRequest;
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

    const saved = await this.coinRequestRepository.save(request);
    return this.withProofImageUrl(saved) as CoinRequest;
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

  async getChapterUnlockStatus(
    userId: string,
    chapterId: string,
  ): Promise<{ chapterId: string; isLocked: boolean; isUnlocked: boolean }> {
    const chapter = await this.chapterRepository.findOne({
      where: { id: chapterId },
      select: ['id', 'isLocked'],
    });

    if (!chapter) {
      throw new NotFoundException('Chapter not found');
    }

    if (!chapter.isLocked) {
      return { chapterId, isLocked: false, isUnlocked: true };
    }

    const isUnlocked = await this.isChapterUnlocked(userId, chapterId);
    return { chapterId, isLocked: true, isUnlocked };
  }

  async isChapterUnlocked(userId: string, chapterId: string): Promise<boolean> {
    const count = await this.chapterUnlockRepository.count({
      where: { userId, chapterId },
    });
    return count > 0;
  }
}
