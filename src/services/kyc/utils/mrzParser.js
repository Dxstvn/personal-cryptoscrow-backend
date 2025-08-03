// src/services/kyc/utils/mrzParser.js

/**
 * MRZ (Machine Readable Zone) Parser
 * Fully compliant with ICAO 9303 standard
 */
export class MRZParser {
  constructor() {
    // Character substitution map for OCR errors
    this.substitutions = {
      '0': 'O', 'O': '0',
      '1': 'I', 'I': '1',
      '2': 'Z', 'Z': '2',
      '5': 'S', 'S': '5',
      '8': 'B', 'B': '8'
    };
  }

  /**
   * Parse MRZ lines based on document type
   * @param {string[]} lines - Array of MRZ lines
   * @returns {Object} Parsed MRZ data
   */
  parse(lines) {
    if (!lines || lines.length === 0) {
      throw new Error('No MRZ lines provided');
    }

    // Clean lines
    const cleanLines = lines.map(line => this.cleanLine(line));

    // Detect MRZ type
    const mrzType = this.detectMRZType(cleanLines);

    switch (mrzType) {
      case 'TD1':
        return this.parseTD1(cleanLines);
      case 'TD2':
        return this.parseTD2(cleanLines);
      case 'TD3':
        return this.parseTD3(cleanLines);
      default:
        throw new Error(`Unknown MRZ type: ${mrzType}`);
    }
  }

  /**
   * Clean MRZ line - remove spaces and validate characters
   */
  cleanLine(line) {
    // Remove all spaces and convert to uppercase
    let cleaned = line.replace(/\s/g, '').toUpperCase();
    
    // Replace common OCR errors
    cleaned = cleaned.split('').map(char => {
      // Only allow A-Z, 0-9, and <
      if (/[A-Z0-9<]/.test(char)) {
        return char;
      }
      // Try substitution
      return this.substitutions[char] || '<';
    }).join('');

    return cleaned;
  }

  /**
   * Detect MRZ format type
   */
  detectMRZType(lines) {
    if (lines.length === 3 && lines[0].length === 30) {
      return 'TD1'; // ID cards
    } else if (lines.length === 2 && lines[0].length === 36) {
      return 'TD2'; // Older passports/visas
    } else if (lines.length === 2 && lines[0].length === 44) {
      return 'TD3'; // Modern passports
    }
    return 'UNKNOWN';
  }

  /**
   * Parse TD3 format (Modern Passport - 2 lines x 44 chars)
   */
  parseTD3(lines) {
    if (lines.length !== 2 || lines[0].length !== 44 || lines[1].length !== 44) {
      throw new Error('Invalid TD3 format');
    }

    const line1 = lines[0];
    const line2 = lines[1];

    // Line 1 parsing
    const documentType = line1.substring(0, 2).replace(/</g, '');
    const issuingCountry = line1.substring(2, 5).replace(/</g, '');
    const names = this.parseNames(line1.substring(5, 44));
    
    // Line 2 parsing
    const documentNumber = line2.substring(0, 9).replace(/</g, '');
    const documentNumberCheck = line2.charAt(9);
    const nationality = line2.substring(10, 13).replace(/</g, '');
    const dateOfBirth = this.parseDate(line2.substring(13, 19));
    const dateOfBirthCheck = line2.charAt(19);
    const sex = line2.charAt(20);
    const expiryDate = this.parseDate(line2.substring(21, 27));
    const expiryDateCheck = line2.charAt(27);
    const personalNumber = line2.substring(28, 42).replace(/</g, '');
    const personalNumberCheck = line2.charAt(42);
    const compositeCheck = line2.charAt(43);

    // Validate check digits
    const validations = {
      documentNumber: this.validateCheckDigit(documentNumber, documentNumberCheck),
      dateOfBirth: this.validateCheckDigit(line2.substring(13, 19), dateOfBirthCheck),
      expiryDate: this.validateCheckDigit(line2.substring(21, 27), expiryDateCheck),
      personalNumber: personalNumber ? this.validateCheckDigit(personalNumber, personalNumberCheck) : true,
      composite: this.validateCompositeCheck(line2, compositeCheck)
    };

    return {
      format: 'TD3',
      documentType,
      issuingCountry,
      primaryName: names.primary,
      secondaryName: names.secondary,
      documentNumber,
      nationality,
      dateOfBirth,
      sex: this.parseSex(sex),
      expiryDate,
      personalNumber,
      validations,
      isValid: Object.values(validations).every(v => v),
      raw: lines
    };
  }

  /**
   * Parse TD1 format (ID Card - 3 lines x 30 chars)
   */
  parseTD1(lines) {
    if (lines.length !== 3 || lines.some(l => l.length !== 30)) {
      throw new Error('Invalid TD1 format');
    }

    const line1 = lines[0];
    const line2 = lines[1];
    const line3 = lines[2];

    // Line 1
    const documentType = line1.substring(0, 2).replace(/</g, '');
    const issuingCountry = line1.substring(2, 5).replace(/</g, '');
    const documentNumber = line1.substring(5, 14).replace(/</g, '');
    const documentNumberCheck = line1.charAt(14);
    const optional1 = line1.substring(15, 30).replace(/</g, '');

    // Line 2
    const dateOfBirth = this.parseDate(line2.substring(0, 6));
    const dateOfBirthCheck = line2.charAt(6);
    const sex = line2.charAt(7);
    const expiryDate = this.parseDate(line2.substring(8, 14));
    const expiryDateCheck = line2.charAt(14);
    const nationality = line2.substring(15, 18).replace(/</g, '');
    const optional2 = line2.substring(18, 29).replace(/</g, '');
    const compositeCheck = line2.charAt(29);

    // Line 3
    const names = this.parseNames(line3);

    // Validations
    const validations = {
      documentNumber: this.validateCheckDigit(documentNumber, documentNumberCheck),
      dateOfBirth: this.validateCheckDigit(line2.substring(0, 6), dateOfBirthCheck),
      expiryDate: this.validateCheckDigit(line2.substring(8, 14), expiryDateCheck),
      composite: this.validateTD1CompositeCheck(lines, compositeCheck)
    };

    return {
      format: 'TD1',
      documentType,
      issuingCountry,
      documentNumber,
      dateOfBirth,
      sex: this.parseSex(sex),
      expiryDate,
      nationality,
      primaryName: names.primary,
      secondaryName: names.secondary,
      optional: { field1: optional1, field2: optional2 },
      validations,
      isValid: Object.values(validations).every(v => v),
      raw: lines
    };
  }

  /**
   * Parse names from MRZ format
   */
  parseNames(nameField) {
    const parts = nameField.split('<<');
    const primary = parts[0].replace(/</g, ' ').trim();
    const secondary = parts.slice(1).join(' ').replace(/</g, ' ').trim();

    return {
      primary,
      secondary,
      full: secondary ? `${secondary} ${primary}` : primary
    };
  }

  /**
   * Parse MRZ date format (YYMMDD)
   */
  parseDate(dateStr) {
    if (dateStr.length !== 6) return null;
    
    const year = parseInt(dateStr.substring(0, 2));
    const month = parseInt(dateStr.substring(2, 4));
    const day = parseInt(dateStr.substring(4, 6));

    // Determine century (assume 19xx for years > 50, 20xx otherwise)
    const fullYear = year > 50 ? 1900 + year : 2000 + year;

    return {
      year: fullYear,
      month,
      day,
      formatted: `${fullYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    };
  }

  /**
   * Parse sex field
   */
  parseSex(sexChar) {
    switch (sexChar) {
      case 'M': return 'MALE';
      case 'F': return 'FEMALE';
      case '<': return 'UNSPECIFIED';
      default: return 'UNKNOWN';
    }
  }

  /**
   * Calculate check digit using ICAO 9303 algorithm
   */
  calculateCheckDigit(data) {
    const weights = [7, 3, 1];
    let sum = 0;

    for (let i = 0; i < data.length; i++) {
      const char = data.charAt(i);
      let value;

      if (char >= '0' && char <= '9') {
        value = parseInt(char);
      } else if (char >= 'A' && char <= 'Z') {
        value = char.charCodeAt(0) - 65 + 10;
      } else if (char === '<') {
        value = 0;
      } else {
        continue;
      }

      sum += value * weights[i % 3];
    }

    return sum % 10;
  }

  /**
   * Validate check digit
   */
  validateCheckDigit(data, checkDigit) {
    const calculated = this.calculateCheckDigit(data);
    return calculated === parseInt(checkDigit);
  }

  /**
   * Validate TD3 composite check digit
   */
  validateCompositeCheck(line2, checkDigit) {
    // Composite check includes: document number + check + DOB + check + expiry + check + personal + check
    const compositeData = line2.substring(0, 10) + line2.substring(13, 20) + 
                         line2.substring(21, 28) + line2.substring(28, 43);
    return this.validateCheckDigit(compositeData, checkDigit);
  }

  /**
   * Validate TD1 composite check digit
   */
  validateTD1CompositeCheck(lines, checkDigit) {
    // TD1 composite includes parts from line 1 and line 2
    const compositeData = lines[0].substring(5, 30) + lines[1].substring(0, 7) + 
                         lines[1].substring(8, 15) + lines[1].substring(18, 29);
    return this.validateCheckDigit(compositeData, checkDigit);
  }

  /**
   * Extract data into standard format
   */
  extractStandardData(parsed) {
    return {
      documentType: parsed.documentType,
      documentNumber: parsed.documentNumber,
      issuingCountry: parsed.issuingCountry,
      nationality: parsed.nationality,
      fullName: `${parsed.secondaryName} ${parsed.primaryName}`.trim(),
      firstName: parsed.secondaryName,
      lastName: parsed.primaryName,
      dateOfBirth: parsed.dateOfBirth?.formatted,
      sex: parsed.sex,
      expiryDate: parsed.expiryDate?.formatted,
      personalNumber: parsed.personalNumber,
      isValid: parsed.isValid,
      checksumValidation: parsed.validations
    };
  }
}

// Export singleton instance
export const mrzParser = new MRZParser();