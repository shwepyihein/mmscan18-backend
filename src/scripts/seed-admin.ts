import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../app.module';

async function bootstrap() {
  console.log('🚀 Starting database seed...\n');

  const app = await NestFactory.createApplicationContext(AppModule);
  const dataSource = app.get(DataSource);

  try {
    // Get all table names in correct order for foreign key constraints
    const tables = [
      'comments',
      'chapters',
      'crawl_tasks',
      'crawl_batches',
      'manhwas',
      'users',
    ];

    console.log('🗑️  Truncating all tables...');

    // Truncate tables with CASCADE to handle foreign keys
    for (const table of tables) {
      try {
        await dataSource.query(
          `TRUNCATE TABLE "${table}" RESTART IDENTITY CASCADE`,
        );
        console.log(`   ✓ Truncated ${table}`);
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        console.log(`   - Skipped ${table}: ${errorMessage}`);
      }
    }

    console.log('\n👤 Creating admin user...');

    // Create admin user using raw query to avoid any TypeORM issues
    const adminPassword = 'admin123'; // Change this!
    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    await dataSource.query(
      `
      INSERT INTO "users" (
        "email", "password", "name", "username", "role", "isActive",
        "level", "totalChaptersTranslated", "totalViews", "totalPoints",
        "currentStreak", "longestStreak", "badges", "availableTranslateSlot",
        "createdAt", "updatedAt"
      ) VALUES (
        'admin@manhwa.com', $1, 'Admin', 'admin', 'ADMIN', true,
        'DIAMOND', 0, 0, 0, 0, 0, NULL, 5,
        NOW(), NOW()
      )
    `,
      [hashedPassword],
    );

    console.log('   ✓ Admin user created');
    console.log('\n📋 Admin Credentials:');
    console.log('   ┌──────────────────────────────┐');
    console.log('   │  Email:    admin@manhwa.com  │');
    console.log('   │  Password: admin123          │');
    console.log('   └──────────────────────────────┘');
    console.log('\n⚠️  IMPORTANT: Change the password after first login!\n');

    console.log('✅ Database seeded successfully!\n');
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    throw error;
  } finally {
    await app.close();
  }
}

void bootstrap();
