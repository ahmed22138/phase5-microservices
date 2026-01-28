-- Migration: 001_create_domain_event_tables
-- Description: Create DomainEvent hypertable for Audit Service (TimescaleDB)
-- Date: 2026-01-18

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- DomainEvent table
CREATE TABLE IF NOT EXISTS domain_event (
    id UUID NOT NULL DEFAULT uuid_generate_v4(),
    event_type VARCHAR(100) NOT NULL,
    aggregate_type VARCHAR(50) NOT NULL,
    aggregate_id UUID NOT NULL,
    user_id UUID NOT NULL,
    correlation_id UUID NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    payload JSONB NOT NULL,
    metadata JSONB,

    PRIMARY KEY (id, timestamp)
);

-- Convert to TimescaleDB hypertable with monthly partitioning
SELECT create_hypertable(
    'domain_event',
    'timestamp',
    chunk_time_interval => INTERVAL '1 month',
    if_not_exists => TRUE
);

-- Indexes
CREATE INDEX idx_event_correlation ON domain_event(correlation_id, timestamp DESC);
CREATE INDEX idx_event_aggregate ON domain_event(aggregate_type, aggregate_id, timestamp DESC);
CREATE INDEX idx_event_user ON domain_event(user_id, timestamp DESC);
CREATE INDEX idx_event_type ON domain_event(event_type, timestamp DESC);
CREATE INDEX idx_event_payload ON domain_event USING gin(payload);

-- Create continuous aggregate for event counts (optional, for dashboards)
CREATE MATERIALIZED VIEW IF NOT EXISTS event_counts_hourly
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', timestamp) AS bucket,
    event_type,
    aggregate_type,
    COUNT(*) as event_count
FROM domain_event
GROUP BY bucket, event_type, aggregate_type
WITH NO DATA;

-- Refresh policy for continuous aggregate
SELECT add_continuous_aggregate_policy('event_counts_hourly',
    start_offset => INTERVAL '1 day',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour',
    if_not_exists => TRUE
);

-- Retention policy: keep data for 90 days
SELECT add_retention_policy('domain_event',
    drop_after => INTERVAL '90 days',
    if_not_exists => TRUE
);

-- Compression policy: compress chunks older than 7 days
ALTER TABLE domain_event SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'aggregate_type,event_type'
);

SELECT add_compression_policy('domain_event',
    compress_after => INTERVAL '7 days',
    if_not_exists => TRUE
);
