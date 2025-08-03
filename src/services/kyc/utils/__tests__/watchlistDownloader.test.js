// src/services/kyc/utils/__tests__/watchlistDownloader.test.js

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WatchlistDownloader } from '../watchlistDownloader.js';
import fs from 'fs/promises';
import path from 'path';
import https from 'https';
import { EventEmitter } from 'events';

// Mock modules
vi.mock('fs/promises');
vi.mock('https');
vi.mock('xml2js', () => {
  const ParserMock = vi.fn().mockImplementation(() => ({
    parseStringPromise: vi.fn().mockImplementation((xml) => {
      // Simple mock XML parsing
      if (xml.includes('sdnList')) {
        return Promise.resolve({
          sdnList: {
            sdnEntry: [
              {
                uid: '123',
                firstName: 'John',
                lastName: 'Doe',
                sdnType: 'Individual',
                programList: { program: 'IRAN' },
                nationalityList: { nationality: 'Iranian' },
                dateOfBirthList: { dateOfBirth: { dateOfBirth: '1970-01-01' } },
                akaList: { aka: { firstName: 'Johnny', lastName: 'Doe' } },
                addressList: { address: { address1: '123 Main St', city: 'Tehran', country: 'Iran' } }
              }
            ]
          }
        });
      } else if (xml.includes('CONSOLIDATED_LIST')) {
        return Promise.resolve({
          CONSOLIDATED_LIST: {
            INDIVIDUALS: {
              INDIVIDUAL: {
                DATAID: '456',
                FIRST_NAME: 'Jane',
                FOURTH_NAME: 'Smith',
                DESIGNATION: { VALUE: 'Terrorist' },
                NATIONALITY: { VALUE: 'Syrian' },
                INDIVIDUAL_DATE_OF_BIRTH: { DATE: '1980-01-01' },
                INDIVIDUAL_ALIAS: { ALIAS_NAME: 'Jane Doe' },
                INDIVIDUAL_ADDRESS: { STREET: '456 Oak St', CITY: 'Damascus', COUNTRY: 'Syria' }
              }
            },
            ENTITIES: {
              ENTITY: {
                DATAID: '789',
                FIRST_NAME: 'Evil Corp',
                ENTITY_ADDRESS: { STREET: '789 Evil Ave', CITY: 'Moscow', COUNTRY: 'Russia' }
              }
            }
          }
        });
      } else if (xml.includes('sanctionEntity')) {
        return Promise.resolve({
          export: {
            sanctionEntity: {
              $: { euReferenceNumber: 'EU123' },
              nameAlias: [
                { $: { primaryName: 'true', wholeName: 'Robert Johnson' } },
                { $: { primaryName: 'false', wholeName: 'Bob Johnson' } }
              ],
              subjectType: { $: { classificationCode: 'P' } },
              regulation: { $: { programme: 'Syria' } },
              birthdate: { $: { year: '1975', month: '06', day: '15' } },
              citizenship: { $: { countryIso2Code: 'SY' } },
              address: { $: { street: '111 First St', city: 'Aleppo', countryIso2Code: 'SY' } }
            }
          }
        });
      } else if (xml.includes('ConsolidatedList')) {
        return Promise.resolve({
          ConsolidatedList: {
            Individuals: {
              Individual: {
                $: { FixedRef: 'UK001' },
                Names: {
                  Name: [
                    { $: { name1: 'Michael', name6: 'Brown' } },
                    { $: { name1: 'Mike', name6: 'Brown' } }
                  ]
                },
                DOBs: { DOB: '1985-03-20' },
                Nationality: 'British',
                Addresses: {
                  Address: {
                    $: {
                      address1: '10 Downing St',
                      city: 'London',
                      postCode: 'SW1A 2AA',
                      country: 'UK'
                    }
                  }
                }
              }
            }
          }
        });
      }
      return Promise.resolve({});
    })
  }));
  
  return {
    default: {
      Parser: ParserMock
    },
    Parser: ParserMock
  };
});

describe('WatchlistDownloader', () => {
  let downloader;
  let mockHttpsResponse;

  beforeEach(() => {
    downloader = new WatchlistDownloader();
    
    // Mock fs methods
    fs.mkdir.mockResolvedValue();
    fs.readFile.mockRejectedValue(new Error('No cache'));
    fs.writeFile.mockResolvedValue();
    
    // Create mock HTTPS response
    mockHttpsResponse = new EventEmitter();
    mockHttpsResponse.statusCode = 200;
    mockHttpsResponse.statusMessage = 'OK';
    
    // Mock https.get
    const mockRequest = new EventEmitter();
    https.get.mockImplementation((url, callback) => {
      setTimeout(() => callback(mockHttpsResponse), 0);
      return mockRequest;
    });
    
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialize', () => {
    it('should create data directory', async () => {
      await downloader.initialize();
      
      expect(fs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('data/watchlists'),
        { recursive: true }
      );
    });

    it('should handle directory creation errors', async () => {
      fs.mkdir.mockRejectedValueOnce(new Error('Permission denied'));
      
      // Should not throw
      await expect(downloader.initialize()).resolves.not.toThrow();
    });
  });

  describe('downloadAllWatchlists', () => {
    it('should download all configured watchlists', async () => {
      // Mock successful downloads
      const mockXmlData = '<sdnList><sdnEntry><uid>123</uid></sdnEntry></sdnList>';
      
      // Emit data for each request
      https.get.mockImplementation((url, callback) => {
        const response = new EventEmitter();
        response.statusCode = 200;
        
        setImmediate(() => {
          callback(response);
          response.emit('data', mockXmlData);
          response.emit('end');
        });
        
        return new EventEmitter();
      });

      const results = await downloader.downloadAllWatchlists();
      
      // Should have downloaded all sources
      const totalSources = Object.keys(downloader.sources).length;
      expect(results.success.length + results.failed.length).toBe(totalSources);
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('should handle download failures gracefully', async () => {
      // Mock failed download
      https.get.mockImplementation((url, callback) => {
        const response = new EventEmitter();
        response.statusCode = 404;
        response.statusMessage = 'Not Found';
        
        setTimeout(() => callback(response), 0);
        
        return new EventEmitter();
      });

      const results = await downloader.downloadAllWatchlists();
      
      expect(results.failed.length).toBeGreaterThan(0);
      expect(results.success.length).toBe(0);
    });
  });

  describe('downloadWatchlist', () => {
    it('should use cached data when available and fresh', async () => {
      const cachedData = {
        source: 'ofac',
        lastUpdated: new Date(),
        entryCount: 10,
        entries: [{ uid: '123', name: 'John Doe' }]
      };
      
      fs.readFile.mockResolvedValueOnce(JSON.stringify(cachedData));
      
      const result = await downloader.downloadWatchlist('ofac', downloader.sources.ofac);
      
      expect(result).toEqual(cachedData.entries);
      expect(https.get).not.toHaveBeenCalled();
    });

    it('should download fresh data when cache is expired', async () => {
      const oldCache = {
        source: 'ofac',
        lastUpdated: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10 days old
        entries: []
      };
      
      fs.readFile.mockResolvedValueOnce(JSON.stringify(oldCache));
      
      // Mock successful download
      const mockXml = '<sdnList><sdnEntry><uid>123</uid></sdnEntry></sdnList>';
      https.get.mockImplementation((url, callback) => {
        const response = new EventEmitter();
        response.statusCode = 200;
        
        setTimeout(() => {
          callback(response);
          response.emit('data', mockXml);
          response.emit('end');
        }, 0);
        
        return new EventEmitter();
      });

      const result = await downloader.downloadWatchlist('ofac', downloader.sources.ofac);
      
      expect(https.get).toHaveBeenCalled();
      expect(fs.writeFile).toHaveBeenCalled();
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('downloadFile', () => {
    it('should download file successfully', async () => {
      const mockData = '<xml>test data</xml>';
      
      https.get.mockImplementation((url, callback) => {
        const response = new EventEmitter();
        response.statusCode = 200;
        
        setTimeout(() => {
          callback(response);
          response.emit('data', mockData);
          response.emit('end');
        }, 0);
        
        return new EventEmitter();
      });

      const result = await downloader.downloadFile('https://example.com/data.xml');
      
      expect(result).toBe(mockData);
    });

    it('should handle HTTP errors', async () => {
      https.get.mockImplementation((url, callback) => {
        const response = new EventEmitter();
        response.statusCode = 404;
        response.statusMessage = 'Not Found';
        
        setTimeout(() => callback(response), 0);
        
        return new EventEmitter();
      });

      await expect(downloader.downloadFile('https://example.com/data.xml'))
        .rejects.toThrow('HTTP 404: Not Found');
    });

    it('should handle network errors', async () => {
      https.get.mockImplementation(() => {
        const request = new EventEmitter();
        
        setTimeout(() => {
          request.emit('error', new Error('Network error'));
        }, 0);
        
        return request;
      });

      await expect(downloader.downloadFile('https://example.com/data.xml'))
        .rejects.toThrow('Network error');
    });
  });

  describe('parseOFACXML', () => {
    it('should parse OFAC XML format correctly', async () => {
      const xmlData = {
        sdnList: {
          sdnEntry: [
            {
              uid: '123',
              firstName: 'John',
              lastName: 'Doe',
              title: 'Mr.',
              sdnType: 'Individual',
              programList: { program: 'IRAN' },
              nationalityList: { nationality: 'Iranian' },
              dateOfBirthList: { dateOfBirth: { dateOfBirth: '1970-01-01' } },
              akaList: { aka: { firstName: 'Johnny', lastName: 'Doe' } },
              addressList: {
                address: {
                  address1: '123 Main St',
                  city: 'Tehran',
                  country: 'Iran',
                  postalCode: '12345'
                }
              }
            }
          ]
        }
      };

      const entries = await downloader.parseOFACXML(xmlData);
      
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        uid: '123',
        name: 'John Doe',
        firstName: 'John',
        lastName: 'Doe',
        title: 'Mr.',
        type: 'Individual',
        program: 'IRAN',
        nationality: 'Iranian',
        dateOfBirth: '1970-01-01',
        source: 'OFAC'
      });
      expect(entries[0].aliases).toContain('Johnny Doe');
      expect(entries[0].addresses[0]).toMatchObject({
        address1: '123 Main St',
        city: 'Tehran',
        country: 'Iran'
      });
    });

    it('should handle missing optional fields', async () => {
      const xmlData = {
        sdnList: {
          sdnEntry: {
            uid: '456',
            lastName: 'Smith',
            sdnType: 'Individual'
          }
        }
      };

      const entries = await downloader.parseOFACXML(xmlData);
      
      expect(entries).toHaveLength(1);
      expect(entries[0].firstName).toBe('');
      expect(entries[0].nationality).toBe('');
      expect(entries[0].dateOfBirth).toBe('');
      expect(entries[0].aliases).toEqual([]);
    });
  });

  describe('parseUNXML', () => {
    it('should parse UN XML format for individuals', async () => {
      const xmlData = {
        CONSOLIDATED_LIST: {
          INDIVIDUALS: {
            INDIVIDUAL: {
              DATAID: '456',
              FIRST_NAME: 'Jane',
              SECOND_NAME: 'Marie',
              THIRD_NAME: 'Elizabeth',
              FOURTH_NAME: 'Smith',
              NAME_ORIGINAL_SCRIPT: 'Jane M. E. Smith',
              DESIGNATION: { VALUE: 'Terrorist' },
              NATIONALITY: { VALUE: 'Syrian' },
              INDIVIDUAL_DATE_OF_BIRTH: { DATE: '1980-01-01' },
              INDIVIDUAL_ALIAS: [
                { ALIAS_NAME: 'Jane Doe' },
                { ALIAS_NAME: 'J. Smith' }
              ],
              INDIVIDUAL_ADDRESS: {
                STREET: '456 Oak St',
                CITY: 'Damascus',
                COUNTRY: 'Syria'
              }
            }
          }
        }
      };

      const entries = await downloader.parseUNXML(xmlData);
      
      expect(entries.length).toBeGreaterThan(0);
      const individual = entries.find(e => e.type === 'Individual');
      
      expect(individual).toMatchObject({
        uid: '456',
        name: 'Jane M. E. Smith',
        firstName: 'Jane',
        type: 'Individual',
        designation: 'Terrorist',
        nationality: 'Syrian',
        dateOfBirth: '1980-01-01',
        source: 'UN'
      });
      expect(individual.aliases).toContain('Jane Doe');
      expect(individual.aliases).toContain('J. Smith');
    });

    it('should parse UN XML format for entities', async () => {
      const xmlData = {
        CONSOLIDATED_LIST: {
          ENTITIES: {
            ENTITY: {
              DATAID: '789',
              FIRST_NAME: 'Evil Corp',
              ENTITY_ADDRESS: {
                STREET: '789 Evil Ave',
                CITY: 'Moscow',
                COUNTRY: 'Russia'
              }
            }
          }
        }
      };

      const entries = await downloader.parseUNXML(xmlData);
      
      expect(entries.length).toBeGreaterThan(0);
      const entity = entries.find(e => e.type === 'Entity');
      
      expect(entity).toMatchObject({
        uid: '789',
        name: 'Evil Corp',
        type: 'Entity',
        source: 'UN'
      });
    });
  });

  describe('parseEUXML', () => {
    it('should parse EU XML format correctly', async () => {
      const xmlData = {
        export: {
          sanctionEntity: {
            $: { euReferenceNumber: 'EU123' },
            nameAlias: [
              { $: { primaryName: 'true', wholeName: 'Robert Johnson' } },
              { $: { primaryName: 'false', wholeName: 'Bob Johnson' } },
              { $: { primaryName: 'false', wholeName: 'R. Johnson' } }
            ],
            subjectType: { $: { classificationCode: 'P' } },
            regulation: { $: { programme: 'Syria' } },
            birthdate: { $: { year: '1975', month: '06', day: '15' } },
            citizenship: { $: { countryIso2Code: 'SY' } },
            address: {
              $: {
                street: '111 First St',
                city: 'Aleppo',
                countryIso2Code: 'SY',
                zipCode: '12345'
              }
            }
          }
        }
      };

      const entries = await downloader.parseEUXML(xmlData);
      
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        uid: 'EU123',
        name: 'Robert Johnson',
        type: 'Individual',
        program: 'Syria',
        dateOfBirth: '1975-06-15',
        nationality: 'SY',
        source: 'EU'
      });
      expect(entries[0].aliases).toContain('Bob Johnson');
      expect(entries[0].aliases).toContain('R. Johnson');
    });
  });

  describe('parseUKXML', () => {
    it('should parse UK XML format correctly', async () => {
      const xmlData = {
        ConsolidatedList: {
          Individuals: {
            Individual: {
              $: { FixedRef: 'UK001' },
              Names: {
                Name: [
                  { $: { name1: 'Michael', name6: 'Brown' } },
                  { $: { name1: 'Mike', name6: 'Brown' } }
                ]
              },
              DOBs: { DOB: ['1985-03-20', '1985-03-21'] },
              Nationality: 'British',
              Addresses: {
                Address: [
                  {
                    $: {
                      address1: '10 Downing St',
                      address2: 'Westminster',
                      city: 'London',
                      postCode: 'SW1A 2AA',
                      country: 'UK'
                    }
                  }
                ]
              }
            }
          }
        }
      };

      const entries = await downloader.parseUKXML(xmlData);
      
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        uid: 'UK001',
        name: 'Brown',
        firstName: 'Michael',
        lastName: 'Brown',
        type: 'Individual',
        dateOfBirth: '1985-03-20',
        nationality: 'British',
        source: 'UK'
      });
      expect(entries[0].aliases).toContain('Brown');
    });
  });

  describe('Cache management', () => {
    it('should save data to cache correctly', async () => {
      const entries = [
        { uid: '1', name: 'Test Person' },
        { uid: '2', name: 'Another Person' }
      ];

      await downloader.saveToCache('test', entries);
      
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('test_cache.json'),
        expect.stringContaining('"entryCount": 2')
      );
      
      const writeCall = fs.writeFile.mock.calls[0];
      const savedData = JSON.parse(writeCall[1]);
      
      expect(savedData).toHaveProperty('source', 'test');
      expect(savedData).toHaveProperty('checksum');
      expect(savedData.entries).toEqual(entries);
    });

    it('should check cache expiry correctly', () => {
      const now = new Date();
      
      // Fresh daily cache
      const freshDaily = {
        lastUpdated: new Date(now - 12 * 60 * 60 * 1000) // 12 hours ago
      };
      expect(downloader.isCacheExpired(freshDaily, 'daily')).toBe(false);
      
      // Expired daily cache
      const expiredDaily = {
        lastUpdated: new Date(now - 2 * 24 * 60 * 60 * 1000) // 2 days ago
      };
      expect(downloader.isCacheExpired(expiredDaily, 'daily')).toBe(true);
      
      // Fresh weekly cache
      const freshWeekly = {
        lastUpdated: new Date(now - 5 * 24 * 60 * 60 * 1000) // 5 days ago
      };
      expect(downloader.isCacheExpired(freshWeekly, 'weekly')).toBe(false);
      
      // Expired weekly cache
      const expiredWeekly = {
        lastUpdated: new Date(now - 10 * 24 * 60 * 60 * 1000) // 10 days ago
      };
      expect(downloader.isCacheExpired(expiredWeekly, 'weekly')).toBe(true);
    });
  });

  describe('searchWatchlists', () => {
    it('should search across all watchlists', async () => {
      const mockCache = {
        source: 'ofac',
        lastUpdated: new Date(),
        entries: [
          {
            uid: '1',
            name: 'John Doe',
            aliases: ['Johnny Doe', 'J. Doe'],
            source: 'OFAC'
          },
          {
            uid: '2',
            name: 'Jane Smith',
            aliases: ['Mary Jane'],
            source: 'OFAC'
          }
        ]
      };
      
      // Mock readFile to return cache only for ofac, error for others
      fs.readFile.mockImplementation((path) => {
        if (path.includes('ofac_cache.json')) {
          return Promise.resolve(JSON.stringify(mockCache));
        }
        return Promise.reject(new Error('No cache'));
      });
      
      const results = await downloader.searchWatchlists('John Doe');
      
      // Should only find exact match
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        uid: '1',
        name: 'John Doe',
        matchType: 'primary_name',
        matchScore: 1.0
      });
    });

    it('should match against aliases', async () => {
      const mockCache = {
        source: 'ofac',
        lastUpdated: new Date(),
        entries: [
          {
            uid: '1',
            name: 'Robert William Anderson',
            aliases: ['Bob Johnson', 'Bobby J'],
            source: 'OFAC'
          }
        ]
      };
      
      // Mock readFile to return cache only for ofac, error for others
      fs.readFile.mockImplementation((path) => {
        if (path.includes('ofac_cache.json')) {
          return Promise.resolve(JSON.stringify(mockCache));
        }
        return Promise.reject(new Error('No cache'));
      });
      
      const results = await downloader.searchWatchlists('Bob Johnson');
      
      // Should find alias match
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        uid: '1',
        name: 'Robert William Anderson',
        matchType: 'alias',
        matchedAlias: 'Bob Johnson'
      });
    });

    it('should use fuzzy matching with threshold', async () => {
      const mockCache = {
        source: 'ofac',
        lastUpdated: new Date(),
        entries: [
          {
            uid: '1',
            name: 'John Smith',
            aliases: [],
            source: 'OFAC'
          }
        ]
      };
      
      fs.readFile.mockResolvedValue(JSON.stringify(mockCache));
      
      // With high threshold, should not match
      const results1 = await downloader.searchWatchlists('Jon Smyth', { threshold: 0.95 });
      expect(results1).toHaveLength(0);
      
      // With lower threshold, should match
      const results2 = await downloader.searchWatchlists('Jon Smyth', { threshold: 0.7 });
      expect(results2.length).toBeGreaterThan(0);
    });
  });

  describe('jaroWinklerDistance', () => {
    it('should calculate Jaro-Winkler distance correctly', () => {
      // Exact match
      expect(downloader.jaroWinklerDistance('john', 'john')).toBe(1.0);
      
      // Complete mismatch
      expect(downloader.jaroWinklerDistance('abc', 'xyz')).toBe(0);
      
      // Similar strings
      const score1 = downloader.jaroWinklerDistance('martha', 'marhta');
      expect(score1).toBeGreaterThan(0.9);
      
      // Somewhat similar
      const score2 = downloader.jaroWinklerDistance('dixon', 'dicksonx');
      expect(score2).toBeGreaterThan(0.7);
      expect(score2).toBeLessThan(0.9);
      
      // Empty strings
      expect(downloader.jaroWinklerDistance('', '')).toBe(1.0);
      expect(downloader.jaroWinklerDistance('test', '')).toBe(0);
    });

    it('should give bonus for common prefix', () => {
      const score1 = downloader.jaroWinklerDistance('prefix', 'prefixa');
      const score2 = downloader.jaroWinklerDistance('aprefix', 'bprefix');
      
      // First pair has common prefix, should score higher
      expect(score1).toBeGreaterThan(score2);
    });
  });

  describe('Helper methods', () => {
    it('should format names correctly', () => {
      expect(downloader.formatName('John', 'Doe')).toBe('John Doe');
      expect(downloader.formatName('John', '')).toBe('John');
      expect(downloader.formatName('', 'Doe')).toBe('Doe');
      expect(downloader.formatName('', '')).toBe('');
      expect(downloader.formatName(null, null)).toBe('');
    });

    it('should extract OFAC nationality correctly', () => {
      const entry1 = { nationalityList: { nationality: 'Iranian' } };
      expect(downloader.extractNationality(entry1)).toBe('Iranian');
      
      const entry2 = { nationalityList: { nationality: ['Syrian', 'Lebanese'] } };
      expect(downloader.extractNationality(entry2)).toBe('Syrian');
      
      const entry3 = {};
      expect(downloader.extractNationality(entry3)).toBe('');
    });

    it('should extract OFAC date of birth correctly', () => {
      const entry1 = {
        dateOfBirthList: {
          dateOfBirth: { dateOfBirth: '1970-01-01' }
        }
      };
      expect(downloader.extractDOB(entry1)).toBe('1970-01-01');
      
      const entry2 = {
        dateOfBirthList: {
          dateOfBirth: [
            { dateOfBirth: '1970-01-01' },
            { dateOfBirth: '1970-01-02' }
          ]
        }
      };
      expect(downloader.extractDOB(entry2)).toBe('1970-01-01');
      
      const entry3 = {};
      expect(downloader.extractDOB(entry3)).toBe('');
    });

    it('should calculate checksum correctly', () => {
      const data1 = { test: 'data' };
      const data2 = { test: 'data' };
      const data3 = { test: 'different' };
      
      const checksum1 = downloader.calculateChecksum(data1);
      const checksum2 = downloader.calculateChecksum(data2);
      const checksum3 = downloader.calculateChecksum(data3);
      
      expect(checksum1).toBe(checksum2);
      expect(checksum1).not.toBe(checksum3);
      expect(checksum1).toMatch(/^[a-f0-9]{64}$/); // SHA256 hex
    });
  });

  describe('Error handling', () => {
    it('should handle XML parsing errors gracefully', async () => {
      const invalidXml = { unexpected: 'format' };
      
      const entries = await downloader.parseOFACXML(invalidXml);
      expect(entries).toEqual([]);
    });

    it('should handle missing source configuration', async () => {
      const invalidSource = 'nonexistent';
      
      // Should throw error when config is undefined
      await expect(downloader.downloadWatchlist(invalidSource, undefined))
        .rejects.toThrow();
    });
  });
});