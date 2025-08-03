// src/services/kyc/utils/__tests__/openSanctionsDownloader.test.js

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OpenSanctionsDownloader } from '../openSanctionsDownloader.js';
import fs from 'fs/promises';
import { createReadStream, createWriteStream } from 'fs';
import https from 'https';
import { EventEmitter, PassThrough, Readable } from 'stream';
import path from 'path';

// Mock modules
vi.mock('fs/promises');
vi.mock('fs', () => ({
  createReadStream: vi.fn(),
  createWriteStream: vi.fn()
}));
vi.mock('https');
vi.mock('readline', async () => {
  const actual = await vi.importActual('readline');
  return {
    ...actual,
    createInterface: vi.fn(() => {
      const mockInterface = {
        [Symbol.asyncIterator]: async function* () {
          // Return mock lines
          yield '{"id":"NK-123","schema":"Person","properties":{"name":["John Doe"],"nationality":["US"],"birthDate":["1970-01-01"]},"datasets":["sanctions"],"last_seen":"2024-01-01"}';
          yield '{"id":"NK-124","schema":"Company","properties":{"name":["Evil Corp"],"country":["RU"]},"datasets":["sanctions"],"last_seen":"2024-01-01"}';
          yield '{"id":"NK-125","schema":"Person","properties":{"name":["Jane Smith"],"alias":["J. Smith"]},"datasets":["peps"],"last_seen":"2024-01-01"}';
        },
        close: vi.fn()
      };
      return mockInterface;
    })
  };
});

// Mock fuzzyMatcher module
vi.mock('../fuzzyMatcher.js', () => ({
  fuzzyMatcher: {
    match: vi.fn((searchName, targetName) => {
      const exactMatch = searchName.toLowerCase() === targetName.toLowerCase();
      return {
        isMatch: exactMatch || targetName.toLowerCase().includes(searchName.toLowerCase()),
        score: exactMatch ? 1.0 : 0.8
      };
    })
  }
}));

describe('OpenSanctionsDownloader', () => {
  let downloader;
  let mockWriteStream;
  let mockReadStream;

  beforeEach(() => {
    downloader = new OpenSanctionsDownloader();
    
    // Mock fs methods
    fs.mkdir.mockResolvedValue();
    fs.rename.mockResolvedValue();
    fs.stat.mockResolvedValue({ 
      size: 1024 * 1024 * 10, // 10MB
      mtime: new Date()
    });
    fs.access.mockResolvedValue();
    fs.unlink.mockResolvedValue();
    
    // Mock write stream
    mockWriteStream = new EventEmitter();
    mockWriteStream.close = vi.fn((cb) => cb && cb());
    createWriteStream.mockReturnValue(mockWriteStream);
    
    // Mock read stream
    mockReadStream = new Readable({
      read() {}
    });
    createReadStream.mockReturnValue(mockReadStream);
    
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialize', () => {
    it('should create data directory', async () => {
      await downloader.initialize();
      
      expect(fs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('data/opensanctions'),
        { recursive: true }
      );
    });

    it('should handle directory creation errors', async () => {
      fs.mkdir.mockRejectedValueOnce(new Error('Permission denied'));
      
      // Should not throw
      await expect(downloader.initialize()).resolves.not.toThrow();
    });
  });

  describe('downloadDataset', () => {
    it('should download default dataset successfully', async () => {
      // Mock successful download
      const mockResponse = new PassThrough();
      mockResponse.statusCode = 200;
      mockResponse.headers = {
        'content-length': '10485760' // 10MB
      };
      
      https.get.mockImplementation((url, callback) => {
        setImmediate(() => {
          callback(mockResponse);
          // Pipe to write stream
          mockResponse.pipe = vi.fn(() => mockResponse);
          setImmediate(() => {
            mockWriteStream.emit('finish');
          });
        });
        return mockResponse;
      });

      const summary = await downloader.downloadDataset('default');
      
      expect(https.get).toHaveBeenCalled();
      expect(fs.rename).toHaveBeenCalled();
      expect(summary).toBeDefined();
    });

    it('should handle unknown dataset', async () => {
      await expect(downloader.downloadDataset('invalid'))
        .rejects.toThrow('Unknown dataset: invalid');
    });

    it('should handle download errors', async () => {
      const mockResponse = new EventEmitter();
      mockResponse.statusCode = 404;
      mockResponse.statusMessage = 'Not Found';
      
      https.get.mockImplementation((url, callback) => {
        setImmediate(() => callback(mockResponse));
        return mockResponse;
      });

      await expect(downloader.downloadDataset('default'))
        .rejects.toThrow('HTTP 404: Not Found');
    });

    it('should follow redirects', async () => {
      const mockRedirect = new EventEmitter();
      mockRedirect.statusCode = 302;
      mockRedirect.headers = {
        location: 'https://new-location.com/file.json'
      };
      
      const mockFinal = new PassThrough();
      mockFinal.statusCode = 200;
      mockFinal.headers = {
        'content-length': '1000'
      };
      mockFinal.pipe = vi.fn(() => mockFinal);
      
      let callCount = 0;
      https.get.mockImplementation((url, callback) => {
        if (callCount === 0) {
          callCount++;
          setImmediate(() => callback(mockRedirect));
          return mockRedirect;
        } else {
          setImmediate(() => {
            callback(mockFinal);
            setImmediate(() => mockWriteStream.emit('finish'));
          });
          return mockFinal;
        }
      });

      await downloader.downloadDataset('default');
      
      expect(https.get).toHaveBeenCalledTimes(2);
    });
  });

  describe('parseDataset', () => {
    it('should parse dataset successfully', async () => {
      const entities = await downloader.parseDataset('default', 3);
      
      expect(entities).toHaveLength(3);
      expect(entities[0]).toHaveProperty('id', 'NK-123');
      expect(entities[0]).toHaveProperty('name', 'John Doe');
      expect(entities[0]).toHaveProperty('type', 'individual');
    });

    it('should handle missing file', async () => {
      fs.access.mockRejectedValueOnce(new Error('File not found'));
      
      const entities = await downloader.parseDataset('default');
      
      expect(entities).toEqual([]);
    });
  });

  describe('transformEntity', () => {
    it('should transform person entity correctly', () => {
      const rawEntity = {
        id: 'NK-123',
        schema: 'Person',
        properties: {
          name: ['John Doe', 'J. Doe'],
          nationality: ['US'],
          birthDate: ['1970-01-01'],
          birthPlace: ['New York'],
          gender: ['male'],
          passportNumber: ['123456789'],
          address: ['123 Main St'],
          country: ['US'],
          program: ['OFAC SDN'],
          authority: ['US Treasury'],
          reason: ['Terrorism'],
          startDate: ['2020-01-01']
        },
        datasets: ['sanctions'],
        last_seen: '2024-01-01',
        score: 0.95
      };

      const transformed = downloader.transformEntity(rawEntity);
      
      expect(transformed).toMatchObject({
        id: 'NK-123',
        schema: 'Person',
        name: 'John Doe',
        aliases: ['J. Doe'],
        type: 'individual',
        nationality: 'US',
        dateOfBirth: '1970-01-01',
        placeOfBirth: 'New York',
        gender: 'male',
        identifiers: {
          passport: ['123456789']
        },
        addresses: [{
          full: '123 Main St',
          country: 'US'
        }],
        sanctions: {
          programs: ['OFAC SDN'],
          authority: ['US Treasury'],
          reason: 'Terrorism',
          startDate: '2020-01-01',
          endDate: null
        },
        score: 0.95
      });
    });

    it('should transform company entity correctly', () => {
      const rawEntity = {
        id: 'NK-456',
        schema: 'Company',
        properties: {
          name: ['Evil Corp'],
          alias: ['EC Inc'],
          country: ['RU'],
          address: ['Moscow, Russia']
        },
        datasets: ['sanctions']
      };

      const transformed = downloader.transformEntity(rawEntity);
      
      expect(transformed).toMatchObject({
        id: 'NK-456',
        schema: 'Company',
        name: 'Evil Corp',
        aliases: ['EC Inc'],
        type: 'entity'
      });
    });

    it('should handle partial dates', () => {
      const rawEntity = {
        id: 'NK-789',
        schema: 'Person',
        properties: {
          name: ['Test Person'],
          birthDate: ['1970']
        }
      };

      const transformed = downloader.transformEntity(rawEntity);
      
      expect(transformed.dateOfBirth).toBe('1970-01-01');
    });

    it('should handle missing properties gracefully', () => {
      const rawEntity = {
        id: 'NK-999',
        schema: 'Person',
        properties: {}
      };

      const transformed = downloader.transformEntity(rawEntity);
      
      expect(transformed.name).toBe('Unknown');
      expect(transformed.aliases).toEqual([]);
      expect(transformed.nationality).toBe(null);
    });
  });

  describe('extractAliases', () => {
    it('should extract all alias types', () => {
      const properties = {
        name: ['Primary Name', 'Second Name'],
        alias: ['Alias 1', 'Alias 2'],
        previousName: ['Old Name'],
        weakAlias: ['Weak Alias']
      };

      const aliases = downloader.extractAliases(properties);
      
      expect(aliases).toContain('Second Name');
      expect(aliases).toContain('Alias 1');
      expect(aliases).toContain('Alias 2');
      expect(aliases).toContain('Old Name');
      expect(aliases).toContain('Weak Alias');
      expect(aliases).toHaveLength(5);
    });

    it('should remove duplicates', () => {
      const properties = {
        name: ['John Doe', 'J. Doe'],
        alias: ['J. Doe', 'Johnny']
      };

      const aliases = downloader.extractAliases(properties);
      
      expect(aliases).toEqual(['J. Doe', 'Johnny']);
    });
  });

  describe('searchEntities', () => {
    beforeEach(async () => {
      // Reset readline mock for search tests
      const mockSearchLines = [
        '{"id":"NK-001","schema":"Person","properties":{"name":["John Doe"],"alias":["Johnny Doe"]},"datasets":["sanctions"]}',
        '{"id":"NK-002","schema":"Person","properties":{"name":["Jane Smith"],"alias":["J. Smith"]},"datasets":["peps"]}',
        '{"id":"NK-003","schema":"Company","properties":{"name":["Doe Enterprises"]},"datasets":["sanctions"]}'
      ];
      
      const readlineModule = await import('readline');
      vi.mocked(readlineModule).createInterface.mockImplementation(() => ({
        [Symbol.asyncIterator]: async function* () {
          for (const line of mockSearchLines) {
            yield line;
          }
        },
        close: vi.fn()
      }));
    });

    it('should search entities by name', async () => {
      const results = await downloader.searchEntities('John Doe');
      
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].entity.name).toBe('John Doe');
      expect(results[0].matchType).toBe('primary_name');
      expect(results[0].matchScore).toBe(1.0);
    });

    it('should search entities by alias', async () => {
      const results = await downloader.searchEntities('Johnny Doe');
      
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].entity.aliases).toContain('Johnny Doe');
      expect(results[0].matchType).toBe('alias');
    });

    it('should respect maxResults limit', async () => {
      // Update mock to return more lines than the limit
      const readlineModule = await import('readline');
      vi.mocked(readlineModule).createInterface.mockImplementation(() => ({
        [Symbol.asyncIterator]: async function* () {
          // Return more than 2 results
          for (let i = 0; i < 5; i++) {
            yield `{"id":"NK-00${i}","schema":"Person","properties":{"name":["Doe Person ${i}"]},"datasets":["sanctions"]}`;
          }
        },
        close: vi.fn()
      }));
      
      const results = await downloader.searchEntities('Doe', { maxResults: 2 });
      
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('should handle missing dataset file', async () => {
      fs.access.mockRejectedValueOnce(new Error('File not found'));
      
      const results = await downloader.searchEntities('John Doe');
      
      expect(results).toEqual([]);
    });
  });

  describe('getDatasetSummary', () => {
    it('should calculate dataset summary', async () => {
      const summary = await downloader.getDatasetSummary('/path/to/file.json');
      
      expect(summary).toHaveProperty('total', 3);
      expect(summary).toHaveProperty('persons', 2);
      expect(summary).toHaveProperty('entities', 1);
      expect(summary).toHaveProperty('peps', 1);
      expect(summary).toHaveProperty('sanctions', 2);
    });

    it('should handle file read errors', async () => {
      const readlineModule = await import('readline');
      vi.mocked(readlineModule).createInterface.mockImplementationOnce(() => {
        throw new Error('Read error');
      });
      
      const summary = await downloader.getDatasetSummary('/path/to/file.json');
      
      expect(summary).toBe(null);
    });
  });

  describe('needsUpdate', () => {
    it('should return true for old files', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 10); // 10 days old
      
      fs.stat.mockResolvedValueOnce({
        mtime: oldDate
      });
      
      const needsUpdate = await downloader.needsUpdate('default');
      
      expect(needsUpdate).toBe(true);
    });

    it('should return false for recent files', async () => {
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 3); // 3 days old
      
      fs.stat.mockResolvedValueOnce({
        mtime: recentDate
      });
      
      const needsUpdate = await downloader.needsUpdate('default');
      
      expect(needsUpdate).toBe(false);
    });

    it('should return true for non-existent files', async () => {
      fs.stat.mockRejectedValueOnce(new Error('File not found'));
      
      const needsUpdate = await downloader.needsUpdate('default');
      
      expect(needsUpdate).toBe(true);
    });
  });

  describe('getDatasetInfo', () => {
    it('should return info for all datasets', async () => {
      const info = await downloader.getDatasetInfo();
      
      expect(info).toHaveProperty('default');
      expect(info).toHaveProperty('sanctions');
      expect(info).toHaveProperty('peps');
      expect(info).toHaveProperty('crime');
      
      expect(info.default).toMatchObject({
        name: 'Default Dataset',
        exists: true,
        lastUpdated: expect.any(Date),
        size: 10485760
      });
    });

    it('should handle non-existent datasets', async () => {
      fs.stat.mockRejectedValue(new Error('File not found'));
      
      const info = await downloader.getDatasetInfo();
      
      expect(info.default.exists).toBe(false);
    });
  });

  describe('extractIdentifiers', () => {
    it('should extract all identifier types', () => {
      const properties = {
        passportNumber: ['P123456'],
        nationalId: ['ID789'],
        taxNumber: ['TAX123'],
        innCode: ['INN456']
      };

      const identifiers = downloader.extractIdentifiers(properties);
      
      expect(identifiers).toEqual({
        passport: ['P123456'],
        nationalId: ['ID789'],
        taxId: ['TAX123'],
        inn: ['INN456']
      });
    });
  });

  describe('extractSanctions', () => {
    it('should extract sanctions information', () => {
      const properties = {
        program: ['OFAC SDN', 'UN Sanctions'],
        authority: ['US Treasury', 'UN'],
        reason: ['Terrorism'],
        startDate: ['2020-01-01'],
        endDate: ['2025-01-01']
      };

      const sanctions = downloader.extractSanctions(properties);
      
      expect(sanctions).toEqual({
        programs: ['OFAC SDN', 'UN Sanctions'],
        authority: ['US Treasury', 'UN'],
        reason: 'Terrorism',
        startDate: '2020-01-01',
        endDate: '2025-01-01'
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle special schemas', () => {
      const vesselEntity = {
        id: 'NK-VESSEL',
        schema: 'Vessel',
        properties: { name: ['Bad Ship'] }
      };

      const transformed = downloader.transformEntity(vesselEntity);
      expect(transformed.type).toBe('vessel');
    });

    it('should handle unknown schemas', () => {
      const unknownEntity = {
        id: 'NK-UNK',
        schema: 'UnknownType',
        properties: { name: ['Unknown'] }
      };

      const transformed = downloader.transformEntity(unknownEntity);
      expect(transformed.type).toBe('unknown');
    });

    it('should handle partial date formats', () => {
      expect(downloader.extractDate(['1970'])).toBe('1970-01-01');
      expect(downloader.extractDate(['1970-06'])).toBe('1970-06-01');
      expect(downloader.extractDate(['1970-06-15'])).toBe('1970-06-15');
      expect(downloader.extractDate([])).toBe(null);
    });
  });

  describe('Download error handling', () => {
    it('should clean up temp file on error', async () => {
      const mockResponse = new PassThrough();
      mockResponse.statusCode = 200;
      mockResponse.headers = { 'content-length': '1000' };
      
      https.get.mockImplementation((url, callback) => {
        setImmediate(() => {
          callback(mockResponse);
          mockWriteStream.emit('error', new Error('Write error'));
        });
        return mockResponse;
      });

      await expect(downloader.downloadDataset('default'))
        .rejects.toThrow();
      
      expect(fs.unlink).toHaveBeenCalled();
    });

    it('should handle response errors', async () => {
      const mockResponse = new EventEmitter();
      mockResponse.statusCode = 200;
      mockResponse.headers = { 'content-length': '1000' };
      mockResponse.pipe = vi.fn();
      
      https.get.mockImplementation((url, callback) => {
        setImmediate(() => {
          callback(mockResponse);
          mockResponse.emit('error', new Error('Response error'));
        });
        return mockResponse;
      });

      await expect(downloader.downloadFile('https://example.com', '/tmp/file'))
        .rejects.toThrow('Response error');
    });
  });
});