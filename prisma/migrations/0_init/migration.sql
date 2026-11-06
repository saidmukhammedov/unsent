-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('ANONYMOUS', 'REGISTERED');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'MODERATOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "LetterVisibility" AS ENUM ('PRIVATE', 'PUBLIC');

-- CreateEnum
CREATE TYPE "EntryType" AS ENUM ('LETTER', 'NOTE', 'RESPONSE');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('PENDING', 'REVIEWED', 'DISMISSED', 'REMOVED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "unsent_id" VARCHAR(64) NOT NULL,
    "account_type" "AccountType" NOT NULL DEFAULT 'ANONYMOUS',
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "recovery_token_id" VARCHAR(32) NOT NULL,
    "recovery_key_hash" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(20),
    "password_hash" VARCHAR(255),
    "phone_verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "ip_hash" VARCHAR(64),
    "user_agent" VARCHAR(512),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "letters" (
    "id" UUID NOT NULL,
    "author_id" UUID,
    "entry_type" "EntryType" NOT NULL DEFAULT 'LETTER',
    "visibility" "LetterVisibility" NOT NULL DEFAULT 'PRIVATE',
    "title" VARCHAR(200),
    "recipient_name" VARCHAR(100),
    "content" TEXT NOT NULL,
    "theme" VARCHAR(50),
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_moderated" BOOLEAN NOT NULL DEFAULT false,
    "moderation_reason" VARCHAR(255),
    "moderation_status" VARCHAR(50) DEFAULT 'UNMODERATED',
    "moderated_at" TIMESTAMP(3),
    "moderator_id" UUID,
    "parent_letter_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "letters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_letters" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "letter_id" UUID NOT NULL,
    "private_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_letters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "letter_id" UUID,
    "idempotency_key" VARCHAR(128),
    "payload" JSONB,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL,
    "reporter_id" UUID,
    "letter_id" UUID NOT NULL,
    "reason" VARCHAR(100) NOT NULL,
    "details" VARCHAR(500),
    "status" "ReportStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moderation_logs" (
    "id" UUID NOT NULL,
    "letter_id" UUID NOT NULL,
    "moderator_id" UUID,
    "action" VARCHAR(50) NOT NULL,
    "reason" VARCHAR(255),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moderation_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_unsent_id_key" ON "users"("unsent_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_recovery_token_id_key" ON "users"("recovery_token_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_token_hash_idx" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "letters_visibility_entry_type_is_moderated_created_at_idx" ON "letters"("visibility", "entry_type", "is_moderated", "created_at" DESC);

-- CreateIndex
CREATE INDEX "letters_visibility_entry_type_is_moderated_theme_created_at_idx" ON "letters"("visibility", "entry_type", "is_moderated", "theme", "created_at" DESC);

-- CreateIndex
CREATE INDEX "letters_author_id_entry_type_created_at_idx" ON "letters"("author_id", "entry_type", "created_at" DESC);

-- CreateIndex
CREATE INDEX "letters_parent_letter_id_idx" ON "letters"("parent_letter_id");

-- CreateIndex
CREATE INDEX "letters_parent_letter_id_is_moderated_created_at_idx" ON "letters"("parent_letter_id", "is_moderated", "created_at" ASC);

-- CreateIndex
CREATE INDEX "letters_moderation_status_idx" ON "letters"("moderation_status");

-- CreateIndex
CREATE INDEX "saved_letters_user_id_idx" ON "saved_letters"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "saved_letters_user_id_letter_id_key" ON "saved_letters"("user_id", "letter_id");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_idempotency_key_key" ON "notifications"("idempotency_key");

-- CreateIndex
CREATE INDEX "notifications_user_id_is_read_created_at_idx" ON "notifications"("user_id", "is_read", "created_at" DESC);

-- CreateIndex
CREATE INDEX "reports_letter_id_status_idx" ON "reports"("letter_id", "status");

-- CreateIndex
CREATE INDEX "reports_reporter_id_letter_id_idx" ON "reports"("reporter_id", "letter_id");

-- CreateIndex
CREATE INDEX "moderation_logs_letter_id_created_at_idx" ON "moderation_logs"("letter_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "moderation_logs_moderator_id_idx" ON "moderation_logs"("moderator_id");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "letters" ADD CONSTRAINT "letters_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "letters" ADD CONSTRAINT "letters_parent_letter_id_fkey" FOREIGN KEY ("parent_letter_id") REFERENCES "letters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_letters" ADD CONSTRAINT "saved_letters_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_letters" ADD CONSTRAINT "saved_letters_letter_id_fkey" FOREIGN KEY ("letter_id") REFERENCES "letters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_letter_id_fkey" FOREIGN KEY ("letter_id") REFERENCES "letters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_logs" ADD CONSTRAINT "moderation_logs_letter_id_fkey" FOREIGN KEY ("letter_id") REFERENCES "letters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_logs" ADD CONSTRAINT "moderation_logs_moderator_id_fkey" FOREIGN KEY ("moderator_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
