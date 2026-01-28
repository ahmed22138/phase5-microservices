-- Migration: 001_create_recurrence_tables
-- Description: Create RecurrencePattern table for Recurrence Service
-- Date: 2026-01-18

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Frequency enum
CREATE TYPE recurrence_frequency AS ENUM ('daily', 'weekly', 'monthly', 'yearly');

-- Recurrence status enum
CREATE TYPE recurrence_status AS ENUM ('active', 'paused', 'completed');

-- RecurrencePattern table
CREATE TABLE IF NOT EXISTS recurrence_pattern (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID NOT NULL UNIQUE,
    user_id UUID NOT NULL,
    frequency recurrence_frequency NOT NULL,
    interval INTEGER NOT NULL DEFAULT 1,
    days_of_week INTEGER[],
    day_of_month INTEGER,
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ NOT NULL,
    status recurrence_status NOT NULL DEFAULT 'active',
    last_triggered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT interval_positive CHECK (interval >= 1),
    CONSTRAINT days_of_week_valid CHECK (
        days_of_week IS NULL OR
        (array_length(days_of_week, 1) > 0 AND
         days_of_week <@ ARRAY[0,1,2,3,4,5,6])
    ),
    CONSTRAINT day_of_month_valid CHECK (
        day_of_month IS NULL OR
        (day_of_month >= 1 AND day_of_month <= 31)
    ),
    CONSTRAINT end_date_after_start CHECK (
        end_date IS NULL OR end_date > start_date
    ),
    CONSTRAINT weekly_requires_days CHECK (
        frequency != 'weekly' OR days_of_week IS NOT NULL
    ),
    CONSTRAINT monthly_requires_day CHECK (
        frequency != 'monthly' OR day_of_month IS NOT NULL
    )
);

-- Indexes
CREATE UNIQUE INDEX idx_recurrence_task ON recurrence_pattern(task_id);
CREATE INDEX idx_recurrence_user ON recurrence_pattern(user_id);
CREATE INDEX idx_recurrence_next ON recurrence_pattern(next_run_at, status) WHERE status = 'active';
CREATE INDEX idx_recurrence_status ON recurrence_pattern(user_id, status);

-- Trigger function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_recurrence_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for recurrence_pattern table
CREATE TRIGGER recurrence_pattern_updated_at_trigger
    BEFORE UPDATE ON recurrence_pattern
    FOR EACH ROW
    EXECUTE FUNCTION update_recurrence_updated_at_column();
