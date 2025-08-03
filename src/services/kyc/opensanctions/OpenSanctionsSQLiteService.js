// src/services/kyc/opensanctions/OpenSanctionsSQLiteService.js

import Database from 'better-sqlite3';
import { fuzzyMatcher } from '../utils/fuzzyMatcher.js';
import { EventEmitter } from 'events';
import { existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * SQLite-based OpenSanctions Service for local development/testing
 * Provides same interface as production PostgreSQL version
 */
export class OpenSanctionsSQLiteService extends EventEmitter {
  constructor(config = {}) {
    super();
    
    // Database configuration
    this.dbPath = config.dbPath || join(__dirname, '../../../../data/opensanctions.db');
    
    // Search configuration
    this.searchConfig = {
      defaultThreshold: 0.75,
      maxResults: 100,
      enableFuzzyEnhancement: true,
      enableContextualMatching: true
    };
    
    // Initialize
    this.db = null;
    this.initialized = false;
    this.cache = new Map(); // Simple in-memory cache
  }

  /**
   * Initialize database connection and create tables
   */
  async initialize() {
    if (this.initialized) return;
    
    try {
      // Ensure data directory exists
      const dataDir = dirname(this.dbPath);
      if (!existsSync(dataDir)) {
        mkdirSync(dataDir, { recursive: true });
      }
      
      // Open database
      this.db = new Database(this.dbPath);
      console.log('[OpenSanctions SQLite] Database opened:', this.dbPath);
      
      // Enable foreign keys
      this.db.pragma('foreign_keys = ON');
      
      // Create tables
      this.createTables();
      
      // Create indexes
      this.createIndexes();
      
      this.initialized = true;
      this.emit('initialized');
      
      // Get entity count
      const count = this.db.prepare('SELECT COUNT(*) as count FROM opensanctions_entities').get();
      console.log(`[OpenSanctions SQLite] Initialized with ${count.count} entities`);
      
    } catch (error) {
      console.error('[OpenSanctions SQLite] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Create database tables
   */
  createTables() {
    // Main entities table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS opensanctions_entities (
        id TEXT PRIMARY KEY,
        schema TEXT NOT NULL,
        name TEXT NOT NULL,
        name_normalized TEXT,
        type TEXT,
        datasets TEXT, -- JSON array stored as text
        nationality TEXT,
        date_of_birth TEXT,
        place_of_birth TEXT,
        gender TEXT,
        notes TEXT,
        last_seen TEXT,
        last_updated TEXT DEFAULT CURRENT_TIMESTAMP,
        score REAL DEFAULT 0,
        data TEXT -- Full entity data as JSON
      )
    `);

    // Aliases table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS opensanctions_aliases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_id TEXT REFERENCES opensanctions_entities(id) ON DELETE CASCADE,
        alias TEXT NOT NULL,
        alias_normalized TEXT,
        type TEXT DEFAULT 'alias'
      )
    `);

    // Identifiers table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS opensanctions_identifiers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_id TEXT REFERENCES opensanctions_entities(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        value TEXT NOT NULL,
        country TEXT,
        issued_date TEXT,
        expiry_date TEXT
      )
    `);

    // Addresses table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS opensanctions_addresses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_id TEXT REFERENCES opensanctions_entities(id) ON DELETE CASCADE,
        full_address TEXT,
        street TEXT,
        city TEXT,
        region TEXT,
        postal_code TEXT,
        country TEXT,
        lat REAL,
        lng REAL
      )
    `);

    // Sanctions table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS opensanctions_sanctions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_id TEXT REFERENCES opensanctions_entities(id) ON DELETE CASCADE,
        program TEXT,
        authority TEXT,
        reason TEXT,
        start_date TEXT,
        end_date TEXT,
        is_active INTEGER DEFAULT 1
      )
    `);

    // Search log table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS opensanctions_search_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        search_term TEXT NOT NULL,
        normalized_term TEXT,
        user_id TEXT,
        results_count INTEGER DEFAULT 0,
        has_matches INTEGER DEFAULT 0,
        search_timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
        duration_ms INTEGER,
        options TEXT
      )
    `);
  }

  /**
   * Create indexes for performance
   */
  createIndexes() {
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_entities_name_normalized ON opensanctions_entities(name_normalized)',
      'CREATE INDEX IF NOT EXISTS idx_entities_type ON opensanctions_entities(type)',
      'CREATE INDEX IF NOT EXISTS idx_entities_nationality ON opensanctions_entities(nationality)',
      'CREATE INDEX IF NOT EXISTS idx_aliases_normalized ON opensanctions_aliases(alias_normalized)',
      'CREATE INDEX IF NOT EXISTS idx_aliases_entity_id ON opensanctions_aliases(entity_id)',
      'CREATE INDEX IF NOT EXISTS idx_identifiers_entity_id ON opensanctions_identifiers(entity_id)',
      'CREATE INDEX IF NOT EXISTS idx_identifiers_value ON opensanctions_identifiers(value)',
      'CREATE INDEX IF NOT EXISTS idx_addresses_entity_id ON opensanctions_addresses(entity_id)',
      'CREATE INDEX IF NOT EXISTS idx_sanctions_entity_id ON opensanctions_sanctions(entity_id)'
    ];

    for (const index of indexes) {
      this.db.exec(index);
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
      
      // Check cache
      const cacheKey = `search:${name}:${JSON.stringify(options)}`;
      if (!skipCache && this.cache.has(cacheKey)) {
        const cached = this.cache.get(cacheKey);
        this.emit('search:cache_hit', { name, duration: Date.now() - startTime });
        return cached;
      }
      
      // Normalize search name
      const normalizedName = this.normalize(name);
      
      // Search entities
      const results = this.executeSearch({
        name,
        normalizedName,
        threshold,
        limit,
        includeAliases,
        datasets,
        entityType,
        nationality
      });
      
      // Enhance with fuzzy matching
      let enhancedResults = results;
      if (this.searchConfig.enableFuzzyEnhancement) {
        try {
          enhancedResults = await this.enhanceWithFuzzyMatching(results, name, dateOfBirth);
        } catch (error) {
          console.error('[OpenSanctions SQLite] Fuzzy matching enhancement failed:', error);
          // Fall back to results without enhancement
          enhancedResults = results;
        }
      }
      
      // Filter by final score
      const filteredResults = enhancedResults
        .filter(r => r.finalScore >= threshold)
        .sort((a, b) => b.finalScore - a.finalScore)
        .slice(0, limit);
      
      // Cache results
      if (!skipCache) {
        this.cache.set(cacheKey, filteredResults);
        // Clear cache after 1 hour
        setTimeout(() => this.cache.delete(cacheKey), 3600000);
      }
      
      const duration = Date.now() - startTime;
      this.emit('search:completed', { 
        name, 
        results: filteredResults.length, 
        duration 
      });
      
      // Log search
      this.logSearch(name, normalizedName, filteredResults.length, duration, options);
      
      return filteredResults;
      
    } catch (error) {
      this.emit('search:error', { name, error });
      throw error;
    }
  }

  /**
   * Execute database search
   */
  executeSearch(params) {
    const {
      normalizedName,
      limit,
      includeAliases,
      datasets,
      entityType,
      nationality
    } = params;
    
    const results = [];
    const seen = new Set();
    
    // Build WHERE conditions
    const conditions = [];
    const values = [];
    
    if (entityType) {
      conditions.push('e.type = ?');
      values.push(entityType);
    }
    
    if (nationality) {
      conditions.push('e.nationality = ?');
      values.push(nationality);
    }
    
    if (datasets && datasets.length > 0) {
      // Check if datasets JSON contains any of the requested datasets
      const datasetConditions = datasets.map(() => 'e.datasets LIKE ?').join(' OR ');
      conditions.push(`(${datasetConditions})`);
      datasets.forEach(ds => values.push(`%"${ds}"%`));
    }
    
    const whereClause = conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '';
    
    // Search primary names
    const nameQuery = `
      SELECT 
        e.*,
        'primary_name' as match_type,
        e.name as matched_name
      FROM opensanctions_entities e
      WHERE LOWER(e.name_normalized) LIKE ? ${whereClause}
      LIMIT ?
    `;
    
    const nameStmt = this.db.prepare(nameQuery);
    const nameResults = nameStmt.all(`%${normalizedName}%`, ...values, limit * 2);
    
    for (const row of nameResults) {
      if (!seen.has(row.id)) {
        seen.add(row.id);
        results.push(this.formatSearchResult(row));
      }
    }
    
    // Search aliases if enabled
    if (includeAliases) {
      const aliasQuery = `
        SELECT 
          e.*,
          'alias' as match_type,
          a.alias as matched_name
        FROM opensanctions_entities e
        JOIN opensanctions_aliases a ON e.id = a.entity_id
        WHERE LOWER(a.alias_normalized) LIKE ? ${whereClause}
        LIMIT ?
      `;
      
      const aliasStmt = this.db.prepare(aliasQuery);
      const aliasResults = aliasStmt.all(`%${normalizedName}%`, ...values, limit);
      
      for (const row of aliasResults) {
        if (!seen.has(row.id)) {
          seen.add(row.id);
          results.push(this.formatSearchResult(row));
        }
      }
    }
    
    return results;
  }

  /**
   * Format search result
   */
  formatSearchResult(row) {
    return {
      entity: {
        id: row.id,
        name: row.name,
        type: row.type,
        nationality: row.nationality,
        dateOfBirth: row.date_of_birth,
        placeOfBirth: row.place_of_birth,
        gender: row.gender,
        datasets: row.datasets ? JSON.parse(row.datasets) : [],
        entityScore: row.score,
        lastSeen: row.last_seen,
        data: row.data ? JSON.parse(row.data) : null
      },
      matchType: row.match_type,
      matchedName: row.matched_name,
      dbScore: 0.5 // SQLite doesn't have trigram similarity
    };
  }

  /**
   * Enhance results with fuzzy matching
   */
  async enhanceWithFuzzyMatching(results, searchName, searchDOB = null) {
    return results.map(result => {
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
    });
  }

  /**
   * Get entity details
   */
  async getEntity(entityId, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    const { includeRelated = true } = options;
    
    // Get main entity
    const entity = this.db.prepare('SELECT * FROM opensanctions_entities WHERE id = ?').get(entityId);
    
    if (!entity) {
      return null;
    }
    
    const result = {
      id: entity.id,
      schema: entity.schema,
      name: entity.name,
      type: entity.type,
      nationality: entity.nationality,
      dateOfBirth: entity.date_of_birth,
      placeOfBirth: entity.place_of_birth,
      gender: entity.gender,
      notes: entity.notes,
      datasets: entity.datasets ? JSON.parse(entity.datasets) : [],
      score: entity.score,
      lastSeen: entity.last_seen,
      lastUpdated: entity.last_updated,
      fullData: entity.data ? JSON.parse(entity.data) : null
    };
    
    if (includeRelated) {
      // Get aliases
      result.aliases = this.db.prepare(
        'SELECT alias FROM opensanctions_aliases WHERE entity_id = ?'
      ).all(entityId).map(r => r.alias);
      
      // Get identifiers
      result.identifiers = this.db.prepare(
        'SELECT type, value FROM opensanctions_identifiers WHERE entity_id = ?'
      ).all(entityId);
      
      // Get addresses
      result.addresses = this.db.prepare(
        'SELECT * FROM opensanctions_addresses WHERE entity_id = ?'
      ).all(entityId);
      
      // Get sanctions
      result.sanctions = this.db.prepare(
        'SELECT * FROM opensanctions_sanctions WHERE entity_id = ?'
      ).all(entityId);
    }
    
    return result;
  }

  /**
   * Get database statistics
   */
  async getStatistics() {
    const stats = this.db.prepare(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN type = 'individual' THEN 1 END) as individuals,
        COUNT(CASE WHEN type = 'entity' THEN 1 END) as entities,
        COUNT(CASE WHEN type = 'vessel' THEN 1 END) as vessels,
        COUNT(CASE WHEN type = 'aircraft' THEN 1 END) as aircraft,
        MAX(last_updated) as last_update
      FROM opensanctions_entities
    `).get();
    
    return stats;
  }

  /**
   * Import entity (for data loading)
   */
  importEntity(entityData) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO opensanctions_entities 
      (id, schema, name, name_normalized, type, datasets, nationality, 
       date_of_birth, place_of_birth, gender, notes, last_seen, score, data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      entityData.id,
      entityData.schema,
      entityData.name,
      this.normalize(entityData.name),
      entityData.type,
      JSON.stringify(entityData.datasets || []),
      entityData.nationality,
      entityData.dateOfBirth,
      entityData.placeOfBirth,
      entityData.gender,
      entityData.notes,
      entityData.lastSeen,
      entityData.score || 0,
      JSON.stringify(entityData)
    );
    
    // Import aliases
    if (entityData.aliases && entityData.aliases.length > 0) {
      const aliasStmt = this.db.prepare(`
        INSERT INTO opensanctions_aliases (entity_id, alias, alias_normalized, type)
        VALUES (?, ?, ?, ?)
      `);
      
      for (const alias of entityData.aliases) {
        aliasStmt.run(entityData.id, alias, this.normalize(alias), 'alias');
      }
    }
    
    // Import identifiers
    if (entityData.identifiers) {
      const idStmt = this.db.prepare(`
        INSERT INTO opensanctions_identifiers (entity_id, type, value)
        VALUES (?, ?, ?)
      `);
      
      for (const [type, values] of Object.entries(entityData.identifiers)) {
        const valueArray = Array.isArray(values) ? values : [values];
        for (const value of valueArray) {
          idStmt.run(entityData.id, type, value);
        }
      }
    }
  }

  /**
   * Log search
   */
  logSearch(searchTerm, normalizedTerm, resultCount, duration, options) {
    const stmt = this.db.prepare(`
      INSERT INTO opensanctions_search_log 
      (search_term, normalized_term, results_count, has_matches, duration_ms, options)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      searchTerm,
      normalizedTerm,
      resultCount,
      resultCount > 0 ? 1 : 0,
      duration,
      JSON.stringify(options)
    );
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
   * Normalize text
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
   * Close database
   */
  async close() {
    if (this.db) {
      this.db.close();
    }
    
    this.initialized = false;
    this.emit('closed');
  }

  /**
   * Clear all data (for testing)
   */
  async clearAll() {
    if (!this.initialized) {
      await this.initialize();
    }
    
    this.db.exec('DELETE FROM opensanctions_entities');
    this.cache.clear();
  }
}

// Export singleton instance
export const openSanctionsSQLiteService = new OpenSanctionsSQLiteService();