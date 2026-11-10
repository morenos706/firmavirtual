-- CreateEnum
CREATE TYPE "RoleName" AS ENUM ('ADMIN', 'ORGANIZER');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'ACTIVE', 'FINALIZED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EventClassification" AS ENUM ('INTERNAL', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "ClosingStatus" AS ENUM ('NONE', 'IN_PROGRESS', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "DuplicateRule" AS ENUM ('DOCUMENT', 'DOCUMENT_AND_EMAIL');

-- CreateEnum
CREATE TYPE "OtpChannel" AS ENUM ('EMAIL', 'SMS');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('STARTED', 'OTP_VERIFIED', 'COMPLETED', 'VOIDED');

-- CreateEnum
CREATE TYPE "OtpStatus" AS ENUM ('PENDING', 'VERIFIED', 'EXPIRED', 'BLOCKED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "ConsentType" AS ENUM ('SIGNATURE_AGREEMENT', 'DATA_TREATMENT');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('ATTENDANCE_SHEET', 'ATTENDANCE_XLSX', 'RECEIPT', 'CLOSING_REPORT_PDF', 'CLOSING_REPORT_XLSX');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('USER', 'PARTICIPANT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "EmailJobStatus" AS ENUM ('PENDING', 'RETRYING', 'SENT_TO_PROVIDER', 'DELIVERED', 'REJECTED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'SMS');

-- CreateTable
CREATE TABLE "roles" (
    "id" SERIAL NOT NULL,
    "name" "RoleName" NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role_id" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "failed_logins" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "company_name" TEXT NOT NULL DEFAULT 'Mi Empresa S.A.S.',
    "company_nit" TEXT,
    "logo_path" TEXT,
    "logo_mime" TEXT,
    "format_code" TEXT NOT NULL DEFAULT '11020001F-01',
    "format_version" TEXT NOT NULL DEFAULT 'V0.6',
    "sheet_title" TEXT NOT NULL DEFAULT 'REGISTRO DE ASISTENCIA',
    "receipt_footer_note" TEXT,
    "support_email" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_texts" (
    "id" TEXT NOT NULL,
    "type" "ConsentType" NOT NULL,
    "version" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legal_texts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "program" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "related_document" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "trainer" TEXT NOT NULL,
    "institution" TEXT NOT NULL,
    "classification" "EventClassification" NOT NULL,
    "date" DATE NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "duration_hours" DECIMAL(5,2) NOT NULL,
    "location" TEXT NOT NULL,
    "organizer_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "status" "EventStatus" NOT NULL DEFAULT 'DRAFT',
    "otp_channel" "OtpChannel" NOT NULL DEFAULT 'EMAIL',
    "require_data_consent" BOOLEAN NOT NULL DEFAULT true,
    "duplicate_rule" "DuplicateRule" NOT NULL DEFAULT 'DOCUMENT',
    "closing_status" "ClosingStatus" NOT NULL DEFAULT 'NONE',
    "closing_report" JSONB,
    "closing_error" TEXT,
    "closed_at" TIMESTAMP(3),
    "closed_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_fields" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "event_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_qr" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "scans" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rotated_at" TIMESTAMP(3),
    "deactivated_at" TIMESTAMP(3),

    CONSTRAINT "event_qr_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendees" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "document_number_enc" TEXT NOT NULL,
    "document_number_hash" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "company" TEXT,
    "management" TEXT,
    "area" TEXT,
    "email" TEXT NOT NULL,
    "email_normalized" TEXT NOT NULL,
    "phone_enc" TEXT,
    "phone_last4" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_records" (
    "id" UUID NOT NULL,
    "evidence_code" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "attendee_id" TEXT NOT NULL,
    "status" "AttendanceStatus" NOT NULL DEFAULT 'STARTED',
    "sequence" INTEGER,
    "document_number_hash" TEXT NOT NULL,
    "email_normalized" TEXT NOT NULL,
    "registration_token_hash" TEXT NOT NULL,
    "registration_expires_at" TIMESTAMP(3) NOT NULL,
    "auth_method" TEXT,
    "auth_destination_masked" TEXT,
    "ip" TEXT,
    "user_agent" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "otp_verified_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "evidence_json" JSONB,
    "evidence_hash" TEXT,
    "voided_at" TIMESTAMP(3),
    "void_reason" TEXT,

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signatures" (
    "id" TEXT NOT NULL,
    "attendance_record_id" UUID NOT NULL,
    "image_path" TEXT NOT NULL,
    "image_sha256" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "stroke_count" INTEGER NOT NULL,
    "point_count" INTEGER NOT NULL,
    "draw_duration_ms" INTEGER,
    "pointer_type" TEXT,
    "device_info" JSONB,
    "ip" TEXT,
    "user_agent" TEXT,
    "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signatures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_verifications" (
    "id" TEXT NOT NULL,
    "attendance_record_id" UUID NOT NULL,
    "channel" "OtpChannel" NOT NULL,
    "destination_masked" TEXT NOT NULL,
    "destination_hash" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "status" "OtpStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verified_at" TIMESTAMP(3),
    "provider_message_id" TEXT,
    "ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_records" (
    "id" TEXT NOT NULL,
    "attendance_record_id" UUID NOT NULL,
    "type" "ConsentType" NOT NULL,
    "legal_text_id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "text_sha256" TEXT NOT NULL,
    "accepted" BOOLEAN NOT NULL,
    "accepted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "user_agent" TEXT,

    CONSTRAINT "consent_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL,
    "event_id" TEXT NOT NULL,
    "attendance_record_id" UUID,
    "verification_code" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "storage_path" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "is_final" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_type" "ActorType" NOT NULL,
    "actor_user_id" TEXT,
    "actor_label" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "event_id" TEXT,
    "ip" TEXT,
    "user_agent" TEXT,
    "details" JSONB,
    "prev_hash" TEXT NOT NULL,
    "hash" TEXT NOT NULL,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_jobs" (
    "id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'RECEIPT',
    "event_id" TEXT NOT NULL,
    "attendance_record_id" UUID,
    "document_id" TEXT,
    "recipient" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "EmailJobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_at" TIMESTAMP(3),
    "locked_by" TEXT,
    "last_error" TEXT,
    "provider" TEXT,
    "provider_message_id" TEXT,
    "sent_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "is_manual_resend" BOOLEAN NOT NULL DEFAULT false,
    "requested_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_logs" (
    "id" TEXT NOT NULL,
    "email_job_id" TEXT,
    "channel" "NotificationChannel" NOT NULL,
    "kind" TEXT NOT NULL,
    "recipient_masked" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "provider" TEXT,
    "provider_message_id" TEXT,
    "error" TEXT,
    "details" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_id_idx" ON "users"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE INDEX "legal_texts_type_active_idx" ON "legal_texts"("type", "active");

-- CreateIndex
CREATE UNIQUE INDEX "legal_texts_type_version_key" ON "legal_texts"("type", "version");

-- CreateIndex
CREATE UNIQUE INDEX "events_code_key" ON "events"("code");

-- CreateIndex
CREATE INDEX "events_status_idx" ON "events"("status");

-- CreateIndex
CREATE INDEX "events_organizer_id_idx" ON "events"("organizer_id");

-- CreateIndex
CREATE INDEX "events_date_idx" ON "events"("date");

-- CreateIndex
CREATE UNIQUE INDEX "event_fields_event_id_key_key" ON "event_fields"("event_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "event_qr_event_id_key" ON "event_qr"("event_id");

-- CreateIndex
CREATE UNIQUE INDEX "event_qr_token_key" ON "event_qr"("token");

-- CreateIndex
CREATE INDEX "attendees_event_id_document_number_hash_idx" ON "attendees"("event_id", "document_number_hash");

-- CreateIndex
CREATE INDEX "attendees_event_id_email_normalized_idx" ON "attendees"("event_id", "email_normalized");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_evidence_code_key" ON "attendance_records"("evidence_code");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_attendee_id_key" ON "attendance_records"("attendee_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_registration_token_hash_key" ON "attendance_records"("registration_token_hash");

-- CreateIndex
CREATE INDEX "attendance_records_event_id_status_idx" ON "attendance_records"("event_id", "status");

-- CreateIndex
CREATE INDEX "attendance_records_event_id_document_number_hash_idx" ON "attendance_records"("event_id", "document_number_hash");

-- CreateIndex
CREATE INDEX "attendance_records_event_id_email_normalized_idx" ON "attendance_records"("event_id", "email_normalized");

-- CreateIndex
CREATE UNIQUE INDEX "signatures_attendance_record_id_key" ON "signatures"("attendance_record_id");

-- CreateIndex
CREATE INDEX "otp_verifications_attendance_record_id_status_idx" ON "otp_verifications"("attendance_record_id", "status");

-- CreateIndex
CREATE INDEX "otp_verifications_destination_hash_created_at_idx" ON "otp_verifications"("destination_hash", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "consent_records_attendance_record_id_type_key" ON "consent_records"("attendance_record_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "documents_verification_code_key" ON "documents"("verification_code");

-- CreateIndex
CREATE UNIQUE INDEX "documents_idempotency_key_key" ON "documents"("idempotency_key");

-- CreateIndex
CREATE INDEX "documents_event_id_type_idx" ON "documents"("event_id", "type");

-- CreateIndex
CREATE INDEX "documents_attendance_record_id_idx" ON "documents"("attendance_record_id");

-- CreateIndex
CREATE INDEX "documents_sha256_idx" ON "documents"("sha256");

-- CreateIndex
CREATE UNIQUE INDEX "audit_logs_hash_key" ON "audit_logs"("hash");

-- CreateIndex
CREATE INDEX "audit_logs_event_id_idx" ON "audit_logs"("event_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_idx" ON "audit_logs"("actor_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "email_jobs_idempotency_key_key" ON "email_jobs"("idempotency_key");

-- CreateIndex
CREATE INDEX "email_jobs_status_next_attempt_at_idx" ON "email_jobs"("status", "next_attempt_at");

-- CreateIndex
CREATE INDEX "email_jobs_event_id_idx" ON "email_jobs"("event_id");

-- CreateIndex
CREATE INDEX "email_jobs_attendance_record_id_idx" ON "email_jobs"("attendance_record_id");

-- CreateIndex
CREATE INDEX "email_jobs_provider_message_id_idx" ON "email_jobs"("provider_message_id");

-- CreateIndex
CREATE INDEX "notification_logs_email_job_id_idx" ON "notification_logs"("email_job_id");

-- CreateIndex
CREATE INDEX "notification_logs_created_at_idx" ON "notification_logs"("created_at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legal_texts" ADD CONSTRAINT "legal_texts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_organizer_id_fkey" FOREIGN KEY ("organizer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_closed_by_id_fkey" FOREIGN KEY ("closed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_fields" ADD CONSTRAINT "event_fields_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_qr" ADD CONSTRAINT "event_qr_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendees" ADD CONSTRAINT "attendees_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_attendee_id_fkey" FOREIGN KEY ("attendee_id") REFERENCES "attendees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signatures" ADD CONSTRAINT "signatures_attendance_record_id_fkey" FOREIGN KEY ("attendance_record_id") REFERENCES "attendance_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "otp_verifications" ADD CONSTRAINT "otp_verifications_attendance_record_id_fkey" FOREIGN KEY ("attendance_record_id") REFERENCES "attendance_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_attendance_record_id_fkey" FOREIGN KEY ("attendance_record_id") REFERENCES "attendance_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_legal_text_id_fkey" FOREIGN KEY ("legal_text_id") REFERENCES "legal_texts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_attendance_record_id_fkey" FOREIGN KEY ("attendance_record_id") REFERENCES "attendance_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_jobs" ADD CONSTRAINT "email_jobs_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_jobs" ADD CONSTRAINT "email_jobs_attendance_record_id_fkey" FOREIGN KEY ("attendance_record_id") REFERENCES "attendance_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_jobs" ADD CONSTRAINT "email_jobs_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_email_job_id_fkey" FOREIGN KEY ("email_job_id") REFERENCES "email_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
