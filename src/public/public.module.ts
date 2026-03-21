import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Chapter } from '../chapter/model/chapter.entity';
import { Manhwa } from '../manhwa/model/manhwa.entity';
import { S3Module } from '../s3/s3.module';
import { User } from '../users/model/user.entity';
import { PublicController } from './public.controller';
import { PublicService } from './public.service';
import { WalletModule } from '../wallet/wallet.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Manhwa, Chapter, User]),
    S3Module,
    WalletModule,
  ],
  controllers: [PublicController],
  providers: [PublicService],
  exports: [PublicService],
})
export class PublicModule {}
