import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Chapter } from '../chapter/model/chapter.entity';
import { User } from '../users/model/user.entity';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import { ChapterUnlock } from './model/chapter-unlock.entity';
import { CoinRequest } from './model/coin-request.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([CoinRequest, ChapterUnlock, User, Chapter]),
  ],
  controllers: [WalletController],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
