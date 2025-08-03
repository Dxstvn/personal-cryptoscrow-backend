// src/services/kyc/utils/fuzzyMatcher.js

import natural from 'natural';

/**
 * Advanced Fuzzy Matcher for AML Name Screening
 * Implements multiple algorithms for accurate name matching
 */
export class FuzzyMatcher {
  constructor() {
    // Initialize phonetic algorithms
    this.soundex = natural.SoundEx;
    this.metaphone = natural.Metaphone;
    this.doubleMetaphone = natural.DoubleMetaphone;
    
    // Initialize distance algorithms
    this.jaroWinkler = natural.JaroWinklerDistance;
    this.levenshtein = natural.LevenshteinDistance;
    this.damerauLevenshtein = natural.DamerauLevenshteinDistance;
    
    // Cultural name variations database
    this.nameVariations = {
      // Common transliterations
      'mohammed': ['muhammad', 'mohamed', 'muhammed', 'mohammad', 'muhamed'],
      'michael': ['mikhail', 'miguel', 'michel', 'mikael'],
      'john': ['juan', 'jean', 'johan', 'giovanni', 'ivan'],
      'peter': ['pedro', 'pierre', 'pietro', 'petr'],
      'joseph': ['jose', 'giuseppe', 'yosef', 'josef'],
      'mary': ['maria', 'marie', 'mariam', 'maryam'],
      
      // Common nicknames
      'william': ['will', 'bill', 'billy', 'willy'],
      'robert': ['rob', 'bob', 'bobby', 'robbie'],
      'elizabeth': ['liz', 'beth', 'betty', 'eliza', 'lisa'],
      'margaret': ['maggie', 'meg', 'peggy', 'marge'],
      'richard': ['rick', 'dick', 'rich', 'ricky'],
      
      // Title variations
      'mr': ['mister', 'sr', 'senor', 'monsieur'],
      'mrs': ['missus', 'sra', 'senora', 'madame'],
      'dr': ['doctor', 'dok', 'doktor'],
      
      // Common misspellings/variations
      'ahmed': ['ahmad', 'ahmet'],
      'hussein': ['hussain', 'hossein', 'husain'],
      'hassan': ['hasan', 'hasaan'],
      'ali': ['aly'],
      'omar': ['umar', 'omer']
    };
    
    // Weights for different matching algorithms
    this.algorithmWeights = {
      exact: 1.0,
      phonetic: 0.85,
      fuzzy: 0.9,
      cultural: 0.8,
      initials: 0.6,
      partial: 0.7
    };
  }

  /**
   * Comprehensive name matching
   * @param {string} searchName - Name to search for
   * @param {string} targetName - Name to match against
   * @param {Object} options - Matching options
   * @returns {Object} Match result with score and details
   */
  match(searchName, targetName, options = {}) {
    const threshold = options.threshold || 0.75;
    
    // Normalize names
    const normalizedSearch = this.normalizeName(searchName);
    const normalizedTarget = this.normalizeName(targetName);
    
    // Run multiple matching algorithms
    const matchResults = {
      exact: this.exactMatch(normalizedSearch, normalizedTarget),
      phonetic: this.phoneticMatch(normalizedSearch, normalizedTarget),
      fuzzy: this.fuzzyMatch(normalizedSearch, normalizedTarget),
      cultural: this.culturalMatch(normalizedSearch, normalizedTarget),
      initials: this.initialsMatch(normalizedSearch, normalizedTarget),
      partial: this.partialMatch(normalizedSearch, normalizedTarget),
      transposition: this.transpositionMatch(normalizedSearch, normalizedTarget)
    };
    
    // Calculate weighted score
    const finalScore = this.calculateWeightedScore(matchResults);
    const isMatch = finalScore >= threshold;
    
    return {
      isMatch,
      score: finalScore,
      threshold,
      searchName,
      targetName,
      normalizedSearch,
      normalizedTarget,
      algorithms: matchResults,
      confidence: this.calculateConfidence(matchResults),
      matchType: this.determineMatchType(matchResults)
    };
  }

  /**
   * Normalize name for comparison
   */
  normalizeName(name) {
    if (!name) return '';
    
    return name
      .toLowerCase()
      .trim()
      // Remove titles
      .replace(/\b(mr|mrs|ms|miss|dr|prof|sir|lady|lord)\b\.?\s*/g, '')
      // Remove special characters except hyphens and apostrophes
      .replace(/[^\w\s'-]/g, '')
      // Normalize whitespace
      .replace(/\s+/g, ' ')
      // Remove possessive
      .replace(/'s\b/g, '')
      .trim();
  }

  /**
   * Exact match comparison
   */
  exactMatch(name1, name2) {
    return {
      matches: name1 === name2,
      score: name1 === name2 ? 1.0 : 0.0
    };
  }

  /**
   * Phonetic matching using multiple algorithms
   */
  phoneticMatch(name1, name2) {
    // Split names into parts
    const parts1 = name1.split(' ');
    const parts2 = name2.split(' ');
    
    let bestScore = 0;
    
    // Try different combinations
    for (const part1 of parts1) {
      for (const part2 of parts2) {
        // Soundex
        if (this.soundex.compare(part1, part2)) {
          bestScore = Math.max(bestScore, 0.7);
        }
        
        // Metaphone
        if (this.metaphone.compare(part1, part2)) {
          bestScore = Math.max(bestScore, 0.8);
        }
        
        // Double Metaphone
        const dm1 = this.doubleMetaphone.process(part1);
        const dm2 = this.doubleMetaphone.process(part2);
        if (dm1[0] === dm2[0] || dm1[0] === dm2[1] || dm1[1] === dm2[0]) {
          bestScore = Math.max(bestScore, 0.85);
        }
      }
    }
    
    return {
      matches: bestScore > 0.7,
      score: bestScore
    };
  }

  /**
   * Fuzzy matching using distance algorithms
   */
  fuzzyMatch(name1, name2) {
    // Jaro-Winkler distance
    const jwScore = this.jaroWinkler(name1, name2);
    
    // Normalized Levenshtein distance
    const levDistance = this.levenshtein(name1, name2);
    const maxLen = Math.max(name1.length, name2.length);
    const levScore = 1 - (levDistance / maxLen);
    
    // Damerau-Levenshtein (allows transpositions)
    const dlDistance = this.damerauLevenshtein(name1, name2);
    const dlScore = 1 - (dlDistance / maxLen);
    
    // N-gram similarity
    const ngramScore = this.ngramSimilarity(name1, name2, 2);
    
    // Take weighted average
    const finalScore = (jwScore * 0.4 + levScore * 0.2 + dlScore * 0.2 + ngramScore * 0.2);
    
    return {
      matches: finalScore > 0.75,
      score: finalScore,
      details: {
        jaroWinkler: jwScore,
        levenshtein: levScore,
        damerauLevenshtein: dlScore,
        ngram: ngramScore
      }
    };
  }

  /**
   * Cultural name variation matching
   */
  culturalMatch(name1, name2) {
    const parts1 = name1.split(' ');
    const parts2 = name2.split(' ');
    
    let matchFound = false;
    let bestScore = 0;
    
    for (const part1 of parts1) {
      // Check if part1 has known variations
      const variations = this.getNameVariations(part1);
      
      for (const part2 of parts2) {
        if (variations.includes(part2)) {
          matchFound = true;
          bestScore = Math.max(bestScore, 0.9);
        }
        
        // Also check reverse
        const variations2 = this.getNameVariations(part2);
        if (variations2.includes(part1)) {
          matchFound = true;
          bestScore = Math.max(bestScore, 0.9);
        }
      }
    }
    
    return {
      matches: matchFound,
      score: bestScore
    };
  }

  /**
   * Initials matching
   */
  initialsMatch(name1, name2) {
    const initials1 = this.extractInitials(name1);
    const initials2 = this.extractInitials(name2);
    
    if (!initials1 || !initials2) {
      return { matches: false, score: 0 };
    }
    
    // Check if one is contained in the other
    const matches = initials1 === initials2 || 
                   initials1.includes(initials2) || 
                   initials2.includes(initials1);
    
    return {
      matches,
      score: matches ? 0.7 : 0,
      initials: { name1: initials1, name2: initials2 }
    };
  }

  /**
   * Partial name matching
   */
  partialMatch(name1, name2) {
    const parts1 = name1.split(' ');
    const parts2 = name2.split(' ');
    
    let matchCount = 0;
    let totalParts = Math.max(parts1.length, parts2.length);
    
    // Check each part
    for (const part1 of parts1) {
      for (const part2 of parts2) {
        if (part1 === part2 || this.fuzzyMatch(part1, part2).score > 0.85) {
          matchCount++;
          break;
        }
      }
    }
    
    const score = matchCount / totalParts;
    
    return {
      matches: score > 0.5,
      score,
      matchedParts: matchCount,
      totalParts
    };
  }

  /**
   * Transposition matching (swapped first/last names)
   */
  transpositionMatch(name1, name2) {
    const parts1 = name1.split(' ');
    const parts2 = name2.split(' ');
    
    if (parts1.length < 2 || parts2.length < 2) {
      return { matches: false, score: 0 };
    }
    
    // Try swapping first and last
    const swapped1 = `${parts1[parts1.length - 1]} ${parts1.slice(0, -1).join(' ')}`;
    const swapped2 = `${parts2[parts2.length - 1]} ${parts2.slice(0, -1).join(' ')}`;
    
    const score1 = this.fuzzyMatch(swapped1, name2).score;
    const score2 = this.fuzzyMatch(name1, swapped2).score;
    const bestScore = Math.max(score1, score2);
    
    return {
      matches: bestScore > 0.85,
      score: bestScore
    };
  }

  /**
   * Calculate N-gram similarity
   */
  ngramSimilarity(str1, str2, n = 2) {
    if (str1.length < n || str2.length < n) return 0;
    
    const ngrams1 = this.getNgrams(str1, n);
    const ngrams2 = this.getNgrams(str2, n);
    
    const intersection = ngrams1.filter(gram => ngrams2.includes(gram));
    const union = [...new Set([...ngrams1, ...ngrams2])];
    
    return union.length > 0 ? intersection.length / union.length : 0;
  }

  /**
   * Extract N-grams from string
   */
  getNgrams(str, n) {
    const ngrams = [];
    for (let i = 0; i <= str.length - n; i++) {
      ngrams.push(str.substr(i, n));
    }
    return ngrams;
  }

  /**
   * Get known variations of a name
   */
  getNameVariations(name) {
    const variations = [name];
    
    // Check direct variations
    if (this.nameVariations[name]) {
      variations.push(...this.nameVariations[name]);
    }
    
    // Check if this name is a variation of another
    for (const [key, values] of Object.entries(this.nameVariations)) {
      if (values.includes(name)) {
        variations.push(key);
        variations.push(...values.filter(v => v !== name));
      }
    }
    
    return [...new Set(variations)];
  }

  /**
   * Extract initials from name
   */
  extractInitials(name) {
    const parts = name.split(' ').filter(p => p.length > 0);
    return parts.map(p => p[0]).join('').toUpperCase();
  }

  /**
   * Calculate weighted score from all algorithms
   */
  calculateWeightedScore(results) {
    let totalScore = 0;
    let totalWeight = 0;
    
    for (const [algorithm, result] of Object.entries(results)) {
      if (result.score > 0) {
        const weight = this.algorithmWeights[algorithm] || 0.5;
        totalScore += result.score * weight;
        totalWeight += weight;
      }
    }
    
    return totalWeight > 0 ? totalScore / totalWeight : 0;
  }

  /**
   * Calculate confidence level
   */
  calculateConfidence(results) {
    // Count how many algorithms found a match
    const matchingAlgorithms = Object.values(results).filter(r => r.matches).length;
    const totalAlgorithms = Object.keys(results).length;
    
    const matchRatio = matchingAlgorithms / totalAlgorithms;
    
    // Higher confidence if multiple algorithms agree
    if (matchRatio >= 0.8) return 'very_high';
    if (matchRatio >= 0.6) return 'high';
    if (matchRatio >= 0.4) return 'medium';
    if (matchRatio >= 0.2) return 'low';
    return 'very_low';
  }

  /**
   * Determine the type of match
   */
  determineMatchType(results) {
    if (results.exact.matches) return 'exact';
    if (results.cultural.matches) return 'cultural_variation';
    if (results.transposition.matches) return 'transposed';
    if (results.phonetic.matches) return 'phonetic';
    if (results.fuzzy.matches) return 'fuzzy';
    if (results.partial.matches) return 'partial';
    if (results.initials.matches) return 'initials_only';
    return 'no_match';
  }

  /**
   * Batch matching against a list
   */
  matchAgainstList(searchName, nameList, options = {}) {
    const threshold = options.threshold || 0.75;
    const matches = [];
    
    for (const targetName of nameList) {
      const result = this.match(searchName, targetName, options);
      if (result.isMatch) {
        matches.push({
          name: targetName,
          ...result
        });
      }
    }
    
    // Sort by score descending
    matches.sort((a, b) => b.score - a.score);
    
    return matches;
  }

  /**
   * Match with additional context (DOB, nationality, etc.)
   */
  contextualMatch(searchPerson, targetPerson, options = {}) {
    // Name matching
    const nameMatch = this.match(
      searchPerson.name || `${searchPerson.firstName} ${searchPerson.lastName}`,
      targetPerson.name || `${targetPerson.firstName} ${targetPerson.lastName}`,
      options
    );
    
    let contextBonus = 0;
    const contextMatches = [];
    
    // Date of birth matching
    if (searchPerson.dateOfBirth && targetPerson.dateOfBirth) {
      const dobMatch = this.compareDates(searchPerson.dateOfBirth, targetPerson.dateOfBirth);
      if (dobMatch.exact) {
        contextBonus += 0.2;
        contextMatches.push('exact_dob');
      } else if (dobMatch.yearMatch) {
        contextBonus += 0.1;
        contextMatches.push('year_match');
      }
    }
    
    // Nationality matching
    if (searchPerson.nationality && targetPerson.nationality) {
      if (searchPerson.nationality === targetPerson.nationality) {
        contextBonus += 0.1;
        contextMatches.push('nationality');
      }
    }
    
    // Address matching
    if (searchPerson.address && targetPerson.address) {
      const addressScore = this.compareAddresses(searchPerson.address, targetPerson.address);
      if (addressScore > 0.5) {
        contextBonus += 0.1 * addressScore;
        contextMatches.push('address');
      }
    }
    
    // Calculate final score with context
    const finalScore = Math.min(nameMatch.score + contextBonus, 1.0);
    
    return {
      ...nameMatch,
      score: finalScore,
      contextMatches,
      contextBonus,
      isMatch: finalScore >= (options.threshold || 0.75)
    };
  }

  /**
   * Compare dates
   */
  compareDates(date1, date2) {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    
    const exact = d1.getTime() === d2.getTime();
    const yearMatch = d1.getFullYear() === d2.getFullYear();
    const monthMatch = d1.getMonth() === d2.getMonth();
    const dayMatch = d1.getDate() === d2.getDate();
    
    return {
      exact,
      yearMatch,
      monthMatch,
      dayMatch,
      daysDifference: Math.abs(d1 - d2) / (1000 * 60 * 60 * 24)
    };
  }

  /**
   * Compare addresses
   */
  compareAddresses(addr1, addr2) {
    if (!addr1 || !addr2) return 0;
    
    const fields = ['street', 'city', 'state', 'country', 'postalCode'];
    let matchCount = 0;
    let totalFields = 0;
    
    for (const field of fields) {
      if (addr1[field] && addr2[field]) {
        totalFields++;
        if (addr1[field].toLowerCase() === addr2[field].toLowerCase()) {
          matchCount++;
        }
      }
    }
    
    return totalFields > 0 ? matchCount / totalFields : 0;
  }
}

// Export singleton instance
export const fuzzyMatcher = new FuzzyMatcher();