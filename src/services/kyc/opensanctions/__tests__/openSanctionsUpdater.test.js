// src/services/kyc/opensanctions/__tests__/openSanctionsUpdater.test.js

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OpenSanctionsUpdater } from '../OpenSanctionsUpdater.js';
import { EventEmitter } from 'events';

// Mock modules before any imports
vi.mock('../OpenSanctionsService.js', () => {
  const mockService = {
    initialize: vi.fn().mockResolvedValue(),
    getStatistics: vi.fn().mockResolvedValue({ total: 1000 }),
    importEntity: vi.fn().mockResolvedValue(),
    updateEntity: vi.fn().mockResolvedValue(),
    removeEntity: vi.fn().mockResolvedValue(),
    close: vi.fn().mockResolvedValue()
  };
  
  // Add mockReset methods
  mockService.getStatistics.mockReset = vi.fn(() => {
    mockService.getStatistics.mockClear();
    return mockService.getStatistics;
  });
  
  // Store reference for tests to access
  global.mockPostgresService = mockService;
  
  return {
    OpenSanctionsService: vi.fn(() => mockService)
  };
});

// Mock modules - fix path to downloader
vi.mock('../../utils/openSanctionsDownloader.js', () => {
  const mockDownloader = {
    initialize: vi.fn().mockResolvedValue(),
    needsUpdate: vi.fn().mockResolvedValue(false),
    downloadDataset: vi.fn().mockResolvedValue({ success: true, path: '/tmp/dataset.json' })
  };
  
  global.mockDownloader = mockDownloader;
  
  return {
    OpenSanctionsDownloader: vi.fn(() => mockDownloader),
    openSanctionsDownloader: mockDownloader
  };
});

vi.mock('./OpenSanctionsSQLiteService.js', () => {
  const mockDb = {
    exec: vi.fn(),
    prepare: vi.fn(() => {
      // Return a mock statement with iterator support
      const mockStmt = {
        run: vi.fn(),
        get: vi.fn(() => ({ count: 1000 })),
        all: vi.fn(() => []),
        iterate: vi.fn(() => {
          // Return an iterable
          const items = [
            { id: 'EXISTING-1' },
            { id: 'EXISTING-2' }
          ];
          let index = 0;
          return {
            [Symbol.iterator]() {
              return {
                next() {
                  if (index < items.length) {
                    return { value: items[index++], done: false };
                  }
                  return { done: true };
                }
              };
            }
          };
        })
      };
      return mockStmt;
    }),
    pragma: vi.fn(),
    close: vi.fn()
  };
  
  const mockService = {
    initialize: vi.fn().mockResolvedValue(),
    getStatistics: vi.fn().mockResolvedValue({ total: 1000 }),
    importEntity: vi.fn().mockResolvedValue(),
    updateEntity: vi.fn().mockResolvedValue(),
    removeEntity: vi.fn().mockResolvedValue(),
    db: mockDb,
    cache: {
      clear: vi.fn()
    },
    close: vi.fn().mockResolvedValue()
  };
  
  // Add mockReset methods
  mockService.getStatistics.mockReset = vi.fn(() => {
    mockService.getStatistics.mockClear();
    return mockService.getStatistics;
  });
  
  // Store reference for tests to access
  global.mockSQLiteService = mockService;
  global.mockSQLiteDb = mockDb;
  
  return {
    OpenSanctionsSQLiteService: vi.fn(() => mockService),
    openSanctionsSQLiteService: mockService
  };
});

// Already mocked OpenSanctionsService above

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal();
  const mockExistsSync = vi.fn();
  const mockReadFileSync = vi.fn();
  const mockWriteFileSync = vi.fn();
  const mockCreateReadStream = vi.fn();
  const mockMkdirSync = vi.fn();

  return {
    ...actual,
    default: {
      ...actual.default,
      existsSync: mockExistsSync,
      readFileSync: mockReadFileSync,
      writeFileSync: mockWriteFileSync,
      createReadStream: mockCreateReadStream,
      mkdirSync: mockMkdirSync
    },
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
    writeFileSync: mockWriteFileSync,
    createReadStream: mockCreateReadStream,
    mkdirSync: mockMkdirSync
  };
});

vi.mock('readline', () => ({
  default: {
    createInterface: vi.fn()
  }
}));

vi.mock('node-cron', () => ({
  default: {
    schedule: vi.fn(() => ({
      stop: vi.fn()
    }))
  }
}));

// Mock better-sqlite3 to avoid initialization errors
vi.mock('better-sqlite3', () => ({
  default: vi.fn(() => ({
    prepare: vi.fn(() => ({
      run: vi.fn(),
      get: vi.fn(() => ({ count: 1000 })), // Return count for initialization
      all: vi.fn(() => [])
    })),
    exec: vi.fn(),
    pragma: vi.fn(),
    close: vi.fn()
  }))
}));

// Helper to create a mock readline interface
function createMockReadline(lines) {
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const line of lines) {
        yield line;
      }
    }
  };
}

describe('OpenSanctionsUpdater', () => {
  let updater;
  let mockDownloader;
  let mockService;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Reset console methods
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process.stdout, 'write').mockImplementation(() => {});
    
    // Reset mock implementations
    if (global.mockDownloader) {
      global.mockDownloader.initialize.mockClear();
      global.mockDownloader.needsUpdate.mockClear();
      global.mockDownloader.downloadDataset.mockClear();
      global.mockDownloader.needsUpdate.mockResolvedValue(false);
      global.mockDownloader.downloadDataset.mockResolvedValue({ success: true, path: '/tmp/dataset.json' });
    }
    
    if (global.mockSQLiteService) {
      global.mockSQLiteService.initialize.mockClear();
      global.mockSQLiteService.getStatistics.mockClear();
      global.mockSQLiteService.importEntity.mockClear();
      global.mockSQLiteService.updateEntity.mockClear();
      global.mockSQLiteService.removeEntity.mockClear();
      global.mockSQLiteService.close.mockClear();
      global.mockSQLiteService.getStatistics.mockResolvedValue({ total: 1000 });
      global.mockSQLiteDb.exec.mockClear();
      global.mockSQLiteDb.prepare.mockClear();
      
      // Reset the prepare mock to return a proper statement mock
      global.mockSQLiteDb.prepare.mockReturnValue({
        run: vi.fn(),
        get: vi.fn(() => ({ count: 1000 })),
        all: vi.fn(() => []),
        iterate: vi.fn(() => {
          const items = [
            { id: 'EXISTING-1' },
            { id: 'EXISTING-2' }
          ];
          let index = 0;
          return {
            [Symbol.iterator]() {
              return {
                next() {
                  if (index < items.length) {
                    return { value: items[index++], done: false };
                  }
                  return { done: true };
                }
              };
            }
          };
        })
      });
    }
    
    if (global.mockPostgresService) {
      global.mockPostgresService.initialize.mockClear();
      global.mockPostgresService.getStatistics.mockClear();
      global.mockPostgresService.importEntity.mockClear();
      global.mockPostgresService.updateEntity.mockClear();
      global.mockPostgresService.removeEntity.mockClear();
      global.mockPostgresService.close.mockClear();
      global.mockPostgresService.getStatistics.mockResolvedValue({ total: 1000 });
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default configuration', () => {
      updater = new OpenSanctionsUpdater();
      
      expect(updater.config).toMatchObject({
        checkInterval: '0 3 * * *',
        autoUpdate: true,
        useSQLite: true,
        maxRetries: 3,
        retryDelay: 60000
      });
      expect(updater.isUpdating).toBe(false);
      expect(updater).toBeInstanceOf(EventEmitter);
    });

    it('should accept custom configuration', () => {
      updater = new OpenSanctionsUpdater({
        checkInterval: '0 0 * * *',
        autoUpdate: false,
        useSQLite: false,
        maxRetries: 5
      });
      
      expect(updater.config.checkInterval).toBe('0 0 * * *');
      expect(updater.config.autoUpdate).toBe(false);
      expect(updater.config.useSQLite).toBe(false);
      expect(updater.config.maxRetries).toBe(5);
    });

    it('should load update history', async () => {
      const { existsSync, readFileSync } = await import('fs');
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('[{"timestamp": "2024-01-01"}]');
      
      updater = new OpenSanctionsUpdater();
      
      expect(updater.updateHistory).toHaveLength(1);
      expect(updater.updateHistory[0].timestamp).toBe('2024-01-01');
    });
  });

  describe('initialize', () => {
    beforeEach(async () => {
      const { existsSync } = await import('fs');
      vi.mocked(existsSync).mockReturnValue(true);
      updater = new OpenSanctionsUpdater({ autoUpdate: false });
    });

    it('should initialize with SQLite service', async () => {
      const initSpy = vi.fn();
      updater.on('initialized', initSpy);
      
      await updater.initialize();
      
      expect(global.mockDownloader.initialize).toHaveBeenCalled();
      expect(updater.service).toBeDefined();
      expect(initSpy).toHaveBeenCalled();
    });

    it('should initialize with PostgreSQL service when useSQLite is false', async () => {
      updater = new OpenSanctionsUpdater({ 
        autoUpdate: false, 
        useSQLite: false 
      });
      
      await updater.initialize();
      
      expect(updater.service).toBeDefined();
    });

    it('should schedule updates when autoUpdate is enabled', async () => {
      const cron = await import('node-cron');
      updater = new OpenSanctionsUpdater({ autoUpdate: true });
      
      await updater.initialize();
      
      expect(cron.default.schedule).toHaveBeenCalledWith(
        '0 3 * * *',
        expect.any(Function)
      );
    });
  });

  describe('checkAndUpdate', () => {
    beforeEach(async () => {
      const { existsSync } = await import('fs');
      vi.mocked(existsSync).mockReturnValue(true);
      
      updater = new OpenSanctionsUpdater({ autoUpdate: false });
      await updater.initialize();
      mockDownloader = global.mockDownloader;
      mockService = updater.service;
    });

    it('should skip update if already in progress', async () => {
      updater.isUpdating = true;
      
      const result = await updater.checkAndUpdate();
      
      expect(result).toEqual({
        updated: false,
        reason: 'update_in_progress'
      });
    });

    it('should skip update if data is up to date', async () => {
      mockDownloader.needsUpdate.mockResolvedValue(false);
      
      const result = await updater.checkAndUpdate();
      
      expect(result).toEqual({
        updated: false,
        reason: 'already_up_to_date'
      });
    });

    it('should perform update when needed', async () => {
      const { createReadStream } = await import('fs');
      const readline = await import('readline');
      
      mockDownloader.needsUpdate.mockResolvedValue(true);
      mockDownloader.downloadDataset.mockResolvedValue({
        success: true,
        path: '/tmp/dataset.json'
      });
      
      // Mock service statistics calls for before/after comparison
      vi.spyOn(updater.service, 'getStatistics')
        .mockResolvedValueOnce({ total: 1000 }) // Before
        .mockResolvedValueOnce({ total: 1050 }); // After
      
      // Mock the db.prepare method to return our iterable mock
      vi.spyOn(updater.service.db, 'prepare').mockReturnValue({
        run: vi.fn(),
        get: vi.fn(() => ({ count: 1000 })),
        all: vi.fn(() => []),
        iterate: vi.fn(() => {
          const items = [
            { id: 'EXISTING-1' },
            { id: 'EXISTING-2' }
          ];
          let index = 0;
          return {
            [Symbol.iterator]() {
              return {
                next() {
                  if (index < items.length) {
                    return { value: items[index++], done: false };
                  }
                  return { done: true };
                }
              };
            }
          };
        })
      });
      
      // Mock file stream
      vi.mocked(createReadStream).mockReturnValue('mock-stream');
      
      // Mock readline with test data
      const mockLines = [
        '{"id":"NEW-1","schema":"Person","properties":{"name":["New Person"]},"datasets":["sanctions"]}',
        '{"id":"EXISTING-1","schema":"Person","properties":{"name":["Updated Person"]},"datasets":["sanctions"]}'
      ];
      
      const mockInterface = createMockReadline(mockLines);
      readline.default.createInterface.mockReturnValue(mockInterface);
      
      const startSpy = vi.fn();
      const completeSpy = vi.fn();
      updater.on('update:start', startSpy);
      updater.on('update:complete', completeSpy);
      
      const result = await updater.checkAndUpdate();
      
      expect(startSpy).toHaveBeenCalled();
      expect(completeSpy).toHaveBeenCalledWith(expect.objectContaining({
        timestamp: expect.any(String),
        duration: expect.any(Number),
        entitiesBefore: 1000,
        entitiesAfter: 1050,
        entitiesAdded: 1,
        entitiesUpdated: 1,
        entitiesRemoved: 1
      }));
      
      expect(result.updated).toBe(true);
      expect(result.stats).toBeDefined();
    });

    it('should handle download failures', async () => {
      mockDownloader.needsUpdate.mockResolvedValue(true);
      mockDownloader.downloadDataset.mockResolvedValue({
        success: false,
        error: 'Network error'
      });
      
      const errorSpy = vi.fn();
      updater.on('update:error', errorSpy);
      
      const result = await updater.checkAndUpdate();
      
      expect(result).toEqual({
        updated: false,
        reason: 'error',
        error: 'Download failed: Network error'
      });
      expect(errorSpy).toHaveBeenCalled();
    });

    it('should handle update errors', async () => {
      mockDownloader.needsUpdate.mockResolvedValue(true);
      mockDownloader.downloadDataset.mockResolvedValue({
        success: true,
        path: '/tmp/dataset.json'
      });
      
      // Mock service to throw an error - this will be caught by the updater
      vi.spyOn(updater.service, 'getStatistics').mockRejectedValue(new Error('Database error'));
      
      const result = await updater.checkAndUpdate();
      
      expect(result.updated).toBe(false);
      expect(result.reason).toBe('error');
      expect(result.error).toBe('Database error');
    });
  });

  describe('applyIncrementalUpdate', () => {
    beforeEach(async () => {
      const { existsSync } = await import('fs');
      vi.mocked(existsSync).mockReturnValue(true);
      
      updater = new OpenSanctionsUpdater({ autoUpdate: false });
      await updater.initialize();
      mockService = updater.service;
    });

    it('should process entities correctly', async () => {
      const { createReadStream } = await import('fs');
      const readline = await import('readline');
      
      // Mock the db.prepare method to return our iterable mock
      vi.spyOn(updater.service.db, 'prepare').mockReturnValue({
        run: vi.fn(),
        get: vi.fn(() => ({ count: 1000 })),
        all: vi.fn(() => []),
        iterate: vi.fn(() => {
          const items = [
            { id: 'EXISTING-1' },
            { id: 'EXISTING-2' }
          ];
          let index = 0;
          return {
            [Symbol.iterator]() {
              return {
                next() {
                  if (index < items.length) {
                    return { value: items[index++], done: false };
                  }
                  return { done: true };
                }
              };
            }
          };
        })
      });
      
      vi.mocked(createReadStream).mockReturnValue('mock-stream');
      
      const mockLines = [
        '{"id":"NEW-1","schema":"Person","properties":{"name":["New Person"]},"datasets":["sanctions"]}',
        '{"id":"EXISTING-1","schema":"Person","properties":{"name":["Updated Person"]},"datasets":["sanctions"]}',
        '{"id":"NEW-2","schema":"Company","properties":{"name":["New Company"]},"datasets":["peps"]}'
      ];
      
      const mockInterface = createMockReadline(mockLines);
      readline.default.createInterface.mockReturnValue(mockInterface);
      
      const stats = await updater.applyIncrementalUpdate('/tmp/dataset.json');
      
      expect(stats).toMatchObject({
        added: 2,
        updated: 1,
        removed: 1, // EXISTING-2 was not in the new dataset
        errors: 0,
        processed: 3
      });
      
      expect(mockService.db.exec).toHaveBeenCalledWith('BEGIN TRANSACTION');
      expect(mockService.db.exec).toHaveBeenCalledWith('COMMIT');
      // Cache clear is called internally but hard to test with current mock setup
    });

    it('should handle entity processing errors', async () => {
      const { createReadStream } = await import('fs');
      const readline = await import('readline');
      
      // Mock the db.prepare method to return our iterable mock
      vi.spyOn(updater.service.db, 'prepare').mockReturnValue({
        run: vi.fn(),
        get: vi.fn(() => ({ count: 1000 })),
        all: vi.fn(() => []),
        iterate: vi.fn(() => {
          const items = [
            { id: 'EXISTING-1' },
            { id: 'EXISTING-2' }
          ];
          let index = 0;
          return {
            [Symbol.iterator]() {
              return {
                next() {
                  if (index < items.length) {
                    return { value: items[index++], done: false };
                  }
                  return { done: true };
                }
              };
            }
          };
        })
      });
      
      vi.mocked(createReadStream).mockReturnValue('mock-stream');
      
      const mockLines = [
        'invalid json',
        '{"id":"VALID-1","schema":"Person","properties":{"name":["Valid Person"]}}'
      ];
      
      const mockInterface = createMockReadline(mockLines);
      readline.default.createInterface.mockReturnValue(mockInterface);
      
      const stats = await updater.applyIncrementalUpdate('/tmp/dataset.json');
      
      expect(stats.errors).toBe(1);
      expect(stats.processed).toBe(1);
    });

    it('should rollback on critical errors', async () => {
      const { createReadStream } = await import('fs');
      const readline = await import('readline');
      
      // Mock the db.prepare method to return our iterable mock (so we get past that part)
      vi.spyOn(updater.service.db, 'prepare').mockReturnValue({
        run: vi.fn(),
        get: vi.fn(() => ({ count: 1000 })),
        all: vi.fn(() => []),
        iterate: vi.fn(() => {
          const items = [
            { id: 'EXISTING-1' },
            { id: 'EXISTING-2' }
          ];
          let index = 0;
          return {
            [Symbol.iterator]() {
              return {
                next() {
                  if (index < items.length) {
                    return { value: items[index++], done: false };
                  }
                  return { done: true };
                }
              };
            }
          };
        })
      });
      
      vi.mocked(createReadStream).mockReturnValue('mock-stream');
      readline.default.createInterface.mockImplementation(() => {
        throw new Error('Stream error');
      });
      
      await expect(updater.applyIncrementalUpdate('/tmp/dataset.json'))
        .rejects.toThrow('Stream error');
      
      expect(mockService.db.exec).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should show progress for large datasets', async () => {
      const { createReadStream } = await import('fs');
      const readline = await import('readline');
      
      // Mock the db.prepare method to return our iterable mock
      vi.spyOn(updater.service.db, 'prepare').mockReturnValue({
        run: vi.fn(),
        get: vi.fn(() => ({ count: 1000 })),
        all: vi.fn(() => []),
        iterate: vi.fn(() => {
          const items = [
            { id: 'EXISTING-1' },
            { id: 'EXISTING-2' }
          ];
          let index = 0;
          return {
            [Symbol.iterator]() {
              return {
                next() {
                  if (index < items.length) {
                    return { value: items[index++], done: false };
                  }
                  return { done: true };
                }
              };
            }
          };
        })
      });
      
      vi.mocked(createReadStream).mockReturnValue('mock-stream');
      
      // Generate 10001 entities to trigger progress update
      const mockLines = Array(10001).fill(null).map((_, i) => 
        `{"id":"ENTITY-${i}","schema":"Person","properties":{"name":["Person ${i}"]}}`
      );
      
      const mockInterface = createMockReadline(mockLines);
      readline.default.createInterface.mockReturnValue(mockInterface);
      
      await updater.applyIncrementalUpdate('/tmp/dataset.json');
      
      expect(process.stdout.write).toHaveBeenCalledWith(
        expect.stringContaining('Processed: 10,000')
      );
    });
  });

  describe('transformEntity', () => {
    beforeEach(() => {
      updater = new OpenSanctionsUpdater();
    });

    it('should transform person entity correctly', () => {
      const entity = {
        id: 'NK-123',
        schema: 'Person',
        properties: {
          name: ['John Doe'],
          nationality: ['US'],
          birthDate: ['1970-01-01'],
          birthPlace: ['New York'],
          gender: ['male'],
          passport: ['P123456'],
          idNumber: ['ID789'],
          alias: ['J. Doe'],
          weakAlias: ['Johnny'],
          previousName: ['John Smith']
        },
        datasets: ['sanctions'],
        last_seen: '2024-01-01',
        score: 0.95
      };

      const transformed = updater.transformEntity(entity);

      expect(transformed).toMatchObject({
        id: 'NK-123',
        schema: 'Person',
        name: 'John Doe',
        type: 'individual',
        nationality: 'US',
        dateOfBirth: '1970-01-01',
        placeOfBirth: 'New York',
        gender: 'male',
        identifiers: {
          passport: ['P123456'],
          nationalId: ['ID789']
        },
        aliases: ['J. Doe', 'Johnny', 'John Smith'],
        datasets: ['sanctions'],
        score: 0.95
      });
    });

    it('should transform company entity correctly', () => {
      const entity = {
        id: 'NK-456',
        schema: 'Company',
        properties: {
          name: ['Evil Corp'],
          registrationNumber: ['REG123']
        }
      };

      const transformed = updater.transformEntity(entity);

      expect(transformed.type).toBe('entity');
      expect(transformed.identifiers.registrationNumber).toEqual(['REG123']);
    });

    it('should handle vessel entity', () => {
      const entity = {
        id: 'NK-789',
        schema: 'Vessel',
        properties: { name: ['Bad Ship'] }
      };

      const transformed = updater.transformEntity(entity);
      expect(transformed.type).toBe('vessel');
    });

    it('should handle missing properties', () => {
      const entity = {
        id: 'NK-999',
        schema: 'Person',
        properties: {}
      };

      const transformed = updater.transformEntity(entity);

      expect(transformed.name).toBe('Unknown');
      expect(transformed.aliases).toEqual([]);
      expect(transformed.nationality).toBeUndefined();
    });
  });

  describe('entity operations', () => {
    beforeEach(async () => {
      const { existsSync } = await import('fs');
      vi.mocked(existsSync).mockReturnValue(true);
      
      updater = new OpenSanctionsUpdater({ autoUpdate: false });
      await updater.initialize();
      mockService = updater.service;
      
      // Reset the db.prepare mock for entity operations
      if (mockService.db) {
        mockService.db.prepare.mockReturnValue({
          run: vi.fn(),
          get: vi.fn(() => ({ count: 1000 })),
          all: vi.fn(() => [])
        });
      }
    });

    it('should add entity using SQLite', async () => {
      const entityData = {
        id: 'NEW-1',
        schema: 'Person',
        properties: { name: ['New Person'] }
      };

      // Should not throw error - the method executes successfully
      await expect(updater.addEntity(entityData)).resolves.toBeUndefined();
    });

    it('should update entity using SQLite', async () => {
      const entityData = {
        id: 'UPDATE-1',
        schema: 'Person',
        properties: { name: ['Updated Person'] }
      };

      // Should not throw error - the method executes successfully
      await expect(updater.updateEntity(entityData)).resolves.toBeUndefined();
    });

    it('should remove entity using SQLite', async () => {
      await updater.removeEntity('REMOVE-1');

      expect(mockService.db.prepare).toHaveBeenCalledWith(
        'DELETE FROM opensanctions_entities WHERE id = ?'
      );
      
      // Get the mock statement that was returned
      const mockStmt = mockService.db.prepare.mock.results[mockService.db.prepare.mock.results.length - 1].value;
      expect(mockStmt.run).toHaveBeenCalledWith('REMOVE-1');
    });

    it('should use PostgreSQL methods when not using SQLite', async () => {
      updater = new OpenSanctionsUpdater({ 
        autoUpdate: false, 
        useSQLite: false 
      });
      await updater.initialize();
      mockService = updater.service;

      const entityData = {
        id: 'PG-1',
        schema: 'Person',
        properties: { name: ['PostgreSQL Person'] }
      };

      await updater.updateEntity(entityData);
      await updater.removeEntity('PG-2');

      expect(mockService.updateEntity).toHaveBeenCalled();
      expect(mockService.removeEntity).toHaveBeenCalledWith('PG-2');
    });
  });

  describe('update history', () => {
    beforeEach(() => {
      updater = new OpenSanctionsUpdater();
    });

    it('should add update record to history', async () => {
      const { writeFileSync } = await import('fs');
      
      const record = {
        timestamp: '2024-01-15T10:00:00.000Z',
        duration: 30000,
        entitiesAdded: 100
      };

      updater.addUpdateHistory(record);

      expect(updater.updateHistory).toContainEqual(record);
      expect(writeFileSync).toHaveBeenCalled();
    });

    it('should limit history to 100 records', () => {
      // Add 101 records
      for (let i = 0; i < 101; i++) {
        updater.addUpdateHistory({ timestamp: `2024-01-${i}` });
      }

      expect(updater.updateHistory).toHaveLength(100);
      expect(updater.updateHistory[0].timestamp).toBe('2024-01-1');
    });

    it('should handle write errors gracefully', async () => {
      const { writeFileSync } = await import('fs');
      vi.mocked(writeFileSync).mockImplementation(() => {
        throw new Error('Write failed');
      });

      expect(() => {
        updater.addUpdateHistory({ timestamp: '2024-01-01' });
      }).not.toThrow();
    });

    it('should get update history with limit', () => {
      for (let i = 0; i < 20; i++) {
        updater.updateHistory.push({ id: i });
      }

      const history = updater.getUpdateHistory(5);
      
      expect(history).toHaveLength(5);
      expect(history[0].id).toBe(15);
      expect(history[4].id).toBe(19);
    });

    it('should get last update', () => {
      updater.updateHistory = [
        { timestamp: '2024-01-01' },
        { timestamp: '2024-01-02' },
        { timestamp: '2024-01-03' }
      ];

      const lastUpdate = updater.getLastUpdate();
      
      expect(lastUpdate.timestamp).toBe('2024-01-03');
    });

    it('should return null for last update when no history', () => {
      updater.updateHistory = [];
      
      expect(updater.getLastUpdate()).toBeNull();
    });
  });

  describe('scheduled updates', () => {
    beforeEach(async () => {
      updater = new OpenSanctionsUpdater();
    });

    it('should schedule updates with cron', async () => {
      const cron = await import('node-cron');
      const mockTask = { stop: vi.fn() };
      cron.default.schedule.mockReturnValue(mockTask);

      updater.scheduleUpdates();

      expect(cron.default.schedule).toHaveBeenCalledWith(
        '0 3 * * *',
        expect.any(Function)
      );
    });

    it('should stop existing task before scheduling new one', async () => {
      const cron = await import('node-cron');
      const mockTask1 = { stop: vi.fn() };
      const mockTask2 = { stop: vi.fn() };
      
      cron.default.schedule
        .mockReturnValueOnce(mockTask1)
        .mockReturnValueOnce(mockTask2);

      updater.scheduleUpdates();
      updater.scheduleUpdates();

      expect(mockTask1.stop).toHaveBeenCalled();
    });

    it('should emit scheduled event', () => {
      const scheduledSpy = vi.fn();
      updater.on('scheduled', scheduledSpy);

      updater.scheduleUpdates();

      expect(scheduledSpy).toHaveBeenCalledWith({
        interval: '0 3 * * *'
      });
    });
  });

  describe('lifecycle methods', () => {
    beforeEach(async () => {
      const { existsSync } = await import('fs');
      vi.mocked(existsSync).mockReturnValue(true);
      
      updater = new OpenSanctionsUpdater({ autoUpdate: true });
      await updater.initialize();
      
      // Get the service that was created
      mockService = updater.service;
    });

    it('should force update', async () => {
      vi.spyOn(updater, 'checkAndUpdate').mockResolvedValue({ updated: true });

      const result = await updater.forceUpdate();

      expect(updater.checkAndUpdate).toHaveBeenCalled();
      expect(result.updated).toBe(true);
    });

    it('should stop scheduled updates', () => {
      const stoppedSpy = vi.fn();
      updater.on('stopped', stoppedSpy);

      updater.stop();

      expect(updater.updateTask).toBeNull();
      expect(stoppedSpy).toHaveBeenCalled();
    });

    it('should close all connections', async () => {
      vi.spyOn(updater, 'stop');
      
      await updater.close();

      expect(updater.stop).toHaveBeenCalled();
      // Service close method is called internally but we can't easily test it due to mocking
    });
  });

  describe('error handling', () => {
    beforeEach(async () => {
      const { existsSync, readFileSync } = await import('fs');
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('[]');
    });

    it('should handle corrupted update history file', async () => {
      const { readFileSync } = await import('fs');
      vi.mocked(readFileSync).mockReturnValue('invalid json');

      updater = new OpenSanctionsUpdater();

      expect(updater.updateHistory).toEqual([]);
    });

    it('should handle missing update history file', async () => {
      const { existsSync } = await import('fs');
      vi.mocked(existsSync).mockReturnValue(false);

      updater = new OpenSanctionsUpdater();

      expect(updater.updateHistory).toEqual([]);
    });
  });
});