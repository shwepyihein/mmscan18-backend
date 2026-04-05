import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CoinPackage } from '../coin-packages/model/coin-package.entity';
import { Chapter } from '../chapter/model/chapter.entity';
import { S3Module } from '../s3/s3.module';
import { User } from '../users/model/user.entity';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import { ChapterUnlock } from './model/chapter-unlock.entity';
import { CoinRequest } from './model/coin-request.entity';

@Module({
  imports: [
    S3Module,
    TypeOrmModule.forFeature([
      CoinRequest,
      ChapterUnlock,
      User,
      Chapter,
      CoinPackage,
    ]),
  ],
  controllers: [WalletController],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
