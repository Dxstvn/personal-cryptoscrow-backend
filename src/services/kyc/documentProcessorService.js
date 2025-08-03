// src/services/kyc/documentProcessorService.js

import Tesseract from 'tesseract.js';
import crypto from 'crypto';
import { getStorage } from 'firebase-admin/storage';
import { getAdminApp } from '../../api/routes/auth/admin.js';

/**
 * Document Processing Service
 * Handles OCR, document validation, and data extraction
 */
export class DocumentProcessorService {
  constructor() {
    this.worker = null;
    this.storage = null;
    this.initialized = false;
  }

  /**
   * Initialize Tesseract worker and storage
   */
  async initialize() {
    if (this.initialized) return;

    try {
      // Initialize Tesseract worker
      // In test environments, skip the logger to avoid worker thread issues
      const isTest = process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'e2e_test';
      
      const workerOptions = isTest 
        ? {} // No logger in test environment
        : { logger: m => console.log('[Tesseract]', m.status, m.progress) };
      
      this.worker = await Tesseract.createWorker(workerOptions);
      
      await this.worker.loadLanguage('eng');
      await this.worker.initialize('eng');
      
      // Initialize Firebase Storage
      const adminApp = await getAdminApp();
      this.storage = getStorage(adminApp);
      
      this.initialized = true;
      console.log('[DocumentProcessor] Service initialized');
    } catch (error) {
      console.error('[DocumentProcessor] Initialization error:', error);
      throw error;
    }
  }

  /**
   * Process identity document (passport, driver's license, ID card)
   * @param {Buffer} imageBuffer - Image data
   * @param {string} documentType - Type of document
   * @returns {Promise<Object>} Extracted data
   */
  async processIdentityDocument(imageBuffer, documentType) {
    try {
      await this.initialize();

      // Validate document type first
      const validTypes = ['passport', 'drivers_license', 'national_id'];
      if (!validTypes.includes(documentType)) {
        throw new Error(`Unsupported document type: ${documentType}`);
      }

      // Preprocess image
      const processedImage = await this.preprocessImage(imageBuffer);
      
      // Perform OCR
      const { data: { text, confidence } } = await this.worker.recognize(processedImage);
      
      console.log(`[DocumentProcessor] OCR confidence: ${confidence}%`);
      
      // Check confidence threshold
      if (confidence < 50) {
        throw new Error('Document quality too low');
      }
      
      // Extract structured data based on document type
      let extractedData = {};
      
      switch (documentType) {
        case 'passport':
          extractedData = await this.extractPassportData(text);
          break;
        case 'drivers_license':
          extractedData = await this.extractDriversLicenseData(text);
          break;
        case 'national_id':
          extractedData = await this.extractNationalIdData(text);
          break;
      }
      
      // Validate extracted data
      const validation = this.validateExtractedData(extractedData, documentType);
      
      // Check document authenticity
      const authenticity = await this.verifyDocumentAuthenticity({
        text,
        confidence,
        extractedData,
        mrzData: extractedData.mrz ? { checksumValid: true } : null
      });
      
      // Extract MRZ data if available
      const mrzData = extractedData.mrz ? this.parseMRZ(extractedData.mrz.split('\n')) : null;
      
      return {
        documentType,
        extractedData,
        confidence,
        validation,
        authenticity,
        mrzData,
        rawText: text
      };
    } catch (error) {
      console.error('[DocumentProcessor] Error processing identity document:', error);
      throw error;
    }
  }

  /**
   * Extract passport data including MRZ
   * @param {string} text - OCR text
   */
  async extractPassportData(text) {
    const data = {
      documentNumber: null,
      fullName: null,
      dateOfBirth: null,
      expiryDate: null,
      nationality: null,
      mrz: null
    };

    // Look for MRZ pattern (2 lines of 44 characters each)
    const mrzPattern = /^[A-Z0-9<]{44}$/gm;
    const mrzLines = text.match(mrzPattern);
    
    if (mrzLines && mrzLines.length >= 2) {
      data.mrz = mrzLines.join('\n');
      
      // Parse MRZ according to ICAO 9303 standard
      const mrzData = this.parseMRZ(mrzLines);
      Object.assign(data, mrzData);
    } else {
      // Fallback to pattern matching for non-MRZ extraction
      
      // Document number patterns
      const docNumPattern = /(?:passport|document|no\.?)\s*[:.]?\s*([A-Z0-9]{6,9})/i;
      const docNumMatch = text.match(docNumPattern);
      if (docNumMatch) data.documentNumber = docNumMatch[1];
      
      // Name patterns
      const namePattern = /(?:name|surname|given\s*names?)\s*[:.]?\s*([A-Z][a-zA-Z\s'-]+)/i;
      const nameMatch = text.match(namePattern);
      if (nameMatch) data.fullName = nameMatch[1].trim();
      
      // Date patterns (DD/MM/YYYY or DD-MM-YYYY)
      const datePattern = /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/g;
      const dates = text.match(datePattern);
      if (dates && dates.length >= 2) {
        // Assume first date is DOB, second is expiry
        data.dateOfBirth = this.standardizeDate(dates[0]);
        data.expiryDate = this.standardizeDate(dates[1]);
      }
      
      // Nationality
      const nationalityPattern = /(?:nationality|country)\s*[:.]?\s*([A-Z][a-zA-Z\s]+)/i;
      const nationalityMatch = text.match(nationalityPattern);
      if (nationalityMatch) data.nationality = nationalityMatch[1].trim();
    }
    
    return data;
  }

  /**
   * Extract driver's license data
   * @param {string} text - OCR text
   */
  async extractDriversLicenseData(text) {
    const data = {
      documentNumber: null,
      fullName: null,
      dateOfBirth: null,
      expiryDate: null,
      address: null,
      licenseClass: null
    };

    // License number pattern (varies by country/state)
    const licensePattern = /(?:DL|license|no\.?)\s*[:.]?\s*([A-Z0-9]{5,20})/i;
    const licenseMatch = text.match(licensePattern);
    if (licenseMatch) data.documentNumber = licenseMatch[1];

    // Name extraction - stop at newline
    const namePattern = /(?:name|full\s*name)\s*[:.]?\s*([A-Z][a-zA-Z\s'-]+?)(?:\n|$)/i;
    const nameMatch = text.match(namePattern);
    if (nameMatch) data.fullName = nameMatch[1].trim();

    // DOB pattern
    const dobPattern = /(?:DOB|date\s*of\s*birth|born)\s*[:.]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/i;
    const dobMatch = text.match(dobPattern);
    if (dobMatch) data.dateOfBirth = this.standardizeDate(dobMatch[1]);

    // Expiry pattern
    const expiryPattern = /(?:exp|expires?|expiry)\s*[:.]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/i;
    const expiryMatch = text.match(expiryPattern);
    if (expiryMatch) data.expiryDate = this.standardizeDate(expiryMatch[1]);

    // Address extraction (multi-line)
    const addressPattern = /(?:address|addr)\s*[:.]?\s*([^\n]+(?:\n[^\n]+)?)/i;
    const addressMatch = text.match(addressPattern);
    if (addressMatch) data.address = addressMatch[1].trim().replace(/\n/g, ', ');

    // License class
    const classPattern = /(?:class|category)\s*[:.]?\s*([A-Z][A-Z0-9]*)/i;
    const classMatch = text.match(classPattern);
    if (classMatch) data.licenseClass = classMatch[1];

    return data;
  }

  /**
   * Extract national ID data
   * @param {string} text - OCR text
   */
  async extractNationalIdData(text) {
    const data = {
      documentNumber: null,
      fullName: null,
      dateOfBirth: null,
      expiryDate: null,
      nationality: null,
      idNumber: null
    };

    // ID number pattern - look for ID NO: or ID: specifically, avoid IDENTITY
    const idPattern = /(?:ID\s*NO:|identification\s*no\.?:)\s*([A-Z0-9-]{5,20})/i;
    const idMatch = text.match(idPattern);
    if (idMatch) {
      data.documentNumber = idMatch[1];
    }

    // National ID number (SSN-like)
    const ninPattern = /\b(\d{3}-?\d{2}-?\d{4})\b/;
    const ninMatch = text.match(ninPattern);
    if (ninMatch) data.idNumber = ninMatch[1];

    // Extract other fields similar to passport - stop at newline
    const namePattern = /(?:name|full\s*name)\s*[:.]?\s*([A-Z][a-zA-Z\s'-]+?)(?:\n|$)/i;
    const nameMatch = text.match(namePattern);
    if (nameMatch) data.fullName = nameMatch[1].trim();

    const dobPattern = /(?:DOB|date\s*of\s*birth|born)\s*[:.]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/i;
    const dobMatch = text.match(dobPattern);
    if (dobMatch) data.dateOfBirth = this.standardizeDate(dobMatch[1]);

    // Expiry date pattern for VALID UNTIL
    const validUntilPattern = /(?:valid\s*until|expires?)\s*[:.]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/i;
    const validUntilMatch = text.match(validUntilPattern);
    if (validUntilMatch) data.expiryDate = this.standardizeDate(validUntilMatch[1]);

    return data;
  }

  /**
   * Parse Machine Readable Zone (MRZ) data
   * @param {string[]} mrzLines - MRZ lines
   */
  parseMRZ(mrzLines) {
    if (!mrzLines || mrzLines.length < 2) return {};

    const line1 = mrzLines[0];
    const line2 = mrzLines[1];

    // Parse according to TD3 format (passports)
    const data = {
      documentType: line1.substring(0, 2).replace(/</g, ''),
      issuingCountry: line1.substring(2, 5).replace(/</g, ''),
      lastName: line1.substring(5, 44).split('<<')[0].replace(/</g, ' ').trim(),
      firstName: line1.substring(5, 44).split('<<')[1]?.replace(/</g, ' ').trim() || '',
      documentNumber: line2.substring(0, 9).replace(/</g, ''),
      nationality: line2.substring(10, 13).replace(/</g, ''),
      dateOfBirth: this.parseMRZDate(line2.substring(13, 19)),
      sex: line2.substring(20, 21),
      expiryDate: this.parseMRZDate(line2.substring(21, 27))
    };

    data.fullName = `${data.firstName} ${data.lastName}`.trim();

    return data;
  }

  /**
   * Parse MRZ date format (YYMMDD)
   */
  parseMRZDate(dateStr) {
    if (!dateStr || dateStr.length !== 6) return null;

    const year = parseInt(dateStr.substring(0, 2));
    const month = dateStr.substring(2, 4);
    const day = dateStr.substring(4, 6);

    // Determine century (assume 2000s for years 00-30, 1900s for 31-99)
    const fullYear = year <= 30 ? 2000 + year : 1900 + year;

    return `${fullYear}-${month}-${day}`;
  }

  /**
   * Standardize date format to YYYY-MM-DD
   */
  standardizeDate(dateStr) {
    if (!dateStr) return null;

    // Replace separators with dashes
    dateStr = dateStr.replace(/[\/\.]/g, '-');

    // Parse different formats
    const parts = dateStr.split('-');
    if (parts.length !== 3) return null;

    let day, month, year;

    // Assume DD-MM-YYYY or MM-DD-YYYY based on values
    if (parseInt(parts[0]) > 12) {
      // DD-MM-YYYY
      [day, month, year] = parts;
    } else if (parseInt(parts[1]) > 12) {
      // MM-DD-YYYY
      [month, day, year] = parts;
    } else {
      // Default to DD-MM-YYYY
      [day, month, year] = parts;
    }

    // Ensure 4-digit year
    if (year.length === 2) {
      year = parseInt(year) <= 30 ? '20' + year : '19' + year;
    }

    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  /**
   * Validate extracted data
   */
  validateExtractedData(data, documentType) {
    const validation = {
      isValid: true,
      errors: [],
      warnings: []
    };

    // Check required fields
    const requiredFields = {
      passport: ['documentNumber', 'fullName', 'dateOfBirth', 'expiryDate'],
      drivers_license: ['documentNumber', 'fullName', 'dateOfBirth', 'expiryDate'],
      national_id: ['documentNumber', 'fullName', 'dateOfBirth']
    };

    const required = requiredFields[documentType] || [];
    for (const field of required) {
      if (!data[field]) {
        validation.errors.push(`Missing required field: ${field}`);
        validation.isValid = false;
      }
    }

    // Validate dates
    if (data.dateOfBirth) {
      const dob = new Date(data.dateOfBirth);
      const age = (new Date() - dob) / (365.25 * 24 * 60 * 60 * 1000);
      
      if (age < 18) {
        validation.errors.push('User must be at least 18 years old');
        validation.isValid = false;
      }
      
      if (age > 120) {
        validation.warnings.push('Unusually old date of birth');
      }
    }

    if (data.expiryDate) {
      const expiry = new Date(data.expiryDate);
      if (expiry < new Date()) {
        validation.errors.push('Document has expired');
        validation.isValid = false;
      }
    }

    // Validate document number format
    if (data.documentNumber) {
      if (data.documentNumber.length < 5 || data.documentNumber.length > 20) {
        validation.warnings.push('Unusual document number length');
      }
    }

    return validation;
  }

  /**
   * Verify document authenticity (basic checks)
   */
  async verifyDocumentAuthenticity(documentData) {
    const authenticity = {
      isAuthentic: true,
      confidence: 0,
      checks: {
        textClarity: true,
        formatConsistency: true,
        securityFeatures: true,
        dataValidation: true
      },
      issues: []
    };

    try {
      // Check text clarity
      if (documentData.confidence) {
        authenticity.checks.textClarity = documentData.confidence >= 70;
        if (!authenticity.checks.textClarity) {
          authenticity.issues.push('Low OCR confidence');
        }
      }

      // Check format consistency
      if (documentData.text) {
        const suspiciousPatterns = /fake|counterfeit|test|sample/i;
        if (suspiciousPatterns.test(documentData.text)) {
          authenticity.checks.formatConsistency = false;
          authenticity.isAuthentic = false;
          authenticity.issues.push('Suspicious text patterns detected');
        }
      }

      // Check MRZ validity for passports
      if (documentData.mrzData && documentData.mrzData.checksumValid !== undefined) {
        authenticity.checks.securityFeatures = documentData.mrzData.checksumValid;
        if (!documentData.mrzData.checksumValid) {
          authenticity.issues.push('Invalid MRZ checksum');
        }
      }

      // Check data validation
      if (documentData.extractedData) {
        // Check if document is expired
        if (documentData.extractedData.expiryDate) {
          const expiryDate = new Date(documentData.extractedData.expiryDate);
          if (expiryDate < new Date()) {
            authenticity.checks.dataValidation = false;
            authenticity.isAuthentic = false;
            authenticity.issues.push('Document expired');
          }
        }
      }

      // Calculate confidence score
      const passedChecks = Object.values(authenticity.checks).filter(v => v).length;
      const totalChecks = Object.keys(authenticity.checks).length;
      authenticity.confidence = (passedChecks / totalChecks);

      // Set isAuthentic based on confidence
      if (authenticity.confidence < 0.75) {
        authenticity.isAuthentic = false;
      }

    } catch (error) {
      console.error('[DocumentProcessor] Error verifying authenticity:', error);
      authenticity.isAuthentic = false;
      authenticity.confidence = 0;
    }

    return authenticity;
  }

  /**
   * Validate MRZ checksum
   */
  validateMRZChecksum(mrz) {
    // TODO: Implement ICAO 9303 checksum validation
    // For now, return true
    return true;
  }

  /**
   * Process address proof document
   */
  async processAddressProof(imageBuffer, documentType) {
    try {
      await this.initialize();

      const { data: { text, confidence } } = await this.worker.recognize(imageBuffer);
      
      const extractedData = {
        documentType,
        address: null,
        name: null,
        date: null,
        accountNumber: null
      };

      // Extract name first (before address)
      const namePattern = /(?:bill\s*to|account\s*holder|customer|name)\s*[:.]?\s*([A-Z][a-zA-Z\s'-]+?)(?:\n|$)/i;
      const nameMatch = text.match(namePattern);
      if (nameMatch) {
        extractedData.name = nameMatch[1].trim();
      }

      // Extract address (multi-line) - look for specific patterns
      const addressPattern = /(?:bill\s*to:?[\s\S]*?)(\d+\s+[A-Z][a-zA-Z\s]+(?:\n[A-Z][a-zA-Z\s,]+)?(?:\n[A-Z][a-zA-Z,\s]+\d{5})?)/i;
      const addressMatch = text.match(addressPattern);
      if (addressMatch) {
        extractedData.address = addressMatch[1].trim().replace(/\s+/g, ' ');
      }

      // Extract account number
      const accountPattern = /(?:account|acct\.?)\s*(?:no\.?|number)?\s*[:.]?\s*([0-9]{5,})/i;
      const accountMatch = text.match(accountPattern);
      if (accountMatch) {
        extractedData.accountNumber = accountMatch[1];
      }

      // Extract date
      const datePattern = /(?:bill\s*date|issued|statement\s*date)\s*[:.]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/i;
      const dateMatch = text.match(datePattern);
      if (dateMatch) {
        extractedData.issueDate = this.standardizeDate(dateMatch[1]);
        extractedData.date = extractedData.issueDate; // Keep backward compatibility
      }

      // Validate recency (must be within 3 months)
      const validation = {
        isValid: true,
        errors: [],
        warnings: []
      };

      const isValid = true;
      const issues = [];

      if (extractedData.date) {
        const docDate = new Date(extractedData.date);
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
        
        if (docDate < threeMonthsAgo) {
          validation.errors.push('Document is older than 3 months');
          validation.isValid = false;
          issues.push('Document too old');
        }
      } else {
        validation.warnings.push('Could not extract document date');
      }

      return {
        documentType,
        extractedData,
        confidence,
        validation,
        isValid: validation.isValid,
        issues,
        rawText: text
      };
    } catch (error) {
      console.error('[DocumentProcessor] Error processing address proof:', error);
      throw error;
    }
  }

  /**
   * Preprocess image for better OCR results
   */
  async preprocessImage(imageBuffer) {
    try {
      // Dynamic import to avoid issues during initialization
      const { createCanvas, loadImage } = await import('canvas');
      
      // Create canvas and enhance image
      const img = await loadImage(imageBuffer);
      const canvas = createCanvas(img.width, img.height);
      const ctx = canvas.getContext('2d');
      
      // Apply image enhancements
      ctx.filter = 'contrast(1.2) brightness(1.1)';
      ctx.drawImage(img, 0, 0);
      
      // Convert to buffer
      return canvas.toBuffer('image/png');
    } catch (error) {
      console.warn('[DocumentProcessor] Image preprocessing failed, using original:', error.message);
      // Return original buffer if preprocessing fails
      return imageBuffer;
    }
  }

  /**
   * Clean up resources
   */
  async cleanup() {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
    }
    this.initialized = false;
  }
}

// Export singleton instance
export const documentProcessor = new DocumentProcessorService();