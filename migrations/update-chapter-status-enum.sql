-- Migration: Update ChapterStatus enum from complex workflow to simplified contributor flow
-- Date: 2026-02-03
-- Changes: CREATED, CRAWLING, CRAWLED, ASSIGNED, SUBMITTED, IN_REVIEW, CHANGES_REQUESTED, APPROVED, PUBLISHED, ARCHIVED
--      --> RAW, IN_PROGRESS, TRANSLATED

-- =====================================================
-- STEP 1: Update Chapter Status Enum
-- =====================================================

-- Create new enum type for chapters
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'chapter_status_new') THEN
        CREATE TYPE chapter_status_new AS ENUM ('RAW', 'IN_PROGRESS', 'TRANSLATED');
    END IF;
END $$;

-- Map old statuses to new statuses
UPDATE chapters SET status = 'RAW' WHERE status IN ('CREATED', 'CRAWLING', 'CRAWLED', 'ASSIGNED');
UPDATE chapters SET status = 'TRANSLATED' WHERE status IN ('SUBMITTED', 'IN_REVIEW', 'APPROVED', 'PUBLISHED', 'CHANGES_REQUESTED', 'ARCHIVED');
-- IN_PROGRESS stays as IN_PROGRESS (no change needed)

-- Alter column to use new enum type
ALTER TABLE chapters 
    ALTER COLUMN status DROP DEFAULT;

ALTER TABLE chapters 
    ALTER COLUMN status TYPE chapter_status_new 
    USING status::text::chapter_status_new;

ALTER TABLE chapters 
    ALTER COLUMN status SET DEFAULT 'RAW';

-- Drop old enum and rename new one
DROP TYPE IF EXISTS chapterstatus CASCADE;
ALTER TYPE chapter_status_new RENAME TO chapterstatus;

-- =====================================================
-- STEP 2: Update CrawlJob Status Enum (separate from ChapterStatus)
-- =====================================================

-- Create new enum type for crawl jobs
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crawl_job_status_new') THEN
        CREATE TYPE crawl_job_status_new AS ENUM ('PENDING', 'CRAWLING', 'COMPLETED', 'FAILED');
    END IF;
END $$;

-- Check if crawl_jobs table exists and has the old enum
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'crawl_jobs') THEN
        -- Map old statuses to new statuses for crawl_jobs
        UPDATE crawl_jobs SET status = 'PENDING' WHERE status = 'CREATED';
        UPDATE crawl_jobs SET status = 'COMPLETED' WHERE status IN ('CRAWLED', 'APPROVED', 'PUBLISHED');
        UPDATE crawl_jobs SET status = 'FAILED' WHERE status NOT IN ('PENDING', 'CRAWLING', 'COMPLETED', 'FAILED');
        
        -- Alter column
        ALTER TABLE crawl_jobs 
            ALTER COLUMN status DROP DEFAULT;
        
        ALTER TABLE crawl_jobs 
            ALTER COLUMN status TYPE crawl_job_status_new 
            USING status::text::crawl_job_status_new;
        
        ALTER TABLE crawl_jobs 
            ALTER COLUMN status SET DEFAULT 'PENDING';
    END IF;
END $$;

-- Drop old crawljobstatus enum if it exists and rename new one
DROP TYPE IF EXISTS crawljobstatus CASCADE;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crawl_job_status_new') THEN
        ALTER TYPE crawl_job_status_new RENAME TO crawljobstatus;
    END IF;
EXCEPTION WHEN others THEN
    NULL; -- Ignore if already renamed
END $$;

-- =====================================================
-- Verify migration
-- =====================================================
SELECT 'Chapter statuses after migration:' as info;
SELECT status, COUNT(*) FROM chapters GROUP BY status;

SELECT 'CrawlJob statuses after migration:' as info;
SELECT status, COUNT(*) FROM crawl_jobs GROUP BY status;
