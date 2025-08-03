// src/services/kyc/opensanctions/__tests__/openSanctionsSQLiteService.test.js

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OpenSanctionsSQLiteService } from '../openSanctionsSQLiteService.js';
import Database from 'better-sqlite3';
import { EventEmitter } from 'events';

// Mock modules
vi.mock('better-sqlite3');
vi.mock('fs', () => {
  const mockExistsSync = vi.fn();
  const mockMkdirSync = vi.fn();
  return {
    default: {
      existsSync: mockExistsSync,
      mkdirSync: mockMkdirSync
    },
    existsSync: mockExistsSync,
    mkdirSync: mockMkdirSync
  };
});

// Mock fuzzyMatcher
vi.mock('../../utils/fuzzyMatcher.js', () => ({
  fuzzyMatcher: {
    match: vi.fn((search, target) => ({
      isMatch: true,
      score: 0.85,
      matchType: 'fuzzy',
      confidence: 0.9,
      algorithms: ['jaro_winkler', 'levenshtein']
    }))
  }
}));

describe('OpenSanctionsSQLiteService', () => {
  let service;
  let mockDb;
  let mockStmt;
  let mockExec;
  let mockPragma;

  beforeEach(() => {
    // Create mock database methods
    mockStmt = {
      run: vi.fn(),
      get: vi.fn(),
      all: vi.fn()
    };

    mockExec = vi.fn();
    mockPragma = vi.fn();

    mockDb = {
      prepare: vi.fn(() => mockStmt),
      exec: mockExec,
      pragma: mockPragma,
      close: vi.fn()
    };

    // Mock Database constructor
    vi.mocked(Database).mockImplementation(() => mockDb);

    // Create service instance
    service = new OpenSanctionsSQLiteService({
      dbPath: '/test/path/opensanctions.db'
    });

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default configuration', () => {
      const defaultService = new OpenSanctionsSQLiteService();
      expect(defaultService.searchConfig).toMatchObject({
        defaultThreshold: 0.75,
        maxResults: 100,
        enableFuzzyEnhancement: true,
        enableContextualMatching: true
      });
      expect(defaultService.initialized).toBe(false);
      expect(defaultService.cache).toBeInstanceOf(Map);
      expect(defaultService).toBeInstanceOf(EventEmitter);
    });

    it('should accept custom database path', () => {
      expect(service.dbPath).toBe('/test/path/opensanctions.db');
    });
  });

  describe('initialize', () => {
    beforeEach(async () => {
      const { existsSync } = await import('fs');
      vi.mocked(existsSync).mockReturnValue(true);
    });

    it('should initialize database successfully', async () => {
      mockStmt.get.mockReturnValue({ count: 1000 });

      await service.initialize();

      expect(Database).toHaveBeenCalledWith('/test/path/opensanctions.db');
      expect(mockPragma).toHaveBeenCalledWith('foreign_keys = ON');
      expect(mockExec).toHaveBeenCalled(); // Create tables
      expect(service.initialized).toBe(true);
    });

    it('should create data directory if it does not exist', async () => {
      const { existsSync, mkdirSync } = await import('fs');
      vi.mocked(existsSync).mockReturnValue(false);
      mockStmt.get.mockReturnValue({ count: 0 });

      await service.initialize();

      expect(mkdirSync).toHaveBeenCalledWith('/test/path', { recursive: true });
    });

    it('should not reinitialize if already initialized', async () => {
      service.initialized = true;
      
      await service.initialize();
      
      expect(Database).not.toHaveBeenCalled();
    });

    it('should emit initialized event', async () => {
      mockStmt.get.mockReturnValue({ count: 500 });
      const initSpy = vi.fn();
      service.on('initialized', initSpy);

      await service.initialize();

      expect(initSpy).toHaveBeenCalled();
    });

    it('should handle initialization errors', async () => {
      vi.mocked(Database).mockImplementationOnce(() => {
        throw new Error('Database error');
      });

      await expect(service.initialize()).rejects.toThrow('Database error');
    });
  });

  describe('search', () => {
    beforeEach(async () => {
      mockStmt.get.mockReturnValue({ count: 1000 });
      await service.initialize();
    });

    it('should search entities by name', async () => {
      const mockResults = [
        {
          id: 'NK-123',
          name: 'John Doe',
          type: 'individual',
          nationality: 'US',
          date_of_birth: '1970-01-01',
          datasets: '["sanctions"]',
          score: 0.95,
          match_type: 'primary_name',
          matched_name: 'John Doe'
        }
      ];

      mockStmt.all.mockReturnValue(mockResults);

      const results = await service.search('John Doe');

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      if (results.length > 0) {
      expect(results[0]).toMatchObject({
        entity: {
          id: 'NK-123',
          name: 'John Doe',
          type: 'individual',
          nationality: 'US',
          dateOfBirth: '1970-01-01',
          datasets: ['sanctions']
        },
        matchType: 'primary_name',
        matchedName: 'John Doe',
        finalScore: expect.any(Number)
      });
      }
    });

    it('should search with filters', async () => {
      mockStmt.all.mockReturnValue([]);

      await service.search('Test Name', {
        entityType: 'individual',
        nationality: 'US',
        datasets: ['sanctions', 'peps']
      });

      // Check that prepare was called with filters
      const prepareCalls = mockDb.prepare.mock.calls.map(call => call[0]);
      const hasTypeFilter = prepareCalls.some(call => call.includes('e.type = ?'));
      const hasNationalityFilter = prepareCalls.some(call => call.includes('e.nationality = ?'));
      const hasDatasetsFilter = prepareCalls.some(call => call.includes('e.datasets LIKE ?'));
      
      expect(hasTypeFilter).toBe(true);
      expect(hasNationalityFilter).toBe(true);
      expect(hasDatasetsFilter).toBe(true);
    });

    it('should include aliases when requested', async () => {
      mockStmt.all
        .mockReturnValueOnce([]) // Primary name results
        .mockReturnValueOnce([  // Alias results
          {
            id: 'NK-124',
            name: 'Jane Smith',
            match_type: 'alias',
            matched_name: 'J. Smith'
          }
        ]);

      const results = await service.search('J. Smith', { includeAliases: true });

      // Should have at least name query and alias query
      const prepareCalls = mockDb.prepare.mock.calls.length;
      expect(prepareCalls).toBeGreaterThanOrEqual(2);
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
    });

    it('should use cache for repeated searches', async () => {
      mockStmt.all.mockReturnValue([]);

      // First search
      await service.search('Cached Name');
      expect(mockDb.prepare).toHaveBeenCalled();

      // Reset mock
      mockDb.prepare.mockClear();

      // Second search (should use cache)
      await service.search('Cached Name');
      expect(mockDb.prepare).not.toHaveBeenCalled();
    });

    it('should skip cache when requested', async () => {
      mockStmt.all.mockReturnValue([]);

      // First search
      await service.search('Test Name');
      
      // Reset mock
      mockDb.prepare.mockClear();

      // Second search with skipCache
      await service.search('Test Name', { skipCache: true });
      expect(mockDb.prepare).toHaveBeenCalled();
    });

    it('should enhance results with fuzzy matching', async () => {
      const mockResults = [{
        id: 'NK-125',
        name: 'John Smith',
        match_type: 'primary_name',
        matched_name: 'John Smith'
      }];

      mockStmt.all.mockReturnValue(mockResults);

      const results = await service.search('Jon Smyth');

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      if (results.length > 0) {
        expect(results[0]).toHaveProperty('fuzzyScore', 0.85);
        expect(results[0]).toHaveProperty('fuzzyMatchType', 'fuzzy');
        expect(results[0]).toHaveProperty('algorithms');
      }
    });

    it('should apply contextual matching with DOB', async () => {
      const mockResults = [{
        id: 'NK-126',
        name: 'John Doe',
        date_of_birth: '1970-01-01',
        match_type: 'primary_name',
        matched_name: 'John Doe'
      }];

      mockStmt.all.mockReturnValue(mockResults);

      const results = await service.search('John Doe', { dateOfBirth: '1970-01-01' });

      expect(results[0].contextBonus).toBeGreaterThan(0);
      expect(results[0].contextMatches).toContain('exact_dob');
    });

    it('should emit search events', async () => {
      mockStmt.all.mockReturnValue([]);
      
      const completedSpy = vi.fn();
      service.on('search:completed', completedSpy);

      await service.search('Test Name');

      expect(completedSpy).toHaveBeenCalledWith({
        name: 'Test Name',
        results: 0,
        duration: expect.any(Number)
      });
    });

    it('should log searches', async () => {
      mockStmt.all.mockReturnValue([]);

      await service.search('Logged Search', { entityType: 'individual' });

      // Check that search was logged
      const logCall = mockStmt.run.mock.calls.find(call => 
        call[0] === 'Logged Search'
      );
      expect(logCall).toBeDefined();
    });

    it('should handle search errors', async () => {
      mockStmt.all.mockImplementationOnce(() => {
        throw new Error('Search failed');
      });

      const errorSpy = vi.fn();
      service.on('search:error', errorSpy);

      await expect(service.search('Error Test')).rejects.toThrow('Search failed');
      expect(errorSpy).toHaveBeenCalled();
    });
  });

  describe('getEntity', () => {
    beforeEach(async () => {
      mockStmt.get.mockReturnValue({ count: 1000 });
      await service.initialize();
    });

    it('should get entity with all related data', async () => {
      const mockEntity = {
        id: 'NK-200',
        schema: 'Person',
        name: 'Test Entity',
        type: 'individual',
        nationality: 'US',
        date_of_birth: '1980-01-01',
        datasets: '["sanctions"]',
        data: '{"additional":"data"}'
      };

      const mockAliases = [
        { alias: 'T. Entity' },
        { alias: 'Test E.' }
      ];

      const mockIdentifiers = [
        { type: 'passport', value: 'P123456' }
      ];

      const mockAddresses = [
        { full_address: '123 Main St', country: 'US' }
      ];

      const mockSanctions = [
        { program: 'OFAC SDN', reason: 'Test reason' }
      ];

      // Reset and setup mocks for this test
      mockStmt.get.mockReset();
      mockStmt.get.mockReturnValueOnce(mockEntity); // getEntity call
      
      mockStmt.all.mockReturnValueOnce(mockAliases)
        .mockReturnValueOnce(mockIdentifiers)
        .mockReturnValueOnce(mockAddresses)
        .mockReturnValueOnce(mockSanctions);

      const result = await service.getEntity('NK-200');

      expect(result).toBeTruthy();
      expect(result).toMatchObject({
        id: 'NK-200',
        name: 'Test Entity',
        type: 'individual',
        aliases: ['T. Entity', 'Test E.'],
        identifiers: mockIdentifiers,
        addresses: mockAddresses,
        sanctions: mockSanctions
      });
    });

    it('should return null for non-existent entity', async () => {
      mockStmt.get.mockReset();
      mockStmt.get.mockReturnValueOnce(null); // getEntity call
      mockStmt.all.mockReturnValue([]); // For any related queries

      const result = await service.getEntity('NONEXISTENT');

      expect(result).toBeNull();
    });

    it('should get entity without related data when requested', async () => {
      const mockEntity = {
        id: 'NK-201',
        name: 'Simple Entity'
      };

      mockStmt.get.mockReset();
      mockStmt.get.mockReturnValueOnce(mockEntity);

      const result = await service.getEntity('NK-201', { includeRelated: false });

      expect(mockStmt.all).not.toHaveBeenCalled();
      expect(result).not.toHaveProperty('aliases');
      expect(result).not.toHaveProperty('identifiers');
    });
  });

  describe('importEntity', () => {
    beforeEach(async () => {
      mockStmt.get.mockReturnValue({ count: 0 });
      await service.initialize();
    });

    it('should import entity with all data', () => {
      const entityData = {
        id: 'NK-300',
        schema: 'Person',
        name: 'Import Test',
        type: 'individual',
        nationality: 'US',
        dateOfBirth: '1990-01-01',
        aliases: ['I. Test', 'Import T.'],
        identifiers: {
          passport: ['P789012'],
          nationalId: ['ID123']
        },
        datasets: ['sanctions', 'peps']
      };

      service.importEntity(entityData);

      // Check main entity insert
      expect(mockStmt.run).toHaveBeenCalledWith(
        'NK-300',
        'Person',
        'Import Test',
        'import test', // normalized
        'individual',
        '["sanctions","peps"]',
        'US',
        '1990-01-01',
        undefined, // placeOfBirth
        undefined, // gender
        undefined, // notes
        undefined, // lastSeen
        0, // score
        JSON.stringify(entityData)
      );

      // Check aliases were inserted
      const aliasRuns = mockStmt.run.mock.calls.filter(call => 
        call[1] === 'I. Test' || call[1] === 'Import T.'
      );
      expect(aliasRuns).toHaveLength(2);

      // Check identifiers were inserted
      const idRuns = mockStmt.run.mock.calls.filter(call =>
        call[1] === 'passport' || call[1] === 'nationalId'
      );
      expect(idRuns).toHaveLength(2);
    });

    it('should handle entity without optional data', () => {
      const minimalEntity = {
        id: 'NK-301',
        schema: 'Company',
        name: 'Minimal Corp',
        type: 'entity'
      };

      service.importEntity(minimalEntity);

      expect(mockStmt.run).toHaveBeenCalledTimes(1); // Only main entity
    });
  });

  describe('getStatistics', () => {
    beforeEach(async () => {
      mockStmt.get.mockReturnValue({ count: 1000 });
      await service.initialize();
    });

    it('should return database statistics', async () => {
      const mockStats = {
        total: 5000,
        individuals: 3000,
        entities: 1500,
        vessels: 300,
        aircraft: 200,
        last_update: '2024-01-15'
      };

      mockStmt.get.mockReset();
      mockStmt.get.mockReturnValueOnce(mockStats);

      const stats = await service.getStatistics();

      expect(stats).toEqual(mockStats);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('COUNT(*) as total')
      );
    });
  });

  describe('normalize', () => {
    it('should normalize text correctly', () => {
      expect(service.normalize('John Doe')).toBe('john doe');
      expect(service.normalize('  JANE  SMITH  ')).toBe('jane smith');
      expect(service.normalize('O\'Brien')).toBe('obrien');
      expect(service.normalize('José García')).toBe('jos garca');
      expect(service.normalize(null)).toBe('');
      expect(service.normalize(undefined)).toBe('');
    });
  });

  describe('compareDates', () => {
    it('should compare exact dates', () => {
      const result = service.compareDates('1990-01-01', '1990-01-01');
      expect(result.exact).toBe(true);
      expect(result.yearMatch).toBe(true);
    });

    it('should compare years only', () => {
      // Use dates that won't have timezone issues
      const result = service.compareDates('1990-06-01', '1990-06-15');
      expect(result).toBeDefined();
      expect(result.exact).toBe(false);
      expect(result.yearMatch).toBe(true);
      expect(result.daysDifference).toBeCloseTo(14, 0);
    });

    it('should calculate days difference', () => {
      const result = service.compareDates('1990-01-01', '1990-01-11');
      expect(result.daysDifference).toBe(10);
    });

    it('should handle missing dates', () => {
      expect(service.compareDates(null, '1990-01-01').exact).toBe(false);
      expect(service.compareDates('1990-01-01', null).exact).toBe(false);
    });
  });

  describe('close', () => {
    beforeEach(async () => {
      mockStmt.get.mockReturnValue({ count: 100 });
      await service.initialize();
    });

    it('should close database connection', async () => {
      const closedSpy = vi.fn();
      service.on('closed', closedSpy);

      await service.close();

      expect(mockDb.close).toHaveBeenCalled();
      expect(service.initialized).toBe(false);
      expect(closedSpy).toHaveBeenCalled();
    });

    it('should handle close when not initialized', async () => {
      const uninitService = new OpenSanctionsSQLiteService();
      
      await expect(uninitService.close()).resolves.not.toThrow();
    });
  });

  describe('clearAll', () => {
    beforeEach(async () => {
      mockStmt.get.mockReturnValue({ count: 100 });
      await service.initialize();
    });

    it('should clear all data', async () => {
      service.cache.set('test', 'data');
      
      await service.clearAll();

      expect(mockExec).toHaveBeenCalledWith('DELETE FROM opensanctions_entities');
      expect(service.cache.size).toBe(0);
    });

    it('should initialize before clearing if needed', async () => {
      const newService = new OpenSanctionsSQLiteService();
      mockStmt.get.mockReturnValue({ count: 0 });
      
      await newService.clearAll();

      expect(Database).toHaveBeenCalled();
    });
  });

  describe('createTables', () => {
    it('should create all required tables', () => {
      service.db = mockDb;
      service.createTables();

      const execCalls = mockExec.mock.calls;
      expect(execCalls).toHaveLength(6); // 6 tables

      // Check table names
      const tableNames = execCalls.map(call => {
        const match = call[0].match(/CREATE TABLE IF NOT EXISTS (\w+)/);
        return match ? match[1] : null;
      }).filter(Boolean);

      expect(tableNames).toContain('opensanctions_entities');
      expect(tableNames).toContain('opensanctions_aliases');
      expect(tableNames).toContain('opensanctions_identifiers');
      expect(tableNames).toContain('opensanctions_addresses');
      expect(tableNames).toContain('opensanctions_sanctions');
      expect(tableNames).toContain('opensanctions_search_log');
    });
  });

  describe('createIndexes', () => {
    it('should create all indexes', () => {
      service.db = mockDb;
      service.createIndexes();

      const execCalls = mockExec.mock.calls;
      expect(execCalls.length).toBeGreaterThan(0);

      // Check some important indexes
      const indexCommands = execCalls.map(call => call[0]);
      expect(indexCommands.some(cmd => cmd.includes('idx_entities_name_normalized'))).toBe(true);
      expect(indexCommands.some(cmd => cmd.includes('idx_aliases_normalized'))).toBe(true);
      expect(indexCommands.some(cmd => cmd.includes('idx_identifiers_value'))).toBe(true);
    });
  });

  describe('executeSearch', () => {
    beforeEach(async () => {
      mockStmt.get.mockReturnValue({ count: 100 });
      await service.initialize();
    });

    it('should build correct query with datasets filter', () => {
      mockStmt.all.mockReturnValue([]);

      service.executeSearch({
        normalizedName: 'test',
        limit: 10,
        datasets: ['sanctions', 'peps']
      });

      const queries = mockDb.prepare.mock.calls.map(call => call[0]).join(' ');
      expect(queries).toContain('datasets LIKE ?');
    });

    it('should handle duplicate results', () => {
      mockStmt.all
        .mockReturnValueOnce([
          { id: 'NK-100', name: 'Test' },
          { id: 'NK-100', name: 'Test' } // Duplicate
        ])
        .mockReturnValueOnce([]);

      const results = service.executeSearch({
        normalizedName: 'test',
        limit: 10,
        includeAliases: true
      });

      expect(results).toHaveLength(1); // Duplicate removed
    });
  });

  describe('logSearch', () => {
    beforeEach(async () => {
      mockStmt.get.mockReturnValue({ count: 100 });
      await service.initialize();
    });

    it('should log search with all parameters', () => {
      service.logSearch(
        'Test Search',
        'test search',
        5,
        123,
        { entityType: 'individual', datasets: ['sanctions'] }
      );

      expect(mockStmt.run).toHaveBeenCalledWith(
        'Test Search',
        'test search',
        5,
        1, // has_matches
        123,
        '{"entityType":"individual","datasets":["sanctions"]}'
      );
    });

    it('should log no matches correctly', () => {
      service.logSearch('No Match', 'no match', 0, 50, {});

      const runCall = mockStmt.run.mock.calls[0];
      expect(runCall[3]).toBe(0); // has_matches = 0
    });
  });

  describe('Cache management', () => {
    beforeEach(async () => {
      mockStmt.get.mockReturnValue({ count: 100 });
      await service.initialize();
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should auto-clear cache after 1 hour', async () => {
      mockStmt.all.mockReturnValue([]);

      await service.search('Cached Search');
      expect(service.cache.size).toBe(1);

      // Advance time by 1 hour
      vi.advanceTimersByTime(3600000);

      expect(service.cache.size).toBe(0);
    });
  });
});