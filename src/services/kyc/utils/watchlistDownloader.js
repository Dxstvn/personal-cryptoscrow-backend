// src/services/kyc/utils/watchlistDownloader.js

import https from 'https';
import fs from 'fs/promises';
import path from 'path';
import xml2js from 'xml2js';
import crypto from 'crypto';

/**
 * Watchlist Downloader
 * Downloads and parses public sanctions and watchlist data
 */
export class WatchlistDownloader {
  constructor() {
    this.dataDir = path.join(process.cwd(), 'data', 'watchlists');
    this.sources = {
      // OFAC SDN List (US Treasury)
      ofac: {
        name: 'OFAC Specially Designated Nationals',
        url: 'https://www.treasury.gov/ofac/downloads/sdn.xml',
        format: 'xml',
        parser: this.parseOFACXML.bind(this),
        updateFrequency: 'weekly'
      },
      
      // UN Security Council Sanctions
      un: {
        name: 'UN Security Council Consolidated List',
        url: 'https://scsanctions.un.org/resources/xml/en/consolidated.xml',
        format: 'xml',
        parser: this.parseUNXML.bind(this),
        updateFrequency: 'weekly'
      },
      
      // EU Consolidated List
      eu: {
        name: 'EU Financial Sanctions',
        url: 'https://webgate.ec.europa.eu/fsd/fsf/public/files/xmlFullSanctionsList_1_1/content',
        format: 'xml',
        parser: this.parseEUXML.bind(this),
        updateFrequency: 'weekly'
      },
      
      // UK HM Treasury
      uk: {
        name: 'UK Consolidated List',
        url: 'https://ofsistorage.blob.core.windows.net/publishlive/2022format/ConList.xml',
        format: 'xml',
        parser: this.parseUKXML.bind(this),
        updateFrequency: 'weekly'
      }
    };
  }

  /**
   * Initialize data directory
   */
  async initialize() {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
      console.log('[WatchlistDownloader] Data directory initialized');
    } catch (error) {
      console.error('[WatchlistDownloader] Error creating data directory:', error);
    }
  }

  /**
   * Download all watchlists
   */
  async downloadAllWatchlists() {
    await this.initialize();
    
    const results = {
      success: [],
      failed: []
    };

    for (const [source, config] of Object.entries(this.sources)) {
      try {
        console.log(`[WatchlistDownloader] Downloading ${config.name}...`);
        const data = await this.downloadWatchlist(source, config);
        results.success.push({ source, entries: data.length });
      } catch (error) {
        console.error(`[WatchlistDownloader] Failed to download ${source}:`, error.message);
        results.failed.push({ source, error: error.message });
      }
    }

    return results;
  }

  /**
   * Download and parse a single watchlist
   */
  async downloadWatchlist(source, config) {
    // Check if we have a recent cached version
    const cachedData = await this.getCachedData(source);
    if (cachedData && !this.isCacheExpired(cachedData, config.updateFrequency)) {
      console.log(`[WatchlistDownloader] Using cached data for ${source}`);
      return cachedData.entries;
    }

    // Download fresh data
    const rawData = await this.downloadFile(config.url);
    
    // Parse based on format
    let parsedEntries;
    if (config.format === 'xml') {
      const xmlData = await this.parseXML(rawData);
      parsedEntries = await config.parser(xmlData);
    } else if (config.format === 'json') {
      parsedEntries = await config.parser(JSON.parse(rawData));
    } else {
      parsedEntries = await config.parser(rawData);
    }

    // Save to cache
    await this.saveToCache(source, parsedEntries);

    return parsedEntries;
  }

  /**
   * Download file from URL
   */
  downloadFile(url) {
    return new Promise((resolve, reject) => {
      let data = '';
      
      https.get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
          return;
        }

        response.on('data', chunk => data += chunk);
        response.on('end', () => resolve(data));
        response.on('error', reject);
      }).on('error', reject);
    });
  }

  /**
   * Parse XML data
   */
  async parseXML(xmlString) {
    const parser = new xml2js.Parser({
      explicitArray: false,
      ignoreAttrs: false
    });
    
    return parser.parseStringPromise(xmlString);
  }

  /**
   * Parse OFAC SDN XML format
   */
  async parseOFACXML(xmlData) {
    const entries = [];
    
    try {
      const sdnList = xmlData.sdnList?.sdnEntry || [];
      const sdnEntries = Array.isArray(sdnList) ? sdnList : [sdnList];

      for (const entry of sdnEntries) {
        entries.push({
          uid: entry.uid,
          name: this.formatName(entry.firstName, entry.lastName),
          firstName: entry.firstName || '',
          lastName: entry.lastName || '',
          title: entry.title || '',
          type: entry.sdnType || 'Individual',
          program: entry.programList?.program || [],
          nationality: this.extractNationality(entry),
          dateOfBirth: this.extractDOB(entry),
          aliases: this.extractAliases(entry.akaList),
          addresses: this.extractAddresses(entry.addressList),
          source: 'OFAC',
          addedDate: new Date(),
          rawData: entry
        });
      }
    } catch (error) {
      console.error('[WatchlistDownloader] Error parsing OFAC data:', error);
    }

    return entries;
  }

  /**
   * Parse UN Security Council XML format
   */
  async parseUNXML(xmlData) {
    const entries = [];
    
    try {
      const individuals = xmlData.CONSOLIDATED_LIST?.INDIVIDUALS?.INDIVIDUAL || [];
      const individualList = Array.isArray(individuals) ? individuals : [individuals];

      for (const individual of individualList) {
        entries.push({
          uid: individual.DATAID,
          name: individual.NAME_ORIGINAL_SCRIPT || 
                `${individual.FIRST_NAME || ''} ${individual.SECOND_NAME || ''} ${individual.THIRD_NAME || ''} ${individual.FOURTH_NAME || ''}`.trim(),
          firstName: individual.FIRST_NAME || '',
          lastName: individual.FOURTH_NAME || individual.THIRD_NAME || '',
          type: 'Individual',
          designation: individual.DESIGNATION?.VALUE || '',
          nationality: this.extractUNNationality(individual),
          dateOfBirth: this.extractUNDOB(individual),
          aliases: this.extractUNAliases(individual),
          addresses: this.extractUNAddresses(individual),
          source: 'UN',
          addedDate: new Date(),
          rawData: individual
        });
      }

      // Also parse entities
      const entities = xmlData.CONSOLIDATED_LIST?.ENTITIES?.ENTITY || [];
      const entityList = Array.isArray(entities) ? entities : [entities];

      for (const entity of entityList) {
        entries.push({
          uid: entity.DATAID,
          name: entity.NAME_ORIGINAL_SCRIPT || entity.FIRST_NAME || '',
          type: 'Entity',
          addresses: this.extractUNAddresses(entity),
          source: 'UN',
          addedDate: new Date(),
          rawData: entity
        });
      }
    } catch (error) {
      console.error('[WatchlistDownloader] Error parsing UN data:', error);
    }

    return entries;
  }

  /**
   * Parse EU Consolidated List XML format
   */
  async parseEUXML(xmlData) {
    const entries = [];
    
    try {
      const sanctionEntities = xmlData.export?.sanctionEntity || [];
      const entityList = Array.isArray(sanctionEntities) ? sanctionEntities : [sanctionEntities];

      for (const entity of entityList) {
        const nameAlias = entity.nameAlias || [];
        const nameAliases = Array.isArray(nameAlias) ? nameAlias : [nameAlias];
        
        const primaryName = nameAliases.find(n => n.$.primaryName === 'true');
        
        entries.push({
          uid: entity.$.euReferenceNumber,
          name: primaryName?.$.wholeName || '',
          type: entity.subjectType?.$.classificationCode === 'P' ? 'Individual' : 'Entity',
          program: entity.regulation?.$.programme || '',
          dateOfBirth: this.extractEUDOB(entity),
          nationality: this.extractEUNationality(entity),
          aliases: nameAliases.filter(n => n.$.primaryName !== 'true').map(n => n.$.wholeName),
          addresses: this.extractEUAddresses(entity),
          source: 'EU',
          addedDate: new Date(),
          rawData: entity
        });
      }
    } catch (error) {
      console.error('[WatchlistDownloader] Error parsing EU data:', error);
    }

    return entries;
  }

  /**
   * Parse UK HM Treasury XML format
   */
  async parseUKXML(xmlData) {
    const entries = [];
    
    try {
      const individuals = xmlData.ConsolidatedList?.Individuals?.Individual || [];
      const individualList = Array.isArray(individuals) ? individuals : [individuals];

      for (const individual of individualList) {
        entries.push({
          uid: individual.$.FixedRef,
          name: individual.Names?.Name?.[0]?.$.name6 || '',
          firstName: individual.Names?.Name?.[0]?.$.name1 || '',
          lastName: individual.Names?.Name?.[0]?.$.name6 || '',
          type: 'Individual',
          dateOfBirth: this.extractUKDOB(individual),
          nationality: individual.Nationality || '',
          aliases: this.extractUKAliases(individual),
          addresses: this.extractUKAddresses(individual),
          source: 'UK',
          addedDate: new Date(),
          rawData: individual
        });
      }
    } catch (error) {
      console.error('[WatchlistDownloader] Error parsing UK data:', error);
    }

    return entries;
  }

  /**
   * Get cached watchlist data
   */
  async getCachedData(source) {
    try {
      const cachePath = path.join(this.dataDir, `${source}_cache.json`);
      const data = await fs.readFile(cachePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      return null;
    }
  }

  /**
   * Check if cache is expired
   */
  isCacheExpired(cachedData, updateFrequency) {
    const now = new Date();
    const lastUpdated = new Date(cachedData.lastUpdated);
    const daysSinceUpdate = (now - lastUpdated) / (1000 * 60 * 60 * 24);

    switch (updateFrequency) {
      case 'daily':
        return daysSinceUpdate > 1;
      case 'weekly':
        return daysSinceUpdate > 7;
      case 'monthly':
        return daysSinceUpdate > 30;
      default:
        return true;
    }
  }

  /**
   * Save data to cache
   */
  async saveToCache(source, entries) {
    const cachePath = path.join(this.dataDir, `${source}_cache.json`);
    const cacheData = {
      source,
      lastUpdated: new Date(),
      entryCount: entries.length,
      checksum: this.calculateChecksum(entries),
      entries
    };

    await fs.writeFile(cachePath, JSON.stringify(cacheData, null, 2));
    console.log(`[WatchlistDownloader] Cached ${entries.length} entries for ${source}`);
  }

  /**
   * Calculate checksum for data integrity
   */
  calculateChecksum(data) {
    const hash = crypto.createHash('sha256');
    hash.update(JSON.stringify(data));
    return hash.digest('hex');
  }

  /**
   * Helper: Format name
   */
  formatName(firstName, lastName) {
    return `${firstName || ''} ${lastName || ''}`.trim();
  }

  /**
   * Helper: Extract nationality from OFAC
   */
  extractNationality(entry) {
    if (entry.nationalityList?.nationality) {
      const nat = entry.nationalityList.nationality;
      return Array.isArray(nat) ? nat[0] : nat;
    }
    return '';
  }

  /**
   * Helper: Extract date of birth from OFAC
   */
  extractDOB(entry) {
    if (entry.dateOfBirthList?.dateOfBirth) {
      const dob = entry.dateOfBirthList.dateOfBirth;
      const dobItem = Array.isArray(dob) ? dob[0] : dob;
      return dobItem.dateOfBirth || '';
    }
    return '';
  }

  /**
   * Helper: Extract aliases from OFAC
   */
  extractAliases(akaList) {
    if (!akaList?.aka) return [];
    
    const akas = Array.isArray(akaList.aka) ? akaList.aka : [akaList.aka];
    return akas.map(aka => `${aka.firstName || ''} ${aka.lastName || ''}`.trim());
  }

  /**
   * Helper: Extract addresses from OFAC
   */
  extractAddresses(addressList) {
    if (!addressList?.address) return [];
    
    const addresses = Array.isArray(addressList.address) ? addressList.address : [addressList.address];
    return addresses.map(addr => ({
      address1: addr.address1 || '',
      city: addr.city || '',
      country: addr.country || '',
      postalCode: addr.postalCode || ''
    }));
  }

  /**
   * Helper: Extract UN nationality
   */
  extractUNNationality(individual) {
    const nationality = individual.NATIONALITY?.VALUE;
    return Array.isArray(nationality) ? nationality[0] : (nationality || '');
  }

  /**
   * Helper: Extract UN date of birth
   */
  extractUNDOB(individual) {
    const dob = individual.INDIVIDUAL_DATE_OF_BIRTH?.DATE;
    return Array.isArray(dob) ? dob[0] : (dob || '');
  }

  /**
   * Helper: Extract UN aliases
   */
  extractUNAliases(individual) {
    const aliases = [];
    const aliasList = individual.INDIVIDUAL_ALIAS;
    
    if (aliasList) {
      const aliasArray = Array.isArray(aliasList) ? aliasList : [aliasList];
      aliasArray.forEach(alias => {
        const aliasName = alias.ALIAS_NAME || '';
        if (aliasName) aliases.push(aliasName);
      });
    }
    
    return aliases;
  }

  /**
   * Helper: Extract UN addresses
   */
  extractUNAddresses(entity) {
    const addresses = [];
    const addressList = entity.INDIVIDUAL_ADDRESS || entity.ENTITY_ADDRESS;
    
    if (addressList) {
      const addressArray = Array.isArray(addressList) ? addressList : [addressList];
      addressArray.forEach(addr => {
        addresses.push({
          street: addr.STREET || '',
          city: addr.CITY || '',
          country: addr.COUNTRY || '',
          note: addr.NOTE || ''
        });
      });
    }
    
    return addresses;
  }

  /**
   * Helper: Extract EU date of birth
   */
  extractEUDOB(entity) {
    const birthdate = entity.birthdate;
    if (!birthdate) return '';
    
    const bd = Array.isArray(birthdate) ? birthdate[0] : birthdate;
    return bd.$.year ? `${bd.$.year}-${bd.$.month || '01'}-${bd.$.day || '01'}` : '';
  }

  /**
   * Helper: Extract EU nationality
   */
  extractEUNationality(entity) {
    const citizenship = entity.citizenship;
    if (!citizenship) return '';
    
    const cit = Array.isArray(citizenship) ? citizenship[0] : citizenship;
    return cit.$.countryIso2Code || '';
  }

  /**
   * Helper: Extract EU addresses
   */
  extractEUAddresses(entity) {
    const addresses = [];
    const addressList = entity.address;
    
    if (addressList) {
      const addressArray = Array.isArray(addressList) ? addressList : [addressList];
      addressArray.forEach(addr => {
        addresses.push({
          street: addr.$.street || '',
          city: addr.$.city || '',
          country: addr.$.countryIso2Code || '',
          postalCode: addr.$.zipCode || ''
        });
      });
    }
    
    return addresses;
  }

  /**
   * Helper: Extract UK date of birth
   */
  extractUKDOB(individual) {
    const dobs = individual.DOBs?.DOB;
    if (!dobs) return '';
    
    const dobArray = Array.isArray(dobs) ? dobs : [dobs];
    return dobArray[0] || '';
  }

  /**
   * Helper: Extract UK aliases
   */
  extractUKAliases(individual) {
    const aliases = [];
    const names = individual.Names?.Name;
    
    if (names && Array.isArray(names) && names.length > 1) {
      // Skip first name (primary), rest are aliases
      names.slice(1).forEach(name => {
        const fullName = name.$.name6 || `${name.$.name1 || ''} ${name.$.name6 || ''}`.trim();
        if (fullName) aliases.push(fullName);
      });
    }
    
    return aliases;
  }

  /**
   * Helper: Extract UK addresses
   */
  extractUKAddresses(individual) {
    const addresses = [];
    const addressList = individual.Addresses?.Address;
    
    if (addressList) {
      const addressArray = Array.isArray(addressList) ? addressList : [addressList];
      addressArray.forEach(addr => {
        addresses.push({
          address1: addr.$.address1 || '',
          address2: addr.$.address2 || '',
          address3: addr.$.address3 || '',
          city: addr.$.address4 || '',
          postalCode: addr.$.postCode || '',
          country: addr.$.country || ''
        });
      });
    }
    
    return addresses;
  }

  /**
   * Get consolidated list from all sources
   */
  async getConsolidatedList() {
    const allEntries = [];
    
    for (const source of Object.keys(this.sources)) {
      const cachedData = await this.getCachedData(source);
      if (cachedData && cachedData.entries) {
        allEntries.push(...cachedData.entries);
      }
    }
    
    return allEntries;
  }

  /**
   * Search across all watchlists
   */
  async searchWatchlists(name, options = {}) {
    const entries = await this.getConsolidatedList();
    const results = [];
    
    for (const entry of entries) {
      // Check primary name
      if (this.isNameMatch(name, entry.name, options.threshold || 0.8)) {
        results.push({
          ...entry,
          matchType: 'primary_name',
          matchScore: this.calculateMatchScore(name, entry.name)
        });
        continue;
      }
      
      // Check aliases
      if (entry.aliases && entry.aliases.length > 0) {
        for (const alias of entry.aliases) {
          if (this.isNameMatch(name, alias, options.threshold || 0.8)) {
            results.push({
              ...entry,
              matchType: 'alias',
              matchedAlias: alias,
              matchScore: this.calculateMatchScore(name, alias)
            });
            break;
          }
        }
      }
    }
    
    return results;
  }

  /**
   * Check if names match using fuzzy matching
   */
  isNameMatch(searchName, entryName, threshold) {
    const score = this.calculateMatchScore(searchName, entryName);
    return score >= threshold;
  }

  /**
   * Calculate match score between names
   */
  calculateMatchScore(name1, name2) {
    // Normalize names
    const n1 = name1.toLowerCase().trim();
    const n2 = name2.toLowerCase().trim();
    
    // Exact match
    if (n1 === n2) return 1.0;
    
    // Calculate Jaro-Winkler distance
    return this.jaroWinklerDistance(n1, n2);
  }

  /**
   * Jaro-Winkler distance implementation
   */
  jaroWinklerDistance(s1, s2) {
    // Implementation of Jaro-Winkler algorithm
    // Returns similarity score between 0 and 1
    
    if (s1 === s2) return 1.0;
    
    const len1 = s1.length;
    const len2 = s2.length;
    
    if (len1 === 0 || len2 === 0) return 0.0;
    
    const matchDistance = Math.floor(Math.max(len1, len2) / 2) - 1;
    const s1Matches = new Array(len1).fill(false);
    const s2Matches = new Array(len2).fill(false);
    
    let matches = 0;
    let transpositions = 0;
    
    // Find matches
    for (let i = 0; i < len1; i++) {
      const start = Math.max(0, i - matchDistance);
      const end = Math.min(i + matchDistance + 1, len2);
      
      for (let j = start; j < end; j++) {
        if (s2Matches[j] || s1[i] !== s2[j]) continue;
        
        s1Matches[i] = true;
        s2Matches[j] = true;
        matches++;
        break;
      }
    }
    
    if (matches === 0) return 0.0;
    
    // Count transpositions
    let k = 0;
    for (let i = 0; i < len1; i++) {
      if (!s1Matches[i]) continue;
      while (!s2Matches[k]) k++;
      if (s1[i] !== s2[k]) transpositions++;
      k++;
    }
    
    // Calculate Jaro distance
    const jaro = (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3;
    
    // Calculate Jaro-Winkler distance
    let commonPrefix = 0;
    for (let i = 0; i < Math.min(len1, len2, 4); i++) {
      if (s1[i] === s2[i]) {
        commonPrefix++;
      } else {
        break;
      }
    }
    
    return jaro + commonPrefix * 0.1 * (1 - jaro);
  }
}

// Export singleton instance
export const watchlistDownloader = new WatchlistDownloader();