-- scripts/setupOpenSanctionsDB.sql
-- PostgreSQL setup script for OpenSanctions production database

-- Create database (run as superuser)
-- CREATE DATABASE opensanctions;
-- \c opensanctions;

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm; -- For fuzzy text matching
CREATE EXTENSION IF NOT EXISTS btree_gin; -- For combined indexes

-- Main entities table
CREATE TABLE IF NOT EXISTS opensanctions_entities (
    id VARCHAR(255) PRIMARY KEY,
    schema VARCHAR(50) NOT NULL,
    name VARCHAR(500) NOT NULL,
    name_normalized VARCHAR(500),
    type VARCHAR(50),
    datasets TEXT[] DEFAULT '{}',
    nationality VARCHAR(3),
    date_of_birth DATE,
    place_of_birth TEXT,
    gender VARCHAR(10),
    notes TEXT,
    last_seen TIMESTAMP,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    score FLOAT DEFAULT 0,
    data JSONB -- Full entity data from OpenSanctions
);

-- Aliases table
CREATE TABLE IF NOT EXISTS opensanctions_aliases (
    id SERIAL PRIMARY KEY,
    entity_id VARCHAR(255) REFERENCES opensanctions_entities(id) ON DELETE CASCADE,
    alias VARCHAR(500) NOT NULL,
    alias_normalized VARCHAR(500),
    type VARCHAR(50) DEFAULT 'alias' -- 'name', 'alias', 'weak_alias', 'previous_name'
);

-- Identifiers table (passports, national IDs, etc.)
CREATE TABLE IF NOT EXISTS opensanctions_identifiers (
    id SERIAL PRIMARY KEY,
    entity_id VARCHAR(255) REFERENCES opensanctions_entities(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL, -- 'passport', 'national_id', 'tax_id', 'registration_number'
    value VARCHAR(255) NOT NULL,
    country VARCHAR(3),
    issued_date DATE,
    expiry_date DATE
);

-- Addresses table
CREATE TABLE IF NOT EXISTS opensanctions_addresses (
    id SERIAL PRIMARY KEY,
    entity_id VARCHAR(255) REFERENCES opensanctions_entities(id) ON DELETE CASCADE,
    full_address TEXT,
    street TEXT,
    city VARCHAR(255),
    region VARCHAR(255),
    postal_code VARCHAR(50),
    country VARCHAR(3),
    lat NUMERIC(10, 6),
    lng NUMERIC(10, 6)
);

-- Sanctions information table
CREATE TABLE IF NOT EXISTS opensanctions_sanctions (
    id SERIAL PRIMARY KEY,
    entity_id VARCHAR(255) REFERENCES opensanctions_entities(id) ON DELETE CASCADE,
    program VARCHAR(255),
    authority VARCHAR(255),
    reason TEXT,
    start_date DATE,
    end_date DATE,
    is_active BOOLEAN DEFAULT true
);

-- Search audit log
CREATE TABLE IF NOT EXISTS opensanctions_search_log (
    id SERIAL PRIMARY KEY,
    search_term VARCHAR(500) NOT NULL,
    normalized_term VARCHAR(500),
    user_id VARCHAR(255),
    ip_address INET,
    results_count INTEGER DEFAULT 0,
    has_matches BOOLEAN DEFAULT false,
    search_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    duration_ms INTEGER,
    options JSONB
);

-- Import history
CREATE TABLE IF NOT EXISTS opensanctions_import_history (
    id SERIAL PRIMARY KEY,
    import_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    dataset VARCHAR(50),
    entities_count INTEGER,
    new_entities INTEGER,
    updated_entities INTEGER,
    deleted_entities INTEGER,
    duration_seconds INTEGER,
    file_size_bytes BIGINT,
    status VARCHAR(20) DEFAULT 'in_progress', -- 'in_progress', 'completed', 'failed'
    error_message TEXT
);

-- Create indexes for performance
-- Name search indexes (using trigram for fuzzy matching)
CREATE INDEX IF NOT EXISTS idx_entities_name_normalized_trgm 
    ON opensanctions_entities USING gin(name_normalized gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_aliases_normalized_trgm 
    ON opensanctions_aliases USING gin(alias_normalized gin_trgm_ops);

-- Regular B-tree indexes
CREATE INDEX IF NOT EXISTS idx_entities_type ON opensanctions_entities(type);
CREATE INDEX IF NOT EXISTS idx_entities_nationality ON opensanctions_entities(nationality);
CREATE INDEX IF NOT EXISTS idx_entities_datasets ON opensanctions_entities USING gin(datasets);
CREATE INDEX IF NOT EXISTS idx_entities_last_updated ON opensanctions_entities(last_updated);

CREATE INDEX IF NOT EXISTS idx_aliases_entity_id ON opensanctions_aliases(entity_id);
CREATE INDEX IF NOT EXISTS idx_identifiers_entity_id ON opensanctions_identifiers(entity_id);
CREATE INDEX IF NOT EXISTS idx_identifiers_value ON opensanctions_identifiers(value);
CREATE INDEX IF NOT EXISTS idx_addresses_entity_id ON opensanctions_addresses(entity_id);
CREATE INDEX IF NOT EXISTS idx_addresses_country ON opensanctions_addresses(country);
CREATE INDEX IF NOT EXISTS idx_sanctions_entity_id ON opensanctions_sanctions(entity_id);
CREATE INDEX IF NOT EXISTS idx_sanctions_program ON opensanctions_sanctions(program);

-- Full-text search indexes
CREATE INDEX IF NOT EXISTS idx_entities_name_fts 
    ON opensanctions_entities USING gin(to_tsvector('english', name));

CREATE INDEX IF NOT EXISTS idx_aliases_fts 
    ON opensanctions_aliases USING gin(to_tsvector('english', alias));

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_entities_type_nationality 
    ON opensanctions_entities(type, nationality);

CREATE INDEX IF NOT EXISTS idx_search_log_timestamp_user 
    ON opensanctions_search_log(search_timestamp DESC, user_id);

-- Functions for data management
-- Function to normalize names
CREATE OR REPLACE FUNCTION normalize_name(input_name TEXT)
RETURNS TEXT AS $$
BEGIN
    RETURN LOWER(
        REGEXP_REPLACE(
            TRIM(input_name),
            '[^a-z0-9\s]+',
            '',
            'gi'
        )
    );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Trigger to automatically normalize names
CREATE OR REPLACE FUNCTION update_normalized_names()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_TABLE_NAME = 'opensanctions_entities' THEN
        NEW.name_normalized = normalize_name(NEW.name);
    ELSIF TG_TABLE_NAME = 'opensanctions_aliases' THEN
        NEW.alias_normalized = normalize_name(NEW.alias);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers
DROP TRIGGER IF EXISTS update_entity_normalized_name ON opensanctions_entities;
CREATE TRIGGER update_entity_normalized_name
    BEFORE INSERT OR UPDATE ON opensanctions_entities
    FOR EACH ROW
    EXECUTE FUNCTION update_normalized_names();

DROP TRIGGER IF EXISTS update_alias_normalized_name ON opensanctions_aliases;
CREATE TRIGGER update_alias_normalized_name
    BEFORE INSERT OR UPDATE ON opensanctions_aliases
    FOR EACH ROW
    EXECUTE FUNCTION update_normalized_names();

-- Function to search entities with fuzzy matching
CREATE OR REPLACE FUNCTION search_opensanctions(
    search_term TEXT,
    threshold FLOAT DEFAULT 0.3,
    max_results INTEGER DEFAULT 100
)
RETURNS TABLE (
    entity_id VARCHAR(255),
    entity_name VARCHAR(500),
    match_type VARCHAR(20),
    matched_name VARCHAR(500),
    similarity_score FLOAT,
    entity_type VARCHAR(50),
    nationality VARCHAR(3),
    datasets TEXT[]
) AS $$
BEGIN
    RETURN QUERY
    WITH normalized_search AS (
        SELECT normalize_name(search_term) as search_normalized
    ),
    matches AS (
        -- Direct entity name matches
        SELECT 
            e.id,
            e.name,
            'primary'::VARCHAR(20) as match_type,
            e.name as matched_name,
            similarity(e.name_normalized, ns.search_normalized) as score,
            e.type,
            e.nationality,
            e.datasets
        FROM opensanctions_entities e, normalized_search ns
        WHERE e.name_normalized % ns.search_normalized
        
        UNION
        
        -- Alias matches
        SELECT 
            e.id,
            e.name,
            'alias'::VARCHAR(20) as match_type,
            a.alias as matched_name,
            similarity(a.alias_normalized, ns.search_normalized) as score,
            e.type,
            e.nationality,
            e.datasets
        FROM opensanctions_entities e
        JOIN opensanctions_aliases a ON e.id = a.entity_id, normalized_search ns
        WHERE a.alias_normalized % ns.search_normalized
    )
    SELECT DISTINCT ON (id)
        id,
        name,
        match_type,
        matched_name,
        score,
        type,
        nationality,
        datasets
    FROM matches
    WHERE score >= threshold
    ORDER BY id, score DESC
    LIMIT max_results;
END;
$$ LANGUAGE plpgsql;

-- Create materialized view for statistics (refresh periodically)
CREATE MATERIALIZED VIEW IF NOT EXISTS opensanctions_statistics AS
SELECT 
    COUNT(*) as total_entities,
    COUNT(*) FILTER (WHERE type = 'individual') as individuals,
    COUNT(*) FILTER (WHERE type = 'entity') as organizations,
    COUNT(*) FILTER (WHERE type = 'vessel') as vessels,
    COUNT(*) FILTER (WHERE type = 'aircraft') as aircraft,
    COUNT(DISTINCT nationality) as unique_nationalities,
    array_length(array_agg(DISTINCT unnest(datasets)), 1) as unique_datasets,
    MAX(last_updated) as last_update
FROM opensanctions_entities;

-- Create index on materialized view
CREATE UNIQUE INDEX IF NOT EXISTS idx_opensanctions_statistics ON opensanctions_statistics(total_entities);

-- Grant permissions (adjust as needed)
-- GRANT SELECT ON ALL TABLES IN SCHEMA public TO opensanctions_reader;
-- GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO opensanctions_writer;
-- GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO opensanctions_writer;

-- Maintenance queries
-- VACUUM ANALYZE opensanctions_entities;
-- VACUUM ANALYZE opensanctions_aliases;
-- REFRESH MATERIALIZED VIEW CONCURRENTLY opensanctions_statistics;