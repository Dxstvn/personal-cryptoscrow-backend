// src/services/kyc/amlScreeningService.js

import { getDb } from '../databaseService.js';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

/**
 * AML Screening Service
 * Handles sanctions checks, PEP screening, and adverse media searches
 */
export class AMLScreeningService {
  constructor() {
    this.sanctionsChecker = new SanctionsChecker();
    this.pepChecker = new PEPChecker();
    this.adverseMediaChecker = new AdverseMediaChecker();
    this.initialized = false;
  }

  /**
   * Initialize AML screening service
   */
  async initialize() {
    if (this.initialized) return;

    try {
      // Load watchlists from database
      await this.loadWatchlists();
      this.initialized = true;
      console.log('[AMLScreening] Service initialized');
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
    return this.sanctionsChecker.check(userData);
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
   * Load watchlists from database
   */
  async loadWatchlists() {
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
      
      console.log(`[AMLScreening] Loaded ${sanctionsList.length} sanctions entries and ${pepList.length} PEP entries`);
    } catch (error) {
      console.error('[AMLScreening] Error loading watchlists:', error);
      // Continue with empty lists if loading fails
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
    
    const entryNames = [
      entry.name,
      ...(entry.aliases || []),
      ...(entry.alternateNames || [])
    ].map(n => n.toLowerCase());
    
    for (const searchTerm of searchTerms) {
      for (const entryName of entryNames) {
        // Exact match
        if (searchTerm === entryName) {
          return 1.0;
        }
        
        // Fuzzy match using Levenshtein distance
        const score = this.fuzzyMatch(searchTerm, entryName);
        maxScore = Math.max(maxScore, score);
      }
    }
    
    return maxScore;
  }

  /**
   * Fuzzy string matching using simplified Levenshtein distance
   */
  fuzzyMatch(str1, str2) {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) {
      return 1.0;
    }
    
    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  levenshteinDistance(str1, str2) {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }
}

/**
 * PEP (Politically Exposed Person) Checker
 */
class PEPChecker {
  constructor() {
    this.pepList = [];
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
      const isMatch = this.checkMatch(searchTerms, entry);
      
      if (isMatch) {
        matches.push({
          name: entry.name,
          position: entry.position,
          country: entry.country,
          since: entry.since,
          category: entry.category, // Head of State, Minister, etc.
          riskLevel: entry.riskLevel || 'high'
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
    const entryName = entry.name.toLowerCase();
    
    for (const term of searchTerms) {
      if (entryName.includes(term) || term.includes(entryName)) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Check if user is family member of PEP
   */
  checkFamilyPEP(userData) {
    // In a real implementation, this would check family relationships
    // For now, return false
    return false;
  }
}

/**
 * Adverse Media Checker
 */
class AdverseMediaChecker {
  constructor() {
    this.adverseKeywords = [
      'fraud', 'money laundering', 'terrorist financing',
      'corruption', 'bribery', 'embezzlement', 'sanctions',
      'criminal', 'investigation', 'prosecution', 'conviction',
      'scandal', 'misconduct', 'violation'
    ];
  }

  /**
   * Check for adverse media mentions
   */
  async check(userData) {
    // In a real implementation, this would:
    // 1. Search news APIs (Google News, Bing News, etc.)
    // 2. Search social media
    // 3. Search court records and public databases
    // 4. Use NLP to analyze sentiment and context
    
    // For now, return mock results
    const mockResults = this.mockAdverseMediaSearch(userData);
    
    return {
      hasAdverseMedia: mockResults.length > 0,
      sources: mockResults,
      keywords: this.adverseKeywords,
      timestamp: new Date()
    };
  }

  /**
   * Mock adverse media search
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
          relevanceScore: 0.85
        }];
      }
    }
    
    return [];
  }
}

// Export singleton instance
export const amlScreeningService = new AMLScreeningService();