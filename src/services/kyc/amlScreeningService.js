// src/services/kyc/amlScreeningService.js

import { getDb } from '../databaseService.js';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { watchlistDownloader } from './utils/watchlistDownloader.js';
import { fuzzyMatcher } from './utils/fuzzyMatcher.js';
import { openSanctionsSQLiteService } from './opensanctions/OpenSanctionsSQLiteService.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * AML Screening Service
 * Handles sanctions checks, PEP screening, and adverse media searches
 */
export class AMLScreeningService {
  constructor() {
    this.sanctionsChecker = new SanctionsChecker();
    this.pepChecker = new PEPChecker();
    this.adverseMediaChecker = new AdverseMediaChecker();
    this.watchlistDownloader = watchlistDownloader;
    this.fuzzyMatcher = fuzzyMatcher;
    this.openSanctionsService = openSanctionsSQLiteService;
    this.initialized = false;
    this.lastWatchlistUpdate = null;
    this.updateInterval = 7 * 24 * 60 * 60 * 1000; // 7 days
  }

  /**
   * Initialize AML screening service
   */
  async initialize() {
    if (this.initialized) return;

    try {
      // Initialize OpenSanctions service first
      await this.openSanctionsService.initialize();
      console.log('[AMLScreening] OpenSanctions service initialized');
      
      // Initialize watchlist downloader
      await this.watchlistDownloader.initialize();
      
      // Check if watchlists need updating
      await this.updateWatchlistsIfNeeded();
      
      // Load watchlists from database or local cache
      await this.loadWatchlists();
      
      // Build PEP database if needed
      await this.initializePEPDatabase();
      
      this.initialized = true;
      console.log('[AMLScreening] Service initialized with OpenSanctions integration');
    } catch (error) {
      console.error('[AMLScreening] Initialization error:', error);
      throw error;
    }
  }

  /**
   * Screen a user for AML compliance
   * @param {Object} userData - User data to screen
   * @returns {Promise<Object>} Screening results
   */
  async screenUser(userData) {
    await this.initialize();

    console.log(`[AMLScreening] Starting screening for user ${userData.userId}`);

    try {
      // Run all checks in parallel
      const [sanctionsResult, pepResult, adverseMediaResult] = await Promise.all([
        this.checkSanctions(userData),
        this.checkPEP(userData),
        this.checkAdverseMedia(userData)
      ]);

      // Calculate overall risk
      const overallRisk = this.calculateOverallRisk({
        sanctions: sanctionsResult,
        pep: pepResult,
        adverseMedia: adverseMediaResult
      });

      // Store screening results
      await this.storeScreeningResults(userData.userId, {
        sanctionsResult,
        pepResult,
        adverseMediaResult,
        overallRisk
      });

      console.log(`[AMLScreening] Screening completed for user ${userData.userId}. Risk: ${overallRisk}`);

      return {
        sanctionsHit: sanctionsResult.hasMatches,
        sanctionsMatches: sanctionsResult.matches,
        pepStatus: pepResult.isPEP,
        pepDetails: pepResult.details,
        adverseMedia: adverseMediaResult.hasAdverseMedia,
        adverseMediaSources: adverseMediaResult.sources,
        overallRisk,
        screeningId: uuidv4(),
        timestamp: new Date()
      };
    } catch (error) {
      console.error('[AMLScreening] Error screening user:', error);
      throw error;
    }
  }

  /**
   * Check user against sanctions lists
   * @param {Object} userData - User data
   * @returns {Promise<Object>} Sanctions check result
   */
  async checkSanctions(userData) {
    try {
      // First, try OpenSanctions search for enhanced coverage
      const openSanctionsResults = await this.searchOpenSanctions(userData);
      
      // Then, run traditional sanctions check for additional coverage
      const traditionalResults = await this.sanctionsChecker.check(userData);
      
      // Combine results, giving priority to OpenSanctions due to better data quality
      const combinedMatches = [
        ...openSanctionsResults.matches,
        ...traditionalResults.matches.filter(match => 
          // Avoid duplicates by checking if OpenSanctions already found this match
          !openSanctionsResults.matches.some(osMatch => 
            osMatch.matchedName.toLowerCase() === match.matchedName.toLowerCase()
          )
        )
      ];
      
      return {
        hasMatches: combinedMatches.length > 0,
        matches: combinedMatches,
        checkedLists: ['OpenSanctions', 'OFAC', 'UN', 'EU'],
        openSanctionsChecked: true,
        timestamp: new Date()
      };
    } catch (error) {
      console.error('[AMLScreening] Error in sanctions check:', error);
      
      // Fallback to traditional screening if OpenSanctions fails
      console.log('[AMLScreening] Falling back to traditional sanctions screening');
      return this.sanctionsChecker.check(userData);
    }
  }

  /**
   * Check if user is a Politically Exposed Person
   * @param {Object} userData - User data
   * @returns {Promise<Object>} PEP check result
   */
  async checkPEP(userData) {
    return this.pepChecker.check(userData);
  }

  /**
   * Check for adverse media mentions
   * @param {Object} userData - User data
   * @returns {Promise<Object>} Adverse media check result
   */
  async checkAdverseMedia(userData) {
    return this.adverseMediaChecker.check(userData);
  }

  /**
   * Search OpenSanctions database
   * @param {Object} userData - User data
   * @returns {Promise<Object>} OpenSanctions search results
   */
  async searchOpenSanctions(userData) {
    try {
      const searchName = `${userData.firstName} ${userData.lastName}`.trim();
      
      if (!searchName || searchName.length < 2) {
        return { hasMatches: false, matches: [] };
      }
      
      // Search OpenSanctions with appropriate thresholds
      const results = await this.openSanctionsService.search(searchName, {
        threshold: 0.75, // 75% match threshold
        limit: 50,
        includeDetails: true
      });
      
      // Transform OpenSanctions results to match our AML format
      const matches = results
        .filter(result => result.score >= 0.75) // Additional filtering
        .map(result => ({
          listSource: 'OpenSanctions',
          matchedName: result.name,
          matchScore: result.score,
          entityId: result.entity_id,
          schema: result.schema,
          aliases: result.properties?.name?.slice(1) || [], // First name is primary, rest are aliases
          dateOfBirth: result.properties?.birthDate?.[0] || null,
          nationality: result.properties?.nationality?.[0] || null,
          program: result.properties?.program?.[0] || result.properties?.topics?.join(', ') || 'Sanctioned Entity',
          reason: result.properties?.summary || 'Listed in OpenSanctions database',
          topics: result.properties?.topics || [],
          firstSeen: result.first_seen,
          lastSeen: result.last_seen
        }));
      
      console.log(`[AMLScreening] OpenSanctions search for "${searchName}" found ${matches.length} matches`);
      
      return {
        hasMatches: matches.length > 0,
        matches,
        searchTerm: searchName,
        resultsCount: results.length,
        filteredCount: matches.length
      };
    } catch (error) {
      console.error('[AMLScreening] OpenSanctions search error:', error);
      
      // Return empty results instead of throwing to allow fallback
      return { hasMatches: false, matches: [], error: error.message };
    }
  }

  /**
   * Calculate overall risk score
   */
  calculateOverallRisk(results) {
    let riskScore = 0;
    
    // Sanctions hit is critical risk
    if (results.sanctions.hasMatches) {
      riskScore += 100;
    }
    
    // PEP status is high risk
    if (results.pep.isPEP) {
      riskScore += 50;
    }
    
    // Adverse media is medium risk
    if (results.adverseMedia.hasAdverseMedia) {
      riskScore += 30;
    }
    
    // Determine risk level
    if (riskScore >= 100) return 'critical';
    if (riskScore >= 50) return 'high';
    if (riskScore >= 30) return 'medium';
    return 'low';
  }

  /**
   * Update watchlists if needed
   */
  async updateWatchlistsIfNeeded() {
    try {
      const needsUpdate = !this.lastWatchlistUpdate || 
        (Date.now() - this.lastWatchlistUpdate) > this.updateInterval;
      
      if (needsUpdate) {
        console.log('[AMLScreening] Updating watchlists...');
        const results = await this.watchlistDownloader.downloadAllWatchlists();
        
        console.log('[AMLScreening] Watchlist update results:', {
          success: results.success.length,
          failed: results.failed.length
        });
        
        this.lastWatchlistUpdate = Date.now();
        
        // Store update timestamp
        await this.storeUpdateTimestamp();
      }
    } catch (error) {
      console.error('[AMLScreening] Error updating watchlists:', error);
    }
  }

  /**
   * Load watchlists from database or local cache
   */
  async loadWatchlists() {
    try {
      // Try to load from local cache first
      const consolidatedList = await this.watchlistDownloader.getConsolidatedList();
      
      if (consolidatedList.length > 0) {
        // Separate by type
        const sanctionsList = consolidatedList.filter(entry => 
          ['OFAC', 'UN', 'EU', 'UK'].includes(entry.source)
        );
        
        this.sanctionsChecker.loadList(sanctionsList);
        console.log(`[AMLScreening] Loaded ${sanctionsList.length} sanctions entries from local cache`);
        
        // Also try to load from database for PEP lists
        await this.loadPEPFromDatabase();
      } else {
        // Fallback to database
        await this.loadFromDatabase();
      }
    } catch (error) {
      console.error('[AMLScreening] Error loading watchlists:', error);
      // Continue with empty lists if loading fails
    }
  }

  /**
   * Load PEP lists from database
   */
  async loadPEPFromDatabase() {
    try {
      const db = await getDb();
      const pepSnapshot = await db.collection('amlWatchlists')
        .where('listType', '==', 'pep')
        .get();
      
      const pepList = [];
      pepSnapshot.forEach(doc => {
        pepList.push(...doc.data().entries);
      });
      
      this.pepChecker.loadList(pepList);
      console.log(`[AMLScreening] Loaded ${pepList.length} PEP entries from database`);
    } catch (error) {
      console.error('[AMLScreening] Error loading PEP from database:', error);
    }
  }

  /**
   * Load from database (fallback)
   */
  async loadFromDatabase() {
    try {
      const db = await getDb();
      
      // Load sanctions lists
      const sanctionsSnapshot = await db.collection('amlWatchlists')
        .where('listType', '==', 'sanctions')
        .get();
      
      const sanctionsList = [];
      sanctionsSnapshot.forEach(doc => {
        sanctionsList.push(...doc.data().entries);
      });
      
      this.sanctionsChecker.loadList(sanctionsList);
      
      // Load PEP lists
      const pepSnapshot = await db.collection('amlWatchlists')
        .where('listType', '==', 'pep')
        .get();
      
      const pepList = [];
      pepSnapshot.forEach(doc => {
        pepList.push(...doc.data().entries);
      });
      
      this.pepChecker.loadList(pepList);
      
      console.log(`[AMLScreening] Loaded ${sanctionsList.length} sanctions entries and ${pepList.length} PEP entries from database`);
    } catch (error) {
      console.error('[AMLScreening] Error loading from database:', error);
    }
  }

  /**
   * Initialize PEP database
   */
  async initializePEPDatabase() {
    try {
      // Check if we have PEP data
      if (this.pepChecker.pepList.length === 0) {
        console.log('[AMLScreening] Building PEP database...');
        const pepEntries = await this.buildPEPDatabase();
        this.pepChecker.loadList(pepEntries);
        
        // Store in database for persistence
        await this.storePEPDatabase(pepEntries);
      }
    } catch (error) {
      console.error('[AMLScreening] Error initializing PEP database:', error);
    }
  }

  /**
   * Build PEP database from public sources
   */
  async buildPEPDatabase() {
    const pepEntries = [];
    
    // Load pre-compiled PEP data
    try {
      const pepDataPath = path.join(__dirname, 'data', 'pep_database.json');
      const pepData = await fs.readFile(pepDataPath, 'utf8');
      const compiledPEPs = JSON.parse(pepData);
      pepEntries.push(...compiledPEPs);
    } catch (error) {
      console.log('[AMLScreening] No pre-compiled PEP data found, using defaults');
      
      // Default high-profile PEPs for demonstration
      pepEntries.push(...this.getDefaultPEPList());
    }
    
    return pepEntries;
  }

  /**
   * Get default PEP list
   */
  getDefaultPEPList() {
    return [
      {
        name: 'Sample Head of State',
        position: 'President',
        country: 'Sample Country',
        category: 'Head of State',
        since: '2020-01-01',
        riskLevel: 'high',
        source: 'default'
      },
      // Add more default entries as needed
    ];
  }

  /**
   * Store PEP database
   */
  async storePEPDatabase(pepEntries) {
    try {
      const db = await getDb();
      const batch = db.batch();
      
      // Store in chunks to avoid firestore limits
      const chunkSize = 100;
      for (let i = 0; i < pepEntries.length; i += chunkSize) {
        const chunk = pepEntries.slice(i, i + chunkSize);
        const docRef = db.collection('amlWatchlists').doc(`pep_${i / chunkSize}`);
        
        batch.set(docRef, {
          listType: 'pep',
          source: 'compiled',
          entries: chunk,
          lastUpdated: new Date(),
          entryCount: chunk.length
        });
      }
      
      await batch.commit();
      console.log(`[AMLScreening] Stored ${pepEntries.length} PEP entries in database`);
    } catch (error) {
      console.error('[AMLScreening] Error storing PEP database:', error);
    }
  }

  /**
   * Store update timestamp
   */
  async storeUpdateTimestamp() {
    try {
      const db = await getDb();
      await db.collection('amlWatchlists').doc('metadata').set({
        lastUpdate: new Date(),
        lastUpdateTimestamp: Date.now(),
        sources: Object.keys(this.watchlistDownloader.sources)
      }, { merge: true });
    } catch (error) {
      console.error('[AMLScreening] Error storing update timestamp:', error);
    }
  }

  /**
   * Store screening results in database
   */
  async storeScreeningResults(userId, results) {
    try {
      const db = await getDb();
      
      // Update user's AML status
      await db.collection('users').doc(userId).update({
        'amlStatus.lastScreened': new Date(),
        'amlStatus.riskScore': this.calculateRiskScore(results),
        'amlStatus.sanctions.checked': true,
        'amlStatus.sanctions.matches': results.sanctionsResult.matches || [],
        'amlStatus.sanctions.lastChecked': new Date(),
        'amlStatus.pep.isPEP': results.pepResult.isPEP,
        'amlStatus.pep.details': results.pepResult.details || null,
        'amlStatus.pep.lastChecked': new Date(),
        'amlStatus.adverseMedia.hasAdverseMedia': results.adverseMediaResult.hasAdverseMedia,
        'amlStatus.adverseMedia.sources': results.adverseMediaResult.sources || [],
        'amlStatus.adverseMedia.lastChecked': new Date()
      });
      
      // Log audit entry
      await db.collection('complianceAudits').add({
        auditId: uuidv4(),
        userId,
        action: 'aml_screening_completed',
        timestamp: new Date(),
        performedBy: 'system',
        details: {
          overallRisk: results.overallRisk,
          sanctionsHit: results.sanctionsResult.hasMatches,
          pepStatus: results.pepResult.isPEP,
          adverseMediaHit: results.adverseMediaResult.hasAdverseMedia
        },
        result: 'success'
      });
    } catch (error) {
      console.error('[AMLScreening] Error storing results:', error);
    }
  }

  /**
   * Calculate numeric risk score (0-100)
   */
  calculateRiskScore(results) {
    let score = 0;
    
    if (results.sanctionsResult.hasMatches) score += 50;
    if (results.pepResult.isPEP) score += 30;
    if (results.adverseMediaResult.hasAdverseMedia) score += 20;
    
    return Math.min(score, 100);
  }
}

/**
 * Sanctions Checker
 * Checks against OFAC, UN, EU, and other sanctions lists
 */
class SanctionsChecker {
  constructor() {
    this.sanctionsList = [];
    this.ofacList = [];
    this.unList = [];
    this.euList = [];
    this.fuzzyMatcher = fuzzyMatcher;
  }

  /**
   * Load sanctions list data
   */
  loadList(entries) {
    this.sanctionsList = entries;
    
    // Separate by source for targeted searches
    this.ofacList = entries.filter(e => e.source === 'OFAC');
    this.unList = entries.filter(e => e.source === 'UN');
    this.euList = entries.filter(e => e.source === 'EU');
  }

  /**
   * Check user against sanctions lists
   */
  async check(userData) {
    const matches = [];
    
    // Prepare search terms
    const searchTerms = this.prepareSearchTerms(userData);
    
    // Search each list
    for (const entry of this.sanctionsList) {
      const matchScore = this.calculateMatchScore(searchTerms, entry);
      
      if (matchScore > 0.8) { // 80% match threshold
        matches.push({
          listSource: entry.source,
          matchedName: entry.name,
          matchScore,
          aliases: entry.aliases || [],
          dateOfBirth: entry.dateOfBirth,
          nationality: entry.nationality,
          reason: entry.reason,
          addedDate: entry.addedDate
        });
      }
    }
    
    return {
      hasMatches: matches.length > 0,
      matches,
      checkedLists: ['OFAC', 'UN', 'EU'],
      timestamp: new Date()
    };
  }

  /**
   * Prepare search terms from user data
   */
  prepareSearchTerms(userData) {
    const terms = [];
    
    // Full name variations
    if (userData.firstName && userData.lastName) {
      terms.push(`${userData.firstName} ${userData.lastName}`.toLowerCase());
      terms.push(`${userData.lastName} ${userData.firstName}`.toLowerCase());
      terms.push(`${userData.lastName}, ${userData.firstName}`.toLowerCase());
    }
    
    // Include middle name if available
    if (userData.middleName) {
      terms.push(`${userData.firstName} ${userData.middleName} ${userData.lastName}`.toLowerCase());
    }
    
    // Include aliases if available
    if (userData.aliases) {
      terms.push(...userData.aliases.map(a => a.toLowerCase()));
    }
    
    return terms;
  }

  /**
   * Calculate match score between search terms and entry
   */
  calculateMatchScore(searchTerms, entry) {
    let maxScore = 0;
    let bestMatchDetails = null;
    
    const entryNames = [
      entry.name,
      ...(entry.aliases || []),
      ...(entry.alternateNames || [])
    ].filter(n => n && n.length > 0);
    
    for (const searchTerm of searchTerms) {
      for (const entryName of entryNames) {
        // Use advanced fuzzy matcher
        const matchResult = this.fuzzyMatcher.match(searchTerm, entryName, {
          threshold: 0.7
        });
        
        if (matchResult.score > maxScore) {
          maxScore = matchResult.score;
          bestMatchDetails = {
            ...matchResult,
            searchTerm,
            matchedName: entryName
          };
        }
      }
    }
    
    // Also try contextual matching if we have additional data
    if (entry.dateOfBirth || entry.nationality) {
      const contextResult = this.fuzzyMatcher.contextualMatch(
        { name: searchTerms[0], dateOfBirth: null, nationality: null },
        { name: entry.name, dateOfBirth: entry.dateOfBirth, nationality: entry.nationality },
        { threshold: 0.7 }
      );
      
      if (contextResult.score > maxScore) {
        maxScore = contextResult.score;
        bestMatchDetails = contextResult;
      }
    }
    
    return maxScore;
  }

  /**
   * Enhanced sanctions search with multiple sources
   */
  async searchAcrossAllLists(userData) {
    // Use watchlist downloader's search functionality
    const searchName = `${userData.firstName} ${userData.lastName}`;
    const results = await watchlistDownloader.searchWatchlists(searchName, {
      threshold: 0.8
    });
    
    return results.map(result => ({
      listSource: result.source,
      matchedName: result.name,
      matchScore: result.matchScore,
      matchType: result.matchType,
      aliases: result.aliases || [],
      dateOfBirth: result.dateOfBirth,
      nationality: result.nationality,
      reason: result.program || result.designation || 'Sanctioned entity',
      addedDate: result.addedDate,
      uid: result.uid
    }));
  }
}

/**
 * PEP (Politically Exposed Person) Checker
 */
class PEPChecker {
  constructor() {
    this.pepList = [];
    this.fuzzyMatcher = fuzzyMatcher;
  }

  /**
   * Load PEP list data
   */
  loadList(entries) {
    this.pepList = entries;
  }

  /**
   * Check if user is a PEP
   */
  async check(userData) {
    const matches = [];
    
    // Search for matches
    const searchTerms = this.prepareSearchTerms(userData);
    
    for (const entry of this.pepList) {
      const matchResult = this.checkMatch(searchTerms, entry);
      
      if (matchResult.matches) {
        matches.push({
          name: entry.name,
          position: entry.position,
          country: entry.country,
          since: entry.since,
          category: entry.category, // Head of State, Minister, etc.
          riskLevel: entry.riskLevel || 'high',
          matchScore: matchResult.score,
          matchType: matchResult.matchType
        });
      }
    }
    
    // Also check family relationships if available
    const familyPEP = this.checkFamilyPEP(userData);
    
    return {
      isPEP: matches.length > 0 || familyPEP,
      directPEP: matches.length > 0,
      familyPEP,
      details: matches,
      timestamp: new Date()
    };
  }

  /**
   * Prepare search terms
   */
  prepareSearchTerms(userData) {
    const terms = [];
    
    if (userData.firstName && userData.lastName) {
      terms.push(`${userData.firstName} ${userData.lastName}`.toLowerCase());
      terms.push(`${userData.lastName}, ${userData.firstName}`.toLowerCase());
    }
    
    return terms;
  }

  /**
   * Check if terms match PEP entry
   */
  checkMatch(searchTerms, entry) {
    // Use fuzzy matcher for more accurate matching
    for (const term of searchTerms) {
      const matchResult = this.fuzzyMatcher.match(term, entry.name, {
        threshold: 0.75
      });
      
      if (matchResult.isMatch) {
        return {
          matches: true,
          score: matchResult.score,
          matchType: matchResult.matchType
        };
      }
    }
    
    return { matches: false, score: 0 };
  }

  /**
   * Check if user is family member of PEP
   */
  checkFamilyPEP(userData) {
    // Check for common family name patterns
    const familyIndicators = ['jr', 'jr.', 'sr', 'sr.', 'ii', 'iii', 'iv'];
    const lastName = userData.lastName?.toLowerCase() || '';
    
    // Check if any PEP has the same last name
    for (const entry of this.pepList) {
      const pepLastName = entry.name.split(' ').pop()?.toLowerCase() || '';
      
      if (pepLastName && lastName && pepLastName === lastName) {
        // Check for family indicators
        const userName = `${userData.firstName} ${userData.lastName}`.toLowerCase();
        for (const indicator of familyIndicators) {
          if (userName.includes(indicator)) {
            return true;
          }
        }
      }
    }
    
    return false;
  }
}

/**
 * Adverse Media Checker
 */
class AdverseMediaChecker {
  constructor() {
    this.adverseKeywords = [
      // Financial crimes
      'fraud', 'money laundering', 'terrorist financing', 'tax evasion',
      'insider trading', 'market manipulation', 'ponzi scheme', 'embezzlement',
      
      // Corruption
      'corruption', 'bribery', 'kickback', 'extortion', 'racketeering',
      
      // Legal issues
      'criminal', 'investigation', 'prosecution', 'conviction', 'indictment',
      'arrest', 'lawsuit', 'litigation', 'settlement', 'guilty', 'sentenced',
      
      // Sanctions and compliance
      'sanctions', 'blacklist', 'frozen assets', 'regulatory violation',
      
      // Other misconduct
      'scandal', 'misconduct', 'violation', 'breach', 'illegal',
      'trafficking', 'smuggling', 'forgery', 'conspiracy'
    ];
    
    this.riskCategories = {
      high: ['terrorist financing', 'money laundering', 'sanctions', 'trafficking'],
      medium: ['fraud', 'corruption', 'bribery', 'embezzlement'],
      low: ['investigation', 'lawsuit', 'regulatory violation']
    };
  }

  /**
   * Check for adverse media mentions
   */
  async check(userData) {
    const searchName = `${userData.firstName} ${userData.lastName}`;
    const results = [];
    
    try {
      // Search using multiple strategies
      const searches = await Promise.all([
        this.searchLocalDatabase(searchName),
        this.searchCachedMedia(searchName),
        this.analyzeRiskIndicators(userData)
      ]);
      
      // Combine results
      searches.forEach(searchResults => {
        if (searchResults && searchResults.length > 0) {
          results.push(...searchResults);
        }
      });
      
      // Deduplicate and sort by relevance
      const uniqueResults = this.deduplicateResults(results);
      const scoredResults = this.scoreResults(uniqueResults, searchName);
      
      return {
        hasAdverseMedia: scoredResults.length > 0,
        sources: scoredResults,
        keywords: this.adverseKeywords,
        riskScore: this.calculateMediaRiskScore(scoredResults),
        timestamp: new Date()
      };
    } catch (error) {
      console.error('[AdverseMedia] Error during check:', error);
      
      // Fallback to basic check
      const mockResults = this.mockAdverseMediaSearch(userData);
      return {
        hasAdverseMedia: mockResults.length > 0,
        sources: mockResults,
        keywords: this.adverseKeywords,
        timestamp: new Date()
      };
    }
  }

  /**
   * Search local database for adverse media
   */
  async searchLocalDatabase(searchName) {
    // This would search a local database of known adverse media
    // For now, return empty array
    return [];
  }

  /**
   * Search cached media entries
   */
  async searchCachedMedia(searchName) {
    // This would search cached news articles and media mentions
    // For now, return empty array
    return [];
  }

  /**
   * Analyze risk indicators in user data
   */
  async analyzeRiskIndicators(userData) {
    const results = [];
    
    // Check for high-risk patterns in name
    const userName = `${userData.firstName} ${userData.lastName}`.toLowerCase();
    
    for (const keyword of this.adverseKeywords) {
      if (userName.includes(keyword)) {
        results.push({
          source: 'Name Analysis',
          title: `Name contains risk keyword: ${keyword}`,
          date: new Date(),
          snippet: `User name contains potential risk indicator`,
          relevanceScore: 0.6,
          keyword,
          riskCategory: this.categorizeRisk(keyword)
        });
      }
    }
    
    return results;
  }

  /**
   * Mock adverse media search (fallback)
   */
  mockAdverseMediaSearch(userData) {
    // Simulate finding adverse media for high-risk names
    const highRiskNames = ['criminal', 'fraud', 'suspicious'];
    const userName = `${userData.firstName} ${userData.lastName}`.toLowerCase();
    
    for (const riskName of highRiskNames) {
      if (userName.includes(riskName)) {
        return [{
          source: 'Mock News Network',
          title: 'Investigation into suspicious activities',
          date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
          url: 'https://example.com/article',
          snippet: 'Authorities are investigating...',
          relevanceScore: 0.85,
          keywords: ['investigation', 'suspicious'],
          riskCategory: 'medium'
        }];
      }
    }
    
    return [];
  }

  /**
   * Deduplicate results
   */
  deduplicateResults(results) {
    const seen = new Set();
    return results.filter(result => {
      const key = `${result.source}-${result.title}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Score and sort results by relevance
   */
  scoreResults(results, searchName) {
    return results
      .map(result => ({
        ...result,
        finalScore: this.calculateRelevanceScore(result, searchName)
      }))
      .sort((a, b) => b.finalScore - a.finalScore)
      .slice(0, 10); // Top 10 most relevant
  }

  /**
   * Calculate relevance score
   */
  calculateRelevanceScore(result, searchName) {
    let score = result.relevanceScore || 0.5;
    
    // Boost score for recent articles
    const daysSincePublished = (Date.now() - new Date(result.date)) / (1000 * 60 * 60 * 24);
    if (daysSincePublished < 30) score += 0.2;
    else if (daysSincePublished < 90) score += 0.1;
    
    // Boost score for high-risk keywords
    if (result.keywords) {
      for (const keyword of result.keywords) {
        if (this.riskCategories.high.includes(keyword)) {
          score += 0.3;
        } else if (this.riskCategories.medium.includes(keyword)) {
          score += 0.2;
        }
      }
    }
    
    return Math.min(score, 1.0);
  }

  /**
   * Calculate overall media risk score
   */
  calculateMediaRiskScore(results) {
    if (results.length === 0) return 0;
    
    let riskScore = 0;
    
    // Factor in number of results
    riskScore += Math.min(results.length * 10, 30);
    
    // Factor in severity of findings
    for (const result of results) {
      if (result.riskCategory === 'high') riskScore += 20;
      else if (result.riskCategory === 'medium') riskScore += 10;
      else riskScore += 5;
    }
    
    return Math.min(riskScore, 100);
  }

  /**
   * Categorize risk level of keyword
   */
  categorizeRisk(keyword) {
    for (const [level, keywords] of Object.entries(this.riskCategories)) {
      if (keywords.includes(keyword)) return level;
    }
    return 'low';
  }
}

// Export singleton instance
export const amlScreeningService = new AMLScreeningService();