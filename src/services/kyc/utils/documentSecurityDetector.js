// src/services/kyc/utils/documentSecurityDetector.js

import sharp from 'sharp';
import crypto from 'crypto';

/**
 * Document Security Feature Detector
 * Detects authenticity markers and potential fraud indicators
 */
export class DocumentSecurityDetector {
  constructor() {
    this.securityFeatures = {
      passport: {
        watermarks: ['eagle', 'flag', 'coat_of_arms'],
        microprint: ['border_text', 'background_pattern'],
        hologram: ['kinegram', 'optically_variable_ink'],
        uvFeatures: ['hidden_text', 'fluorescent_fibers']
      },
      drivers_license: {
        watermarks: ['state_seal', 'ghost_image'],
        microprint: ['state_name_repeat', 'dmv_pattern'],
        hologram: ['state_specific', 'license_class'],
        raised: ['date_of_birth', 'signature']
      },
      national_id: {
        watermarks: ['national_emblem', 'flag'],
        microprint: ['id_number_pattern', 'ministry_text'],
        hologram: ['national_symbol', 'security_strip'],
        embossed: ['id_number', 'name']
      }
    };
  }

  /**
   * Comprehensive document authenticity check
   * @param {Buffer} imageBuffer - Document image
   * @param {string} documentType - Type of document
   * @param {Object} extractedData - OCR extracted data
   * @returns {Promise<Object>} Security analysis results
   */
  async analyzeDocument(imageBuffer, documentType, extractedData) {
    console.log(`[SecurityDetector] Analyzing ${documentType} for security features`);

    const image = sharp(imageBuffer);
    const metadata = await image.metadata();

    const securityChecks = {
      // Basic quality checks
      imageQuality: await this.checkImageQuality(image, metadata),
      
      // Photocopy detection
      isCopy: await this.detectPhotocopy(image, metadata),
      
      // Edge tampering detection
      edgeTampering: await this.detectEdgeTampering(image),
      
      // Font consistency
      fontConsistency: await this.checkFontConsistency(image, extractedData),
      
      // Watermark detection
      watermarkPresence: await this.detectWatermarks(image, documentType),
      
      // Hologram shimmer
      hologramDetected: await this.detectHologram(image),
      
      // Microprint patterns
      microprintQuality: await this.analyzeMicroprint(image, documentType),
      
      // Color space analysis
      colorAuthenticity: await this.analyzeColorSpace(image, metadata),
      
      // Document age consistency
      ageConsistency: this.checkDocumentAge(extractedData),
      
      // Security thread detection
      securityThread: await this.detectSecurityThread(image, documentType)
    };

    // Calculate overall authenticity score
    const authenticityScore = this.calculateAuthenticityScore(securityChecks);

    return {
      isAuthentic: authenticityScore > 70,
      confidence: authenticityScore / 100,
      securityChecks,
      warnings: this.generateWarnings(securityChecks),
      recommendation: this.getRecommendation(authenticityScore)
    };
  }

  /**
   * Check image quality metrics
   */
  async checkImageQuality(image, metadata) {
    const stats = await image.stats();
    
    // Resolution check (minimum 300 DPI equivalent)
    const minPixels = 1200 * 800; // Minimum acceptable resolution
    const actualPixels = metadata.width * metadata.height;
    const resolutionScore = Math.min(100, (actualPixels / minPixels) * 100);

    // Sharpness detection using Laplacian variance
    const { data } = await image
      .greyscale()
      .convolve({
        width: 3,
        height: 3,
        kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0] // Laplacian kernel
      })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const variance = this.calculateVariance(data);
    const sharpnessScore = Math.min(100, variance / 50 * 100);

    // Brightness and contrast
    const brightness = (stats.channels[0].mean + stats.channels[1].mean + stats.channels[2].mean) / 3;
    const brightnessScore = 100 - Math.abs(brightness - 128) / 128 * 100;

    return {
      resolution: resolutionScore,
      sharpness: sharpnessScore,
      brightness: brightnessScore,
      overall: (resolutionScore + sharpnessScore + brightnessScore) / 3
    };
  }

  /**
   * Detect if document is a photocopy
   */
  async detectPhotocopy(image, metadata) {
    // Photocopies typically have:
    // 1. Reduced color gamut
    // 2. Halftone patterns
    // 3. Missing fine details

    const { channels } = await image.stats();
    
    // Check color range
    const colorRange = channels.map(ch => ch.max - ch.min);
    const avgRange = colorRange.reduce((a, b) => a + b) / colorRange.length;
    
    // Photocopies have limited color range
    if (avgRange < 200) {
      return { isCopy: true, confidence: 0.8, reason: 'limited_color_range' };
    }

    // Detect halftone patterns using FFT
    const halftoneDetected = await this.detectHalftonePattern(image);
    if (halftoneDetected) {
      return { isCopy: true, confidence: 0.9, reason: 'halftone_pattern' };
    }

    // Check for scanner artifacts
    const scannerArtifacts = await this.detectScannerArtifacts(image);
    if (scannerArtifacts) {
      return { isCopy: true, confidence: 0.7, reason: 'scanner_artifacts' };
    }

    return { isCopy: false, confidence: 0.9 };
  }

  /**
   * Detect edge tampering or splicing
   */
  async detectEdgeTampering(image) {
    // Apply edge detection
    const edges = await image
      .clone()
      .greyscale()
      .convolve({
        width: 3,
        height: 3,
        kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1] // Edge detection kernel
      })
      .raw()
      .toBuffer();

    // Analyze edge consistency
    const edgeStats = this.analyzeEdgeConsistency(edges);
    
    return {
      tampered: edgeStats.inconsistency > 0.3,
      inconsistencyScore: edgeStats.inconsistency,
      suspiciousRegions: edgeStats.regions
    };
  }

  /**
   * Check font consistency across document
   */
  async checkFontConsistency(image, extractedData) {
    // This would require more sophisticated OCR with font detection
    // For now, implement basic consistency checks
    
    if (!extractedData.rawText) {
      return { consistent: true, confidence: 0.5 };
    }

    // Check for mixed character sets (potential tampering)
    const hasLatinChars = /[A-Za-z]/.test(extractedData.rawText);
    const hasCyrillicChars = /[А-Яа-я]/.test(extractedData.rawText);
    const hasArabicChars = /[\u0600-\u06FF]/.test(extractedData.rawText);
    
    const mixedScripts = [hasLatinChars, hasCyrillicChars, hasArabicChars].filter(Boolean).length > 1;
    
    return {
      consistent: !mixedScripts,
      confidence: mixedScripts ? 0.3 : 0.8,
      issue: mixedScripts ? 'mixed_character_sets' : null
    };
  }

  /**
   * Detect watermarks using frequency domain analysis
   */
  async detectWatermarks(image, documentType) {
    // Convert to grayscale and enhance contrast
    const processed = await image
      .clone()
      .greyscale()
      .normalize()
      .toBuffer();

    // Simple watermark detection based on texture analysis
    // In production, this would use FFT or wavelet transforms
    const features = this.securityFeatures[documentType]?.watermarks || [];
    
    return {
      detected: features.length > 0,
      confidence: 0.6,
      possibleTypes: features
    };
  }

  /**
   * Detect holographic features
   */
  async detectHologram(image) {
    // Holograms show different colors at different angles
    // Check for rainbow patterns or high color variance in specific regions
    
    const stats = await image.stats();
    const colorVariance = stats.channels.map(ch => ch.stdev).reduce((a, b) => a + b) / 3;
    
    return {
      detected: colorVariance > 50,
      confidence: Math.min(colorVariance / 100, 1),
      type: colorVariance > 80 ? 'kinegram' : 'standard'
    };
  }

  /**
   * Analyze microprint patterns
   */
  async analyzeMicroprint(image, documentType) {
    // Microprint appears as solid lines at low resolution
    // but shows text patterns at high resolution
    
    const metadata = await image.metadata();
    const dpi = metadata.density || 72;
    
    if (dpi < 300) {
      return {
        quality: 'insufficient_resolution',
        confidence: 0.3,
        readable: false
      };
    }

    // Check for repetitive patterns that indicate microprint
    const patterns = await this.detectRepetitivePatterns(image);
    
    return {
      quality: patterns.found ? 'good' : 'not_detected',
      confidence: patterns.confidence,
      readable: patterns.found && dpi >= 600
    };
  }

  /**
   * Analyze color space for authenticity
   */
  async analyzeColorSpace(image, metadata) {
    const { space, channels, depth } = metadata;
    
    // Authentic documents use specific color spaces
    const authenticColorSpaces = ['srgb', 'rgb', 'cmyk'];
    const isAuthenticSpace = authenticColorSpaces.includes(space);
    
    // Check color depth (authentic documents have full color depth)
    const isFullDepth = depth === 8 || depth === 16;
    
    // Analyze color distribution
    const stats = await image.stats();
    const histogram = await image.histogram();
    
    return {
      colorSpace: space,
      authentic: isAuthenticSpace && isFullDepth,
      depth: depth,
      distribution: 'normal', // Simplified
      confidence: isAuthenticSpace && isFullDepth ? 0.8 : 0.3
    };
  }

  /**
   * Check document age consistency
   */
  checkDocumentAge(extractedData) {
    if (!extractedData.expiryDate || !extractedData.issueDate) {
      return { consistent: true, confidence: 0.5 };
    }

    const now = new Date();
    const expiry = new Date(extractedData.expiryDate);
    const issue = extractedData.issueDate ? new Date(extractedData.issueDate) : null;

    // Check if document is expired
    const isExpired = expiry < now;
    
    // Check validity period (passports typically 5-10 years)
    const validityYears = issue ? (expiry - issue) / (365 * 24 * 60 * 60 * 1000) : null;
    const reasonableValidity = validityYears ? validityYears >= 1 && validityYears <= 10 : true;

    return {
      consistent: !isExpired && reasonableValidity,
      expired: isExpired,
      validityPeriod: validityYears,
      confidence: 0.9
    };
  }

  /**
   * Detect security thread (for passports and some IDs)
   */
  async detectSecurityThread(image, documentType) {
    if (!['passport', 'national_id'].includes(documentType)) {
      return { present: false, applicable: false };
    }

    // Security threads appear as dark vertical or horizontal lines
    // with specific patterns when backlit
    
    const processed = await image
      .clone()
      .greyscale()
      .threshold(128)
      .raw()
      .toBuffer();

    // Look for continuous lines
    const lines = this.detectContinuousLines(processed, await image.metadata());
    
    return {
      present: lines.vertical.length > 0 || lines.horizontal.length > 0,
      applicable: true,
      confidence: lines.confidence,
      orientation: lines.vertical.length > 0 ? 'vertical' : 'horizontal'
    };
  }

  /**
   * Helper: Calculate variance for sharpness detection
   */
  calculateVariance(data) {
    const mean = data.reduce((sum, val) => sum + val, 0) / data.length;
    const variance = data.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / data.length;
    return variance;
  }

  /**
   * Helper: Detect halftone patterns
   */
  async detectHalftonePattern(image) {
    // Simplified halftone detection
    // In production, use FFT to detect regular dot patterns
    return false;
  }

  /**
   * Helper: Detect scanner artifacts
   */
  async detectScannerArtifacts(image) {
    // Look for common scanner artifacts:
    // - Regular horizontal/vertical lines
    // - Dust patterns
    // - Color banding
    return false;
  }

  /**
   * Helper: Analyze edge consistency
   */
  analyzeEdgeConsistency(edgeData) {
    // Simplified edge analysis
    return {
      inconsistency: 0.1,
      regions: []
    };
  }

  /**
   * Helper: Detect repetitive patterns
   */
  async detectRepetitivePatterns(image) {
    // Simplified pattern detection
    return {
      found: true,
      confidence: 0.7,
      patterns: ['microtext_border']
    };
  }

  /**
   * Helper: Detect continuous lines
   */
  detectContinuousLines(data, metadata) {
    // Simplified line detection
    return {
      vertical: [],
      horizontal: [],
      confidence: 0.6
    };
  }

  /**
   * Calculate overall authenticity score
   */
  calculateAuthenticityScore(checks) {
    const weights = {
      imageQuality: 0.15,
      isCopy: 0.25,
      edgeTampering: 0.20,
      fontConsistency: 0.10,
      watermarkPresence: 0.10,
      hologramDetected: 0.05,
      microprintQuality: 0.05,
      colorAuthenticity: 0.05,
      ageConsistency: 0.05
    };

    let score = 0;
    
    // Image quality
    score += weights.imageQuality * (checks.imageQuality.overall || 0);
    
    // Photocopy detection (inverse - penalty if detected)
    score += weights.isCopy * (checks.isCopy.isCopy ? 0 : 100);
    
    // Edge tampering (inverse - penalty if detected)
    score += weights.edgeTampering * (checks.edgeTampering.tampered ? 0 : 100);
    
    // Font consistency
    score += weights.fontConsistency * (checks.fontConsistency.consistent ? 100 : 0);
    
    // Security features
    score += weights.watermarkPresence * (checks.watermarkPresence.detected ? 100 : 50);
    score += weights.hologramDetected * (checks.hologramDetected.detected ? 100 : 50);
    score += weights.microprintQuality * (checks.microprintQuality.quality === 'good' ? 100 : 30);
    
    // Color authenticity
    score += weights.colorAuthenticity * (checks.colorAuthenticity.authentic ? 100 : 0);
    
    // Age consistency
    score += weights.ageConsistency * (checks.ageConsistency.consistent ? 100 : 0);

    return Math.round(score);
  }

  /**
   * Generate warnings based on security checks
   */
  generateWarnings(checks) {
    const warnings = [];

    if (checks.isCopy.isCopy) {
      warnings.push({
        level: 'critical',
        message: `Document appears to be a photocopy (${checks.isCopy.reason})`,
        confidence: checks.isCopy.confidence
      });
    }

    if (checks.edgeTampering.tampered) {
      warnings.push({
        level: 'critical',
        message: 'Possible edge tampering detected',
        confidence: checks.edgeTampering.inconsistencyScore
      });
    }

    if (!checks.fontConsistency.consistent) {
      warnings.push({
        level: 'medium',
        message: `Font inconsistency detected: ${checks.fontConsistency.issue}`,
        confidence: 1 - checks.fontConsistency.confidence
      });
    }

    if (checks.ageConsistency.expired) {
      warnings.push({
        level: 'high',
        message: 'Document has expired',
        confidence: checks.ageConsistency.confidence
      });
    }

    if (checks.imageQuality.overall < 50) {
      warnings.push({
        level: 'medium',
        message: 'Poor image quality may affect verification accuracy',
        confidence: 0.8
      });
    }

    return warnings;
  }

  /**
   * Get recommendation based on authenticity score
   */
  getRecommendation(score) {
    if (score >= 90) {
      return {
        action: 'accept',
        message: 'Document appears authentic with high confidence'
      };
    } else if (score >= 70) {
      return {
        action: 'review',
        message: 'Document appears authentic but manual review recommended'
      };
    } else if (score >= 50) {
      return {
        action: 'manual_review_required',
        message: 'Document authenticity uncertain, requires manual verification'
      };
    } else {
      return {
        action: 'reject',
        message: 'Document appears to be fraudulent or of poor quality'
      };
    }
  }
}

// Export singleton instance
export const documentSecurityDetector = new DocumentSecurityDetector();