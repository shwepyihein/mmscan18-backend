import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { S3Module } from '../s3/s3.module';
import { ManhwaController } from './manhwa.controller';
import { ManhwaService } from './manhwa.service';
import { Manhwa } from './model/manhwa.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Manhwa]), S3Module],
  controllers: [ManhwaController],
  providers: [ManhwaService],
  exports: [ManhwaService],
})
export class ManhwaModule {}
