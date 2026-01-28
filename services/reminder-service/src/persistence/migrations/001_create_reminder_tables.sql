-- Migration: 001_create_reminder_tables
-- Description: Create Reminder table for Reminder Service
-- Date: 2026-01-18

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Reminder status enum
CREATE TYPE reminder_status AS ENUM ('pending', 'triggered', 'cancelled');

-- Reminder table
CREATE TABLE IF NOT EXISTS reminder (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID NOT NULL,
    user_id UUID NOT NULL,
    reminder_time TIMESTAMPTZ NOT NULL,
    status reminder_status NOT NULL DEFAULT 'pending',
    triggered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT triggered_at_on_triggered CHECK (
        (status = 'triggered' AND triggered_at IS NOT NULL) OR
        (status != 'triggered')
    )
);

-- Indexes
CREATE INDEX idx_reminder_user ON reminder(user_id);
CREATE INDEX idx_reminder_task ON reminder(task_id);
CREATE INDEX idx_reminder_pending ON reminder(reminder_time, status) WHERE status = 'pending';
CREATE INDEX idx_reminder_user_task ON reminder(user_id, task_id);

-- Unique constraint: one pending reminder per task at a specific time
CREATE UNIQUE INDEX idx_reminder_task_time_pending
    ON reminder(task_id, reminder_time)
    WHERE status = 'pending';
