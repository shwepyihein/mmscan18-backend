import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { waitForDatabase } from './database/wait-for-db';

async function bootstrap() {
  await waitForDatabase();

  const app = await NestFactory.create(AppModule);

  // Enable graceful shutdown hooks
  app.enableShutdownHooks();

  // Enable CORS
  app.enableCors({
    origin: [
      'http://localhost:3002',
      'http://localhost:3000', // local dev
      'http://localhost:3001',
      'https://mmscan-navy.vercel.app', // production
      'https://manhwammhub.com',
      'https://www.manhwammhub.com',
      'https://18.manhwammhub.com',
      'https://mmscan-18.vercel.app',
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true, // important if using cookies later
  });

  // Enable global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Swagger configuration
  const config = new DocumentBuilder()
    .setTitle('Manhwa Translation Platform API')
    .setDescription(
      'MVP backend for a community-driven manhwa translation platform with public reading API',
    )
    .setVersion('2.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter JWT token',
        in: 'header',
      },
      'JWT-auth',
    )
    .addTag('auth', 'Authentication endpoints')
    .addTag('users', 'User management')
    .addTag('manhwa', 'Manhwa management')
    .addTag('chapters', 'Chapter management')
    .addTag('crawler', 'Background crawling jobs')
    .addTag('comments', 'Chapter comments')
    .addTag('public', 'Public reading API (no auth required)')
    .addTag('coin-packages', 'Coin purchase packages (price ↔ coins)')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  const port = process.env.PORT ?? 8000;
  await app.listen(port);

  process.on('SIGTERM', () => {
    void app.close().then(() => process.exit(0));
  });

  process.on('SIGINT', () => {
    void app.close().then(() => process.exit(0));
  });
}
void bootstrap();
