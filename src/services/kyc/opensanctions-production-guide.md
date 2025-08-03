# OpenSanctions Production Implementation Guide

## Overview

This guide covers implementing OpenSanctions for production AML/PEP screening with optimal performance, reliability, and maintainability.

## Architecture Components

### 1. Database Design

Instead of processing a 2.4GB file on every search, use a database:

```sql
-- PostgreSQL Schema
CREATE TABLE opensanctions_entities (
    id VARCHAR(255) PRIMARY KEY,
    schema VARCHAR(50),
    name VARCHAR(500) NOT NULL,
    name_normalized VARCHAR(500),
    type VARCHAR(50),
    datasets TEXT[], -- Array of dataset names
    nationality VARCHAR(3),
    date_of_birth DATE,
    place_of_birth TEXT,
    gender VARCHAR(10),
    notes TEXT,
    last_seen TIMESTAMP,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    score FLOAT,
    data JSONB -- Full entity data
);

CREATE TABLE opensanctions_aliases (
    id SERIAL PRIMARY KEY,
    entity_id VARCHAR(255) REFERENCES opensanctions_entities(id),
    alias VARCHAR(500) NOT NULL,
    alias_normalized VARCHAR(500),
    type VARCHAR(50) -- 'name', 'alias', 'weak_alias', 'previous_name'
);

CREATE TABLE opensanctions_identifiers (
    id SERIAL PRIMARY KEY,
    entity_id VARCHAR(255) REFERENCES opensanctions_entities(id),
    type VARCHAR(50), -- 'passport', 'national_id', 'tax_id', etc.
    value VARCHAR(255)
);

CREATE TABLE opensanctions_addresses (
    id SERIAL PRIMARY KEY,
    entity_id VARCHAR(255) REFERENCES opensanctions_entities(id),
    full_address TEXT,
    country VARCHAR(3),
    city VARCHAR(255),
    postal_code VARCHAR(50)
);

CREATE TABLE opensanctions_sanctions (
    id SERIAL PRIMARY KEY,
    entity_id VARCHAR(255) REFERENCES opensanctions_entities(id),
    program VARCHAR(255),
    authority VARCHAR(255),
    reason TEXT,
    start_date DATE,
    end_date DATE
);

-- Indexes for performance
CREATE INDEX idx_entities_name_normalized ON opensanctions_entities(name_normalized);
CREATE INDEX idx_entities_type ON opensanctions_entities(type);
CREATE INDEX idx_entities_nationality ON opensanctions_entities(nationality);
CREATE INDEX idx_entities_datasets ON opensanctions_entities USING GIN(datasets);
CREATE INDEX idx_aliases_normalized ON opensanctions_aliases(alias_normalized);
CREATE INDEX idx_identifiers_value ON opensanctions_identifiers(value);

-- Full-text search indexes
CREATE INDEX idx_entities_name_fts ON opensanctions_entities USING gin(to_tsvector('english', name));
CREATE INDEX idx_aliases_fts ON opensanctions_aliases USING gin(to_tsvector('english', alias));
```

### 2. Data Import Service

```javascript
// src/services/kyc/opensanctions/OpenSanctionsImporter.js

import { Pool } from 'pg';
import { createReadStream } from 'fs';
import { pipeline } from 'stream/promises';
import { Transform } from 'stream';
import readline from 'readline';

export class OpenSanctionsImporter {
  constructor(dbConfig) {
    this.pool = new Pool(dbConfig);
    this.batchSize = 1000;
    this.processed = 0;
  }

  async importDataset(filePath) {
    console.log('[Importer] Starting import...');
    
    // Create tables if not exist
    await this.createTables();
    
    // Start transaction
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Clear old data
      await client.query('TRUNCATE opensanctions_entities CASCADE');
      
      // Stream and import
      const stream = createReadStream(filePath);
      const rl = readline.createInterface({
        input: stream,
        crlfDelay: Infinity
      });

      let batch = [];
      
      for await (const line of rl) {
        if (line.trim()) {
          try {
            const entity = JSON.parse(line);
            batch.push(entity);
            
            if (batch.length >= this.batchSize) {
              await this.insertBatch(client, batch);
              batch = [];
              
              this.processed += this.batchSize;
              console.log(`[Importer] Processed ${this.processed} entities...`);
            }
          } catch (error) {
            console.error('[Importer] Error parsing line:', error);
          }
        }
      }
      
      // Insert remaining batch
      if (batch.length > 0) {
        await this.insertBatch(client, batch);
      }
      
      await client.query('COMMIT');
      console.log(`[Importer] Import completed. Total: ${this.processed} entities`);
      
      // Update statistics
      await this.updateStatistics(client);
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async insertBatch(client, entities) {
    for (const entity of entities) {
      const transformed = this.transformEntity(entity);
      
      // Insert main entity
      await client.query(`
        INSERT INTO opensanctions_entities 
        (id, schema, name, name_normalized, type, datasets, nationality, 
         date_of_birth, place_of_birth, gender, notes, last_seen, score, data)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT (id) DO UPDATE SET
          schema = EXCLUDED.schema,
          name = EXCLUDED.name,
          name_normalized = EXCLUDED.name_normalized,
          last_updated = CURRENT_TIMESTAMP
      `, [
        transformed.id,
        transformed.schema,
        transformed.name,
        this.normalize(transformed.name),
        transformed.type,
        transformed.datasets,
        transformed.nationality,
        transformed.dateOfBirth,
        transformed.placeOfBirth,
        transformed.gender,
        transformed.notes,
        transformed.lastSeen,
        transformed.score,
        JSON.stringify(entity)
      ]);
      
      // Insert aliases
      for (const alias of transformed.aliases) {
        await client.query(`
          INSERT INTO opensanctions_aliases (entity_id, alias, alias_normalized, type)
          VALUES ($1, $2, $3, $4)
        `, [transformed.id, alias, this.normalize(alias), 'alias']);
      }
      
      // Insert identifiers
      for (const [type, values] of Object.entries(transformed.identifiers)) {
        for (const value of (Array.isArray(values) ? values : [values])) {
          await client.query(`
            INSERT INTO opensanctions_identifiers (entity_id, type, value)
            VALUES ($1, $2, $3)
          `, [transformed.id, type, value]);
        }
      }
      
      // Insert addresses
      for (const address of transformed.addresses) {
        await client.query(`
          INSERT INTO opensanctions_addresses (entity_id, full_address, country, city)
          VALUES ($1, $2, $3, $4)
        `, [transformed.id, address.full, address.country, address.city]);
      }
      
      // Insert sanctions
      if (transformed.sanctions) {
        await client.query(`
          INSERT INTO opensanctions_sanctions 
          (entity_id, program, authority, reason, start_date, end_date)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          transformed.id,
          transformed.sanctions.programs?.join(', '),
          transformed.sanctions.authority?.join(', '),
          transformed.sanctions.reason,
          transformed.sanctions.startDate,
          transformed.sanctions.endDate
        ]);
      }
    }
  }

  normalize(text) {
    if (!text) return '';
    return text.toLowerCase().trim().replace(/[^\w\s]/g, '');
  }

  transformEntity(entity) {
    // Transform to match our OpenSanctionsDownloader format
    const properties = entity.properties || {};
    
    return {
      id: entity.id,
      schema: entity.schema,
      name: properties.name?.[0] || 'Unknown',
      type: this.determineType(entity.schema),
      nationality: properties.nationality?.[0],
      dateOfBirth: this.extractDate(properties.birthDate),
      placeOfBirth: properties.birthPlace?.[0],
      gender: properties.gender?.[0],
      identifiers: this.extractIdentifiers(properties),
      addresses: this.extractAddresses(properties),
      sanctions: this.extractSanctions(properties),
      notes: properties.notes?.[0],
      lastSeen: entity.last_seen,
      datasets: entity.datasets || [],
      score: entity.score || 0,
      aliases: this.extractAliases(properties)
    };
  }

  // ... helper methods same as OpenSanctionsDownloader
}
```

### 3. Search API Service

```javascript
// src/services/kyc/opensanctions/OpenSanctionsSearchService.js

import { Pool } from 'pg';
import { fuzzyMatcher } from '../utils/fuzzyMatcher.js';
import Redis from 'ioredis';

export class OpenSanctionsSearchService {
  constructor(dbConfig, redisConfig) {
    this.pool = new Pool(dbConfig);
    this.redis = new Redis(redisConfig);
    this.cacheExpiry = 3600; // 1 hour
  }

  async search(name, options = {}) {
    const {
      threshold = 0.75,
      limit = 100,
      includeAliases = true,
      datasets = null,
      entityType = null
    } = options;

    // Check cache
    const cacheKey = `search:${name}:${JSON.stringify(options)}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Normalize search name
    const normalizedName = this.normalize(name);
    
    // Build query
    let query = `
      WITH name_matches AS (
        -- Direct name matches
        SELECT DISTINCT ON (e.id)
          e.*,
          'primary_name' as match_type,
          e.name as matched_name,
          similarity(e.name_normalized, $1) as match_score
        FROM opensanctions_entities e
        WHERE e.name_normalized % $1  -- Trigram similarity
        ${entityType ? 'AND e.type = $2' : ''}
        ${datasets ? 'AND e.datasets && $3' : ''}
        
        UNION ALL
        
        -- Alias matches
        SELECT DISTINCT ON (e.id)
          e.*,
          'alias' as match_type,
          a.alias as matched_name,
          similarity(a.alias_normalized, $1) as match_score
        FROM opensanctions_entities e
        JOIN opensanctions_aliases a ON e.id = a.entity_id
        WHERE a.alias_normalized % $1
        ${entityType ? 'AND e.type = $2' : ''}
        ${datasets ? 'AND e.datasets && $3' : ''}
      )
      SELECT * FROM name_matches
      WHERE match_score > $4
      ORDER BY match_score DESC
      LIMIT $5
    `;

    const params = [normalizedName];
    if (entityType) params.push(entityType);
    if (datasets) params.push(datasets);
    params.push(threshold);
    params.push(limit);

    const result = await this.pool.query(query, params);
    
    // Enhance with fuzzy matching scores
    const enhancedResults = result.rows.map(row => {
      const fuzzyResult = fuzzyMatcher.match(name, row.matched_name, { threshold });
      
      return {
        entity: {
          id: row.id,
          name: row.name,
          type: row.type,
          nationality: row.nationality,
          dateOfBirth: row.date_of_birth,
          datasets: row.datasets,
          score: row.score
        },
        matchType: row.match_type,
        matchedName: row.matched_name,
        dbScore: row.match_score,
        fuzzyScore: fuzzyResult.score,
        finalScore: (row.match_score + fuzzyResult.score) / 2,
        fuzzyMatchType: fuzzyResult.matchType,
        confidence: fuzzyResult.confidence
      };
    });

    // Sort by final score
    enhancedResults.sort((a, b) => b.finalScore - a.finalScore);

    // Cache results
    await this.redis.setex(cacheKey, this.cacheExpiry, JSON.stringify(enhancedResults));

    return enhancedResults;
  }

  async getEntity(id) {
    const query = `
      SELECT 
        e.*,
        array_agg(DISTINCT a.alias) as aliases,
        json_agg(DISTINCT jsonb_build_object(
          'type', i.type,
          'value', i.value
        )) as identifiers,
        json_agg(DISTINCT jsonb_build_object(
          'full_address', addr.full_address,
          'country', addr.country,
          'city', addr.city
        )) as addresses
      FROM opensanctions_entities e
      LEFT JOIN opensanctions_aliases a ON e.id = a.entity_id
      LEFT JOIN opensanctions_identifiers i ON e.id = i.entity_id
      LEFT JOIN opensanctions_addresses addr ON e.id = addr.entity_id
      WHERE e.id = $1
      GROUP BY e.id
    `;

    const result = await this.pool.query(query, [id]);
    return result.rows[0];
  }

  normalize(text) {
    if (!text) return '';
    return text.toLowerCase().trim().replace(/[^\w\s]/g, '');
  }
}
```

### 4. Update Service (Incremental Updates)

```javascript
// src/services/kyc/opensanctions/OpenSanctionsUpdateService.js

import { OpenSanctionsDownloader } from '../utils/openSanctionsDownloader.js';
import { OpenSanctionsImporter } from './OpenSanctionsImporter.js';
import cron from 'node-cron';
import { EventEmitter } from 'events';

export class OpenSanctionsUpdateService extends EventEmitter {
  constructor(dbConfig) {
    super();
    this.downloader = new OpenSanctionsDownloader();
    this.importer = new OpenSanctionsImporter(dbConfig);
    this.updating = false;
  }

  async initialize() {
    await this.downloader.initialize();
    
    // Check for updates on startup
    await this.checkAndUpdate();
    
    // Schedule daily updates at 2 AM
    cron.schedule('0 2 * * *', async () => {
      await this.checkAndUpdate();
    });
  }

  async checkAndUpdate() {
    if (this.updating) {
      console.log('[UpdateService] Update already in progress');
      return;
    }

    this.updating = true;
    this.emit('update:started');

    try {
      // Check if update needed
      const needsUpdate = await this.downloader.needsUpdate('default');
      
      if (needsUpdate) {
        console.log('[UpdateService] Downloading new OpenSanctions data...');
        
        // Download latest data
        await this.downloader.downloadDataset('default');
        
        // Import to database
        const filePath = path.join(
          this.downloader.dataDir, 
          this.downloader.datasets.default.file
        );
        
        await this.importer.importDataset(filePath);
        
        this.emit('update:completed', {
          timestamp: new Date(),
          entities: this.importer.processed
        });
        
        // Clean up old file after successful import
        await this.cleanupOldFiles();
      } else {
        console.log('[UpdateService] Data is up to date');
        this.emit('update:skipped', { reason: 'up_to_date' });
      }
    } catch (error) {
      console.error('[UpdateService] Update failed:', error);
      this.emit('update:failed', { error });
    } finally {
      this.updating = false;
    }
  }

  async cleanupOldFiles() {
    // Keep only the latest file to save disk space
    // Implementation depends on your retention policy
  }
}
```

### 5. REST API Endpoints

```javascript
// src/api/routes/sanctions.js

import express from 'express';
import { OpenSanctionsSearchService } from '../../services/kyc/opensanctions/OpenSanctionsSearchService.js';
import { authenticate } from '../../middleware/auth.js';
import { validateInput } from '../../middleware/validation.js';
import { rateLimit } from 'express-rate-limit';

const router = express.Router();
const searchService = new OpenSanctionsSearchService(dbConfig, redisConfig);

// Rate limiting for API
const searchLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60 // 60 requests per minute
});

/**
 * @route POST /api/sanctions/search
 * @desc Search for sanctioned entities
 */
router.post('/search',
  authenticate,
  searchLimiter,
  validateInput({
    name: 'required|string|min:2',
    threshold: 'number|min:0|max:1',
    limit: 'number|min:1|max:100',
    datasets: 'array',
    entityType: 'string|in:individual,entity,vessel,aircraft'
  }),
  async (req, res) => {
    try {
      const { name, ...options } = req.body;
      
      // Log search for audit
      await logSearch(req.user.id, name, req.ip);
      
      // Perform search
      const results = await searchService.search(name, options);
      
      res.json({
        success: true,
        query: name,
        count: results.length,
        results: results.map(r => ({
          entity: r.entity,
          matchType: r.matchType,
          matchedName: r.matchedName,
          score: r.finalScore,
          confidence: r.confidence
        }))
      });
    } catch (error) {
      console.error('[API] Search error:', error);
      res.status(500).json({
        success: false,
        error: 'Search failed'
      });
    }
  }
);

/**
 * @route GET /api/sanctions/entity/:id
 * @desc Get entity details
 */
router.get('/entity/:id',
  authenticate,
  async (req, res) => {
    try {
      const entity = await searchService.getEntity(req.params.id);
      
      if (!entity) {
        return res.status(404).json({
          success: false,
          error: 'Entity not found'
        });
      }
      
      res.json({
        success: true,
        entity
      });
    } catch (error) {
      console.error('[API] Entity fetch error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch entity'
      });
    }
  }
);

/**
 * @route GET /api/sanctions/stats
 * @desc Get database statistics
 */
router.get('/stats',
  authenticate,
  async (req, res) => {
    try {
      const stats = await searchService.getStatistics();
      res.json({
        success: true,
        stats
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to fetch statistics'
      });
    }
  }
);

export default router;
```

### 6. Monitoring and Alerting

```javascript
// src/services/kyc/opensanctions/OpenSanctionsMonitor.js

import { EventEmitter } from 'events';
import prometheus from 'prom-client';

export class OpenSanctionsMonitor extends EventEmitter {
  constructor() {
    super();
    
    // Prometheus metrics
    this.metrics = {
      searchRequests: new prometheus.Counter({
        name: 'opensanctions_search_requests_total',
        help: 'Total number of search requests',
        labelNames: ['status']
      }),
      
      searchDuration: new prometheus.Histogram({
        name: 'opensanctions_search_duration_seconds',
        help: 'Search request duration in seconds',
        buckets: [0.1, 0.25, 0.5, 1, 2.5, 5]
      }),
      
      entitiesTotal: new prometheus.Gauge({
        name: 'opensanctions_entities_total',
        help: 'Total number of entities in database'
      }),
      
      lastUpdateTime: new prometheus.Gauge({
        name: 'opensanctions_last_update_timestamp',
        help: 'Timestamp of last successful update'
      }),
      
      cacheHitRate: new prometheus.Gauge({
        name: 'opensanctions_cache_hit_rate',
        help: 'Cache hit rate percentage'
      })
    };
    
    // Register metrics
    prometheus.register.registerMetric(this.metrics.searchRequests);
    prometheus.register.registerMetric(this.metrics.searchDuration);
    prometheus.register.registerMetric(this.metrics.entitiesTotal);
    prometheus.register.registerMetric(this.metrics.lastUpdateTime);
    prometheus.register.registerMetric(this.metrics.cacheHitRate);
  }

  recordSearch(duration, status) {
    this.metrics.searchRequests.inc({ status });
    this.metrics.searchDuration.observe(duration);
  }

  updateEntityCount(count) {
    this.metrics.entitiesTotal.set(count);
  }

  recordUpdate(timestamp) {
    this.metrics.lastUpdateTime.set(timestamp);
  }

  updateCacheHitRate(rate) {
    this.metrics.cacheHitRate.set(rate);
  }
}
```

## Deployment Considerations

### 1. Infrastructure Requirements

```yaml
# docker-compose.yml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: opensanctions
      POSTGRES_USER: opensanctions
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    command: >
      postgres
      -c shared_buffers=2GB
      -c work_mem=32MB
      -c maintenance_work_mem=512MB
      -c effective_cache_size=6GB
      -c max_connections=200
  
  redis:
    image: redis:7-alpine
    command: redis-server --maxmemory 1gb --maxmemory-policy allkeys-lru
    ports:
      - "6379:6379"
  
  app:
    build: .
    environment:
      - DATABASE_URL=postgresql://opensanctions:${DB_PASSWORD}@postgres:5432/opensanctions
      - REDIS_URL=redis://redis:6379
    depends_on:
      - postgres
      - redis
    volumes:
      - ./data:/app/data

volumes:
  postgres_data:
```

### 2. Performance Optimization

1. **Database Optimization**:
   - Use PostgreSQL with proper indexes
   - Enable pg_trgm extension for fuzzy matching
   - Partition large tables by dataset or date
   - Regular VACUUM and ANALYZE

2. **Caching Strategy**:
   - Redis for search results (1-hour TTL)
   - Application-level caching for frequent searches
   - CDN for API responses if applicable

3. **Search Optimization**:
   - Pre-compute normalized names
   - Use database trigram indexes
   - Implement search result pagination
   - Consider Elasticsearch for complex searches

### 3. Security Considerations

1. **API Security**:
   - Authentication required for all endpoints
   - Rate limiting per user/IP
   - Input validation and sanitization
   - Audit logging for compliance

2. **Data Protection**:
   - Encrypt data at rest
   - Use TLS for all connections
   - Regular security updates
   - Access control and monitoring

### 4. Compliance and Legal

1. **Usage Compliance**:
   - OpenSanctions is free for non-commercial use
   - Commercial use requires license
   - Must attribute data source
   - Follow data retention policies

2. **Audit Trail**:
   - Log all searches with timestamp
   - Track positive matches
   - Regular compliance reports
   - Data privacy compliance (GDPR, etc.)

## Implementation Timeline

1. **Week 1**: Database setup and import service
2. **Week 2**: Search API and caching layer
3. **Week 3**: Update automation and monitoring
4. **Week 4**: Testing, optimization, and deployment

## Cost Estimates

- **Infrastructure**: ~$200-500/month (depending on scale)
  - PostgreSQL: 8GB RAM, 100GB SSD
  - Redis: 2GB RAM
  - Application servers: 2-4 instances
  
- **Bandwidth**: ~$50-100/month for daily updates
- **Monitoring**: ~$50/month (Datadog, New Relic, etc.)

Total: ~$300-650/month for production deployment