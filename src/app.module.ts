import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { ChapterCrawlerModule } from './chapter-crawler/chapter-crawler.module';
import { ChapterModule } from './chapter/chapter.module';
import { Chapter } from './chapter/model/chapter.entity';
import { CommentsModule } from './comments/comments.module';
import { Comment } from './comments/model/comment.entity';
import { CrawlerModule } from './crawler/crawler.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { CrawlBatch } from './crawler/model/crawl-batch.entity';
import { CrawlTask } from './crawler/model/crawl-task.entity';
import { ManhwaModule } from './manhwa/manhwa.module';
import { Manhwa } from './manhwa/model/manhwa.entity';
import { PublicModule } from './public/public.module';
import { S3Module } from './s3/s3.module';
import { User } from './users/model/user.entity';
import { TelegramUser } from './users/model/telegram-user.entity';
import { UsersModule } from './users/users.module';
import { WalletModule } from './wallet/wallet.module';
import { CoinRequest } from './wallet/model/coin-request.entity';
import { CoinPackagesModule } from './coin-packages/coin-packages.module';
import { CoinPackage } from './coin-packages/model/coin-package.entity';
import { ChapterUnlock } from './wallet/model/chapter-unlock.entity';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    // Bull Queue Configuration for Redis
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const redisUrl = configService.get<string>('REDIS_URL');
        console.log('[Bull] Configuring Redis connection...');
        console.log('[Bull] REDIS_URL exists:', !!redisUrl);

        // If REDIS_URL is provided (Railway format), use it directly
        if (redisUrl) {
          console.log('[Bull] Using REDIS_URL for connection');
          return {
            redis: redisUrl, // Pass URL as redis property
            defaultJobOptions: {
              attempts: 3,
              backoff: {
                type: 'exponential',
                delay: 5000,
              },
              removeOnComplete: { count: 1000 },
              removeOnFail: { count: 5000 },
            },
            settings: {
              lockDuration: 120000, // 2 minutes
              stalledInterval: 60000, // check every 60s
              maxStalledCount: 3, // allow retries
            },
          };
        }

        // Otherwise, use individual env vars (local development)
        console.log('[Bull] Using individual Redis config (host/port)');
        return {
          redis: {
            host: configService.get<string>('REDIS_HOST') || 'localhost',
            port: configService.get<number>('REDIS_PORT') || 6379,
            password: configService.get<string>('REDIS_PASSWORD') || undefined,
          },
          defaultJobOptions: {
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 5000,
            },
            removeOnComplete: { count: 1000 },
            removeOnFail: { count: 5000 },
          },
          settings: {
            lockDuration: 180000, // 2 minutes
            stalledInterval: 60000, // check every 60s
            maxStalledCount: 3, // allow retries
          },
        };
      },
      inject: [ConfigService],
    }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      // Retry initial connection (e.g. DB still starting in Docker)
      retryAttempts: 15,
      retryDelay: 3000,
      entities: [
        User,
        TelegramUser,
        Manhwa,
        Chapter,
        CrawlTask,
        CrawlBatch,
        Comment,
        CoinRequest,
        ChapterUnlock,
        CoinPackage,
      ],
      extra: {
        max: 5, // ✅ LIMIT POOL SIZE
        idleTimeoutMillis: 30000,
        // Allow slow networks / DB wake-up; pool waits longer for a connection
        connectionTimeoutMillis: 30000,
      },
      synchronize: process.env.NODE_ENV !== 'production',
      // logging: process.env.NODE_ENV === 'development',
    }),
    AuthModule,
    UsersModule,
    ManhwaModule,
    S3Module,
    CrawlerModule,
    DashboardModule,
    ChapterModule,
    ChapterCrawlerModule,
    CommentsModule,
    PublicModule,
    CoinPackagesModule,
    WalletModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
