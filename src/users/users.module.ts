import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Chapter } from '../chapter/model/chapter.entity';
import { S3Module } from '../s3/s3.module';
import { User } from './model/user.entity';
import { TelegramUser } from './model/telegram-user.entity';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, Chapter, TelegramUser]), S3Module],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
