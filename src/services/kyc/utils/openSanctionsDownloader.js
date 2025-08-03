// src/services/kyc/utils/openSanctionsDownloader.js

import https from 'https';
import fs from 'fs/promises';
import path from 'path';
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import zlib from 'zlib';

/**
 * OpenSanctions Downloader
 * Downloads and processes data from OpenSanctions.org - the best free sanctions/PEP aggregator
 */
export class OpenSanctionsDownloader {
  constructor() {
    this.baseUrl = 'https://data.opensanctions.org/datasets/latest';
    this.apiUrl = 'https://api.opensanctions.org/v1';
    this.dataDir = path.join(process.cwd(), 'data', 'opensanctions');
    
    // Available datasets
    this.datasets = {
      default: {
        name: 'Default Dataset',
        description: 'Combined sanctions, PEPs, and criminal watchlists',
        file: 'default.json',
        url: `${this.baseUrl}/default/entities.ftm.json`
      },
      sanctions: {
        name: 'Sanctions Only',
        description: 'Consolidated sanctions from multiple sources',
        file: 'sanctions.json',
        url: `${this.baseUrl}/sanctions/entities.ftm.json`
      },
      peps: {
        name: 'PEPs Only',
        description: 'Politically exposed persons',
        file: 'peps.json',
        url: `${this.baseUrl}/peps/entities.ftm.json`
      },
      crime: {
        name: 'Crime Lists',
        description: 'Criminal watchlists and wanted persons',
        file: 'crime.json',
        url: `${this.baseUrl}/crime/entities.ftm.json`
      }
    };

    // Source mapping
    this.sourcesIncluded = {
      sanctions: [
        'us_ofac_sdn',
        'un_sc_sanctions',
        'eu_fsf',
        'gb_hmt_sanctions',
        'ca_sema_sanctions',
        'au_dfat_sanctions',
        'ch_seco_sanctions',
        'jp_mof_sanctions'
      ],
      peps: [
        'cia_world_leaders',
        'everypol',
        'ru_rupep',
        'ua_nazk_pep'
      ],
      other: [
        'interpol_red_notices',
        'us_bis_denied',
        'worldbank_debarred',
        'eu_cor_members'
      ]
    };
  }

  /**
   * Initialize data directory
   */
  async initialize() {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
      console.log('[OpenSanctions] Data directory initialized');
    } catch (error) {
      console.error('[OpenSanctions] Error creating directory:', error);
    }
  }

  /**
   * Download a dataset
   */
  async downloadDataset(datasetName = 'default') {
    const dataset = this.datasets[datasetName];
    if (!dataset) {
      throw new Error(`Unknown dataset: ${datasetName}`);
    }

    console.log(`[OpenSanctions] Downloading ${dataset.name}...`);
    
    try {
      const filePath = path.join(this.dataDir, dataset.file);
      const tempPath = `${filePath}.tmp`;
      
      // Download to temp file
      await this.downloadFile(dataset.url, tempPath);
      
      // Move to final location
      await fs.rename(tempPath, filePath);
      
      // Get file stats
      const stats = await fs.stat(filePath);
      const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
      
      console.log(`[OpenSanctions] Downloaded ${dataset.name} (${sizeMB} MB)`);
      
      // Parse and return summary
      const summary = await this.getDatasetSummary(filePath);
      return summary;
    } catch (error) {
      console.error(`[OpenSanctions] Error downloading ${datasetName}:`, error);
      throw error;
    }
  }

  /**
   * Download file with progress
   */
  downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
      const file = createWriteStream(destPath);
      
      https.get(url, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          // Follow redirect
          file.close();
          this.downloadFile(response.headers.location, destPath)
            .then(resolve)
            .catch(reject);
          return;
        }
        
        if (response.statusCode !== 200) {
          file.close();
          reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
          return;
        }

        const totalSize = parseInt(response.headers['content-length'], 10);
        let downloadedSize = 0;
        let lastProgress = 0;

        response.on('data', (chunk) => {
          downloadedSize += chunk.length;
          const progress = Math.round((downloadedSize / totalSize) * 100);
          
          // Log progress every 10%
          if (progress >= lastProgress + 10) {
            console.log(`[OpenSanctions] Download progress: ${progress}%`);
            lastProgress = progress;
          }
        });

        response.pipe(file);

        file.on('finish', () => {
          file.close(() => resolve());
        });

        file.on('error', (err) => {
          fs.unlink(destPath).catch(() => {});
          reject(err);
        });

        response.on('error', reject);
      }).on('error', reject);
    });
  }

  /**
   * Parse OpenSanctions FtM format (streaming for large files)
   */
  async parseDataset(datasetName = 'default', limit = null) {
    const filePath = path.join(this.dataDir, this.datasets[datasetName].file);
    
    try {
      // Check if file exists
      await fs.access(filePath);
      
      // Use streaming for large files
      const entities = await this.parseDatasetStream(filePath, limit);
      
      console.log(`[OpenSanctions] Parsed ${entities.length} entities from ${datasetName}`);
      return entities;
    } catch (error) {
      console.error(`[OpenSanctions] Error parsing dataset:`, error);
      return [];
    }
  }

  /**
   * Parse dataset using stream (for large files)
   */
  async parseDatasetStream(filePath, limit = null) {
    const readline = await import('readline');
    const stream = createReadStream(filePath);
    const rl = readline.createInterface({
      input: stream,
      crlfDelay: Infinity
    });

    const entities = [];
    let lineCount = 0;

    for await (const line of rl) {
      if (line.trim()) {
        try {
          const entity = JSON.parse(line);
          entities.push(this.transformEntity(entity));
          lineCount++;
          
          if (limit && lineCount >= limit) {
            rl.close();
            break;
          }
        } catch (error) {
          // Skip malformed lines
        }
      }
    }

    return entities;
  }

  /**
   * Transform OpenSanctions entity to standard format
   */
  transformEntity(entity) {
    const properties = entity.properties || {};
    
    return {
      id: entity.id,
      schema: entity.schema,
      name: this.extractName(properties),
      aliases: this.extractAliases(properties),
      type: this.determineType(entity.schema),
      nationality: this.extractValue(properties.nationality),
      dateOfBirth: this.extractDate(properties.birthDate),
      placeOfBirth: this.extractValue(properties.birthPlace),
      gender: this.extractValue(properties.gender),
      identifiers: this.extractIdentifiers(properties),
      addresses: this.extractAddresses(properties),
      sanctions: this.extractSanctions(properties),
      sources: properties.sourceUrl || [],
      notes: this.extractValue(properties.notes),
      lastSeen: entity.last_seen,
      datasets: entity.datasets || [],
      referents: entity.referents || [],
      score: entity.score || 0
    };
  }

  /**
   * Extract primary name
   */
  extractName(properties) {
    if (properties.name && properties.name.length > 0) {
      return properties.name[0];
    }
    return 'Unknown';
  }

  /**
   * Extract aliases
   */
  extractAliases(properties) {
    const aliases = [];
    
    // Add all names as potential aliases
    if (properties.name && properties.name.length > 1) {
      aliases.push(...properties.name.slice(1));
    }
    
    // Add specific alias fields
    if (properties.alias) {
      aliases.push(...properties.alias);
    }
    
    if (properties.previousName) {
      aliases.push(...properties.previousName);
    }
    
    if (properties.weakAlias) {
      aliases.push(...properties.weakAlias);
    }
    
    return [...new Set(aliases)];
  }

  /**
   * Determine entity type
   */
  determineType(schema) {
    const schemaTypes = {
      'Person': 'individual',
      'LegalEntity': 'entity',
      'Company': 'entity',
      'Organization': 'entity',
      'PublicBody': 'entity',
      'Vessel': 'vessel',
      'Aircraft': 'aircraft'
    };
    
    return schemaTypes[schema] || 'unknown';
  }

  /**
   * Extract single value from array
   */
  extractValue(arr) {
    if (Array.isArray(arr) && arr.length > 0) {
      return arr[0];
    }
    return null;
  }

  /**
   * Extract date
   */
  extractDate(dateArr) {
    const date = this.extractValue(dateArr);
    if (date) {
      // Handle partial dates (e.g., "1970", "1970-06")
      if (date.match(/^\d{4}$/)) {
        return `${date}-01-01`;
      } else if (date.match(/^\d{4}-\d{2}$/)) {
        return `${date}-01`;
      }
      return date;
    }
    return null;
  }

  /**
   * Extract identifiers
   */
  extractIdentifiers(properties) {
    const identifiers = {};
    
    if (properties.passportNumber) {
      identifiers.passport = properties.passportNumber;
    }
    
    if (properties.nationalId) {
      identifiers.nationalId = properties.nationalId;
    }
    
    if (properties.taxNumber) {
      identifiers.taxId = properties.taxNumber;
    }
    
    if (properties.innCode) {
      identifiers.inn = properties.innCode;
    }
    
    return identifiers;
  }

  /**
   * Extract addresses
   */
  extractAddresses(properties) {
    const addresses = [];
    
    if (properties.address) {
      properties.address.forEach(addr => {
        addresses.push({
          full: addr,
          country: this.extractValue(properties.country)
        });
      });
    }
    
    return addresses;
  }

  /**
   * Extract sanctions information
   */
  extractSanctions(properties) {
    const sanctions = {
      programs: properties.program || [],
      authority: properties.authority || [],
      reason: this.extractValue(properties.reason),
      startDate: this.extractDate(properties.startDate),
      endDate: this.extractDate(properties.endDate)
    };
    
    return sanctions;
  }

  /**
   * Get dataset summary (streaming for large files)
   */
  async getDatasetSummary(filePath) {
    try {
      const readline = await import('readline');
      const stream = createReadStream(filePath);
      const rl = readline.createInterface({
        input: stream,
        crlfDelay: Infinity
      });

      let total = 0;
      let personCount = 0;
      let entityCount = 0;
      let pepCount = 0;
      let sanctionCount = 0;
      
      for await (const line of rl) {
        if (line.trim()) {
          total++;
          try {
            const entity = JSON.parse(line);
            
            if (entity.schema === 'Person') personCount++;
            else entityCount++;
            
            if (entity.datasets && entity.datasets.includes('peps')) pepCount++;
            if (entity.datasets && entity.datasets.includes('sanctions')) sanctionCount++;
          } catch (error) {
            // Skip malformed lines
          }
        }
      }
      
      return {
        total,
        persons: personCount,
        entities: entityCount,
        peps: pepCount,
        sanctions: sanctionCount,
        fileSize: (await fs.stat(filePath)).size
      };
    } catch (error) {
      console.error('[OpenSanctions] Error getting summary:', error);
      return null;
    }
  }

  /**
   * Search entities (streaming for large files)
   */
  async searchEntities(name, options = {}) {
    const dataset = options.dataset || 'default';
    const threshold = options.threshold || 0.8;
    const maxResults = options.maxResults || 100;
    
    const filePath = path.join(this.dataDir, this.datasets[dataset].file);
    
    try {
      await fs.access(filePath);
    } catch (error) {
      console.error(`[OpenSanctions] Dataset ${dataset} not found`);
      return [];
    }
    
    // Import fuzzy matcher
    const { fuzzyMatcher } = await import('./fuzzyMatcher.js');
    
    const readline = await import('readline');
    const stream = createReadStream(filePath);
    const rl = readline.createInterface({
      input: stream,
      crlfDelay: Infinity
    });

    const results = [];
    let processed = 0;

    for await (const line of rl) {
      if (line.trim()) {
        try {
          const entity = JSON.parse(line);
          const transformedEntity = this.transformEntity(entity);
          
          // Check primary name
          const nameMatch = fuzzyMatcher.match(name, transformedEntity.name, { threshold });
          
          if (nameMatch.isMatch) {
            results.push({
              entity: transformedEntity,
              matchType: 'primary_name',
              matchScore: nameMatch.score,
              matchDetails: nameMatch
            });
            
            if (results.length >= maxResults) {
              rl.close();
              break;
            }
          }
          
          // Check aliases
          for (const alias of transformedEntity.aliases) {
            const aliasMatch = fuzzyMatcher.match(name, alias, { threshold });
            
            if (aliasMatch.isMatch) {
              results.push({
                entity: transformedEntity,
                matchType: 'alias',
                matchedAlias: alias,
                matchScore: aliasMatch.score,
                matchDetails: aliasMatch
              });
              
              if (results.length >= maxResults) {
                rl.close();
                break;
              }
            }
          }
          
          processed++;
          if (processed % 10000 === 0) {
            console.log(`[OpenSanctions] Processed ${processed} entities...`);
          }
        } catch (error) {
          // Skip malformed lines
        }
      }
    }
    
    // Sort by score
    results.sort((a, b) => b.matchScore - a.matchScore);
    
    console.log(`[OpenSanctions] Search complete. Found ${results.length} matches from ${processed} entities`);
    return results;
  }

  /**
   * Check if data needs update
   */
  async needsUpdate(datasetName = 'default') {
    const filePath = path.join(this.dataDir, this.datasets[datasetName].file);
    
    try {
      const stats = await fs.stat(filePath);
      const daysSinceUpdate = (Date.now() - stats.mtime) / (1000 * 60 * 60 * 24);
      
      // Update if older than 7 days
      return daysSinceUpdate > 7;
    } catch (error) {
      // File doesn't exist
      return true;
    }
  }

  /**
   * Get all available datasets info
   */
  async getDatasetInfo() {
    const info = {};
    
    for (const [key, dataset] of Object.entries(this.datasets)) {
      const filePath = path.join(this.dataDir, dataset.file);
      
      try {
        const stats = await fs.stat(filePath);
        const summary = await this.getDatasetSummary(filePath);
        
        info[key] = {
          ...dataset,
          exists: true,
          lastUpdated: stats.mtime,
          size: stats.size,
          summary
        };
      } catch (error) {
        info[key] = {
          ...dataset,
          exists: false
        };
      }
    }
    
    return info;
  }
}

// Export singleton instance
export const openSanctionsDownloader = new OpenSanctionsDownloader();