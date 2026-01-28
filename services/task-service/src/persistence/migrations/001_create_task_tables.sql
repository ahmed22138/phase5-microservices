-- Migration: 001_create_task_tables
-- Description: Create Task, Tag, and TaskTag tables for Task Service
-- Date: 2026-01-18

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Priority enum
CREATE TYPE task_priority AS ENUM ('low', 'medium', 'high', 'urgent');

-- Status enum
CREATE TYPE task_status AS ENUM ('pending', 'in_progress', 'completed', 'cancelled');

-- Task table
CREATE TABLE IF NOT EXISTS task (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    priority task_priority NOT NULL DEFAULT 'medium',
    status task_status NOT NULL DEFAULT 'pending',
    due_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    is_recurring BOOLEAN NOT NULL DEFAULT FALSE,
    parent_task_id UUID REFERENCES task(id) ON DELETE SET NULL,

    CONSTRAINT title_not_empty CHECK (LENGTH(TRIM(title)) > 0)
);

-- Tag table
CREATE TABLE IF NOT EXISTS tag (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    name VARCHAR(50) NOT NULL,
    usage_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT tag_name_format CHECK (name ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    CONSTRAINT tag_usage_non_negative CHECK (usage_count >= 0),
    CONSTRAINT tag_user_name_unique UNIQUE (user_id, name)
);

-- TaskTag join table
CREATE TABLE IF NOT EXISTS task_tag (
    task_id UUID NOT NULL REFERENCES task(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES tag(id) ON DELETE CASCADE,
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (task_id, tag_id)
);

-- Indexes for Task table
CREATE INDEX idx_task_user_status ON task(user_id, status);
CREATE INDEX idx_task_user_priority ON task(user_id, priority);
CREATE INDEX idx_task_user_due ON task(user_id, due_date) WHERE due_date IS NOT NULL;
CREATE INDEX idx_task_fulltext ON task USING gin(to_tsvector('english', title || ' ' || COALESCE(description, '')));
CREATE INDEX idx_task_parent ON task(parent_task_id) WHERE parent_task_id IS NOT NULL;
CREATE INDEX idx_task_recurring ON task(user_id, is_recurring) WHERE is_recurring = TRUE;

-- Indexes for Tag table (unique constraint already creates index)
-- Additional index for usage count ordering
CREATE INDEX idx_tag_user_usage ON tag(user_id, usage_count DESC);

-- Indexes for TaskTag table
CREATE INDEX idx_tasktag_tag ON task_tag(tag_id);

-- Trigger function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for task table
CREATE TRIGGER task_updated_at_trigger
    BEFORE UPDATE ON task
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger function to update tag usage count on task_tag changes
CREATE OR REPLACE FUNCTION update_tag_usage_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE tag SET usage_count = usage_count + 1 WHERE id = NEW.tag_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE tag SET usage_count = usage_count - 1 WHERE id = OLD.tag_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Triggers for task_tag table
CREATE TRIGGER task_tag_insert_trigger
    AFTER INSERT ON task_tag
    FOR EACH ROW
    EXECUTE FUNCTION update_tag_usage_count();

CREATE TRIGGER task_tag_delete_trigger
    AFTER DELETE ON task_tag
    FOR EACH ROW
    EXECUTE FUNCTION update_tag_usage_count();
