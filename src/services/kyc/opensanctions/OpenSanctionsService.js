// src/services/kyc/opensanctions/OpenSanctionsService.js

import { Pool } from 'pg';
import Redis from 'ioredis';
import { fuzzyMatcher } from '../utils/fuzzyMatcher.js';
import { EventEmitter } from 'events';

/**
 * Production-ready OpenSanctions Service
 * Provides high-performance sanctions and PEP screening
 */
export class OpenSanctionsService extends EventEmitter {
  constructor(config = {}) {
    super();
    
    // Database configuration
    this.dbConfig = config.database || {
      host: process.env.OPENSANCTIONS_DB_HOST || 'localhost',
      port: process.env.OPENSANCTIONS_DB_PORT || 5432,
      database: process.env.OPENSANCTIONS_DB_NAME || 'opensanctions',
      user: process.env.OPENSANCTIONS_DB_USER || 'opensanctions',
      password: process.env.OPENSANCTIONS_DB_PASSWORD,
      max: 20, // connection pool size
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    };
    
    // Redis configuration
    this.redisConfig = config.redis || {
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD,
      db: 0,
      keyPrefix: 'opensanctions:'
    };
    
    // Search configuration
    this.searchConfig = {
      defaultThreshold: 0.75,
      maxResults: 100,
      cacheExpiry: 3600, // 1 hour
      enableFuzzyEnhancement: true,
      enableContextualMatching: true
    };
    
    // Initialize connections
    this.pool = null;
    this.redis = null;
    this.initialized = false;
  }

  /**
   * Initialize database and cache connections
   */
  async initialize() {
    if (this.initialized) return;
    
    try {
      // Initialize PostgreSQL
      this.pool = new Pool(this.dbConfig);
      
      // Test database connection
      const client = await this.pool.connect();
      await client.query('SELECT 1');
      client.release();
      
      console.log('[OpenSanctions] Database connected');
      
      // Initialize Redis
      this.redis = new Redis(this.redisConfig);
      
      // Test Redis connection
      await this.redis.ping();
      
      console.log('[OpenSanctions] Redis connected');
      
      // Check if tables exist
      await this.ensureTablesExist();
      
      this.initialized = true;
      this.emit('initialized');
      
    } catch (error) {
      console.error('[OpenSanctions] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Search for entities by name
   */
  async search(name, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    const startTime = Date.now();
    
    try {
      const {
        threshold = this.searchConfig.defaultThreshold,
        limit = this.searchConfig.maxResults,
        includeAliases = true,
        datasets = null,
        entityType = null,
        nationality = null,
        dateOfBirth = null,
        skipCache = false
      } = options;
      
      // Generate cache key
      const cacheKey = this.generateCacheKey('search', { name, ...options });
      
      // Check cache
      if (!skipCache) {
        const cached = await this.getCached(cacheKey);
        if (cached) {
          this.emit('search:cache_hit', { name, duration: Date.now() - startTime });
          return cached;
        }
      }
      
      // Normalize search name
      const normalizedName = this.normalize(name);
      
      // Build and execute query
      const results = await this.executeSearch({
        name,
        normalizedName,
        threshold,
        limit,
        includeAliases,
        datasets,
        entityType,
        nationality
      });
      
      // Enhance results with fuzzy matching
      let enhancedResults = results;
      if (this.searchConfig.enableFuzzyEnhancement) {
        enhancedResults = await this.enhanceWithFuzzyMatching(results, name, dateOfBirth);
      }
      
      // Filter by final score
      const filteredResults = enhancedResults
        .filter(r => r.finalScore >= threshold)
        .slice(0, limit);
      
      // Cache results
      if (!skipCache) {
        await this.setCached(cacheKey, filteredResults, this.searchConfig.cacheExpiry);
      }
      
      const duration = Date.now() - startTime;
      this.emit('search:completed', { 
        name, 
        results: filteredResults.length, 
        duration 
      });
      
      return filteredResults;
      
    } catch (error) {
      this.emit('search:error', { name, error });
      throw error;
    }
  }

  /**
   * Execute database search
   */
  async executeSearch(params) {
    const {
      name,
      normalizedName,
      threshold,
      limit,
      includeAliases,
      datasets,
      entityType,
      nationality
    } = params;
    
    // Build dynamic query
    const conditions = [];
    const queryParams = [normalizedName];
    let paramIndex = 2;
    
    if (entityType) {
      conditions.push(`e.type = $${paramIndex++}`);
      queryParams.push(entityType);
    }
    
    if (datasets && datasets.length > 0) {
      conditions.push(`e.datasets && $${paramIndex++}`);
      queryParams.push(datasets);
    }
    
    if (nationality) {
      conditions.push(`e.nationality = $${paramIndex++}`);
      queryParams.push(nationality);
    }
    
    const whereClause = conditions.length > 0 ? 
      `AND ${conditions.join(' AND ')}` : '';
    
    const query = `
      WITH search_results AS (
        -- Primary name matches
        SELECT 
          e.*,
          'primary_name' as match_type,
          e.name as matched_name,
          similarity(e.name_normalized, $1) as pg_score,
          RANK() OVER (PARTITION BY e.id ORDER BY similarity(e.name_normalized, $1) DESC) as rn
        FROM opensanctions_entities e
        WHERE e.name_normalized % $1 ${whereClause}
        
        ${includeAliases ? `
        UNION ALL
        
        -- Alias matches
        SELECT 
          e.*,
          'alias' as match_type,
          a.alias as matched_name,
          similarity(a.alias_normalized, $1) as pg_score,
          RANK() OVER (PARTITION BY e.id ORDER BY similarity(a.alias_normalized, $1) DESC) as rn
        FROM opensanctions_entities e
        JOIN opensanctions_aliases a ON e.id = a.entity_id
        WHERE a.alias_normalized % $1 ${whereClause}
        ` : ''}
      )
      SELECT DISTINCT ON (id)
        id,
        schema,
        name,
        type,
        nationality,
        date_of_birth,
        place_of_birth,
        gender,
        datasets,
        score as entity_score,
        last_seen,
        match_type,
        matched_name,
        pg_score,
        data
      FROM search_results
      WHERE rn = 1 AND pg_score >= ${threshold * 0.6}
      ORDER BY id, pg_score DESC
      LIMIT ${limit * 2}
    `;
    
    const result = await this.pool.query(query, queryParams);
    
    return result.rows.map(row => ({
      entity: {
        id: row.id,
        name: row.name,
        type: row.type,
        nationality: row.nationality,
        dateOfBirth: row.date_of_birth,
        placeOfBirth: row.place_of_birth,
        gender: row.gender,
        datasets: row.datasets,
        entityScore: row.entity_score,
        lastSeen: row.last_seen,
        data: row.data
      },
      matchType: row.match_type,
      matchedName: row.matched_name,
      dbScore: parseFloat(row.pg_score)
    }));
  }

  /**
   * Enhance results with advanced fuzzy matching
   */
  async enhanceWithFuzzyMatching(results, searchName, searchDOB = null) {
    return Promise.all(results.map(async (result) => {
      // Basic fuzzy matching
      const fuzzyResult = fuzzyMatcher.match(searchName, result.matchedName, {
        threshold: 0
      });
      
      // Contextual matching if DOB provided
      let contextBonus = 0;
      const contextMatches = [];
      
      if (this.searchConfig.enableContextualMatching && searchDOB) {
        const dobMatch = this.compareDates(searchDOB, result.entity.dateOfBirth);
        if (dobMatch.exact) {
          contextBonus += 0.2;
          contextMatches.push('exact_dob');
        } else if (dobMatch.yearMatch) {
          contextBonus += 0.1;
          contextMatches.push('year_match');
        }
      }
      
      // Calculate final score
      const finalScore = Math.min(
        (result.dbScore * 0.3 + fuzzyResult.score * 0.7 + contextBonus),
        1.0
      );
      
      return {
        ...result,
        fuzzyScore: fuzzyResult.score,
        fuzzyMatchType: fuzzyResult.matchType,
        fuzzyConfidence: fuzzyResult.confidence,
        contextBonus,
        contextMatches,
        finalScore,
        algorithms: fuzzyResult.algorithms
      };
    }));
  }

  /**
   * Get detailed entity information
   */
  async getEntity(entityId, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    const { includeRelated = true, skipCache = false } = options;
    
    // Check cache
    const cacheKey = this.generateCacheKey('entity', { entityId, includeRelated });
    if (!skipCache) {
      const cached = await this.getCached(cacheKey);
      if (cached) return cached;
    }
    
    // Fetch entity
    const query = `
      SELECT 
        e.*,
        COALESCE(
          array_agg(DISTINCT a.alias) FILTER (WHERE a.alias IS NOT NULL),
          '{}'
        ) as aliases,
        COALESCE(
          json_agg(DISTINCT jsonb_build_object(
            'type', i.type,
            'value', i.value
          )) FILTER (WHERE i.type IS NOT NULL),
          '[]'
        ) as identifiers,
        COALESCE(
          json_agg(DISTINCT jsonb_build_object(
            'full_address', addr.full_address,
            'country', addr.country,
            'city', addr.city,
            'postal_code', addr.postal_code
          )) FILTER (WHERE addr.full_address IS NOT NULL),
          '[]'
        ) as addresses,
        COALESCE(
          json_agg(DISTINCT jsonb_build_object(
            'program', s.program,
            'authority', s.authority,
            'reason', s.reason,
            'start_date', s.start_date,
            'end_date', s.end_date
          )) FILTER (WHERE s.program IS NOT NULL),
          '[]'
        ) as sanctions
      FROM opensanctions_entities e
      LEFT JOIN opensanctions_aliases a ON e.id = a.entity_id
      LEFT JOIN opensanctions_identifiers i ON e.id = i.entity_id
      LEFT JOIN opensanctions_addresses addr ON e.id = addr.entity_id
      LEFT JOIN opensanctions_sanctions s ON e.id = s.entity_id
      WHERE e.id = $1
      GROUP BY e.id
    `;
    
    const result = await this.pool.query(query, [entityId]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const entity = result.rows[0];
    
    // Format response
    const response = {
      id: entity.id,
      schema: entity.schema,
      name: entity.name,
      type: entity.type,
      nationality: entity.nationality,
      dateOfBirth: entity.date_of_birth,
      placeOfBirth: entity.place_of_birth,
      gender: entity.gender,
      notes: entity.notes,
      datasets: entity.datasets,
      score: entity.score,
      lastSeen: entity.last_seen,
      lastUpdated: entity.last_updated,
      aliases: entity.aliases,
      identifiers: entity.identifiers,
      addresses: entity.addresses,
      sanctions: entity.sanctions,
      fullData: entity.data
    };
    
    // Cache result
    if (!skipCache) {
      await this.setCached(cacheKey, response, this.searchConfig.cacheExpiry * 2);
    }
    
    return response;
  }

  /**
   * Get database statistics
   */
  async getStatistics() {
    const query = `
      SELECT 
        COUNT(*) FILTER (WHERE type = 'individual') as individuals,
        COUNT(*) FILTER (WHERE type = 'entity') as entities,
        COUNT(*) FILTER (WHERE type = 'vessel') as vessels,
        COUNT(*) FILTER (WHERE type = 'aircraft') as aircraft,
        COUNT(*) as total,
        MAX(last_updated) as last_update,
        COUNT(DISTINCT UNNEST(datasets)) as unique_datasets
      FROM opensanctions_entities
    `;
    
    const result = await this.pool.query(query);
    return result.rows[0];
  }

  /**
   * Compare dates
   */
  compareDates(date1, date2) {
    if (!date1 || !date2) return { exact: false };
    
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    
    return {
      exact: d1.getTime() === d2.getTime(),
      yearMatch: d1.getFullYear() === d2.getFullYear(),
      daysDifference: Math.abs(d1 - d2) / (1000 * 60 * 60 * 24)
    };
  }

  /**
   * Normalize text for searching
   */
  normalize(text) {
    if (!text) return '';
    return text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ');
  }

  /**
   * Generate cache key
   */
  generateCacheKey(type, params) {
    const sortedParams = Object.keys(params)
      .sort()
      .reduce((acc, key) => {
        if (params[key] !== null && params[key] !== undefined) {
          acc[key] = params[key];
        }
        return acc;
      }, {});
    
    return `${type}:${JSON.stringify(sortedParams)}`;
  }

  /**
   * Get cached value
   */
  async getCached(key) {
    try {
      const cached = await this.redis.get(key);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      console.error('[OpenSanctions] Cache get error:', error);
      return null;
    }
  }

  /**
   * Set cached value
   */
  async setCached(key, value, expiry) {
    try {
      await this.redis.setex(key, expiry, JSON.stringify(value));
    } catch (error) {
      console.error('[OpenSanctions] Cache set error:', error);
    }
  }

  /**
   * Ensure database tables exist
   */
  async ensureTablesExist() {
    const client = await this.pool.connect();
    
    try {
      // Check if main table exists
      const result = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'opensanctions_entities'
        )
      `);
      
      if (!result.rows[0].exists) {
        throw new Error('OpenSanctions tables not found. Please run the import process first.');
      }
      
      // Enable pg_trgm extension for fuzzy matching
      await client.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');
      
      console.log('[OpenSanctions] Database tables verified');
      
    } finally {
      client.release();
    }
  }

  /**
   * Close connections
   */
  async close() {
    if (this.pool) {
      await this.pool.end();
    }
    
    if (this.redis) {
      this.redis.disconnect();
    }
    
    this.initialized = false;
    this.emit('closed');
  }
}

// Export singleton instance
export const openSanctionsService = new OpenSanctionsService();