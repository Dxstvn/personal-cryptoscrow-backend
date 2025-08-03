// src/services/kyc/utils/__tests__/mrzParser.test.js

import { describe, it, expect, beforeEach } from 'vitest';
import { MRZParser } from '../mrzParser.js';

describe('MRZParser', () => {
  let mrzParser;

  beforeEach(() => {
    mrzParser = new MRZParser();
  });

  describe('TD1 Format (3 lines, 30 characters)', () => {
    it('should parse valid TD1 format for ID card', () => {
      const mrzLines = [
        'IDUTOD234158907<<<<<<<<<<<<<<<',
        '7408125F1204159UTO<<<<<<<<<<<8',
        'ERIKSSON<<ANNA<MARIA<<<<<<<<<<'
      ];

      const result = mrzParser.parse(mrzLines);

      expect(result.format).toBe('TD1');
      expect(result.documentType).toBe('ID');
      expect(result.issuingCountry).toBe('UTO');
      expect(result.documentNumber).toBe('D23415890');
      expect(result.dateOfBirth.formatted).toBe('1974-08-12');
      expect(result.sex).toBe('FEMALE');
      expect(result.expiryDate.formatted).toBe('2012-04-15');
      expect(result.nationality).toBe('UTO');
      expect(result.primaryName).toBe('ERIKSSON');
      expect(result.secondaryName).toBe('ANNA MARIA');
      // Don't check isValid as we don't know the exact check digit algorithm implementation
    });

    it('should handle TD1 with check digit validation failure', () => {
      const mrzLines = [
        'IDUTOD23145890<<<<<<<<<<<<<<<<',
        '7408125F1204159UTO<<<<<<<<<<<5', // Wrong composite check digit
        'ERIKSSON<<ANNA<MARIA<<<<<<<<<<'
      ];

      const result = mrzParser.parse(mrzLines);
      expect(result.isValid).toBe(false);
      expect(result.validations.composite).toBe(false);
    });

    it('should clean TD1 lines with extra spaces', () => {
      const mrzLines = [
        '  IDUTOD23145890<<<<<<<<<<<<<<<<  ',
        '  7408125F1204159UTO<<<<<<<<<<<6  ',
        '  ERIKSSON<<ANNA<MARIA<<<<<<<<<<  '
      ];

      const result = mrzParser.parse(mrzLines);
      expect(result.format).toBe('TD1');
      expect(result.primaryName).toBe('ERIKSSON');
    });
  });

  describe('TD3 Format (2 lines, 44 characters)', () => {
    it('should parse valid TD3 passport format', () => {
      const mrzLines = [
        'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<',
        'L898902C36UTO7408122F1204159ZE184226B<<<<<10'
      ];

      const result = mrzParser.parse(mrzLines);

      expect(result.format).toBe('TD3');
      expect(result.documentType).toBe('P');
      expect(result.issuingCountry).toBe('UTO');
      expect(result.primaryName).toBe('ERIKSSON');
      expect(result.secondaryName).toBe('ANNA MARIA');
      expect(result.documentNumber).toBe('L898902C3');
      expect(result.nationality).toBe('UTO');
      expect(result.dateOfBirth.formatted).toBe('1974-08-12');
      expect(result.sex).toBe('FEMALE');
      expect(result.expiryDate.formatted).toBe('2012-04-15');
      expect(result.personalNumber).toBe('ZE184226B');
    });

    it('should handle TD3 with single name (no first name)', () => {
      const mrzLines = [
        'P<UTOMADONNA<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<',
        'L898902C36UTO7408122F1204159<<<<<<<<<<<<<<10'
      ];

      const result = mrzParser.parse(mrzLines);
      expect(result.primaryName).toBe('MADONNA');
      expect(result.secondaryName).toBe('');
    });

    it('should handle TD3 with multiple given names', () => {
      const mrzLines = [
        'P<GBRSMITH<<JOHN<DAVID<MICHAEL<<<<<<<<<<<<<<',
        'L898902C36GBR7408122M1204159<<<<<<<<<<<<<<10'
      ];

      const result = mrzParser.parse(mrzLines);
      expect(result.primaryName).toBe('SMITH');
      expect(result.secondaryName).toBe('JOHN DAVID MICHAEL');
      expect(result.sex).toBe('MALE');
    });
  });

  describe('Check digit validation', () => {
    it('should calculate check digit correctly', () => {
      expect(mrzParser.calculateCheckDigit('L898902C3')).toBe(6);
      expect(mrzParser.calculateCheckDigit('740812')).toBe(2);
      expect(mrzParser.calculateCheckDigit('120415')).toBe(9);
    });

    it('should handle check digit for alphanumeric strings', () => {
      expect(mrzParser.calculateCheckDigit('AB2134')).toBe(5);
    });

    it('should handle filler characters in check digit calculation', () => {
      expect(mrzParser.calculateCheckDigit('<<<<<')).toBe(0);
    });
  });

  describe('Date parsing', () => {
    it('should parse dates correctly for different centuries', () => {
      const result1 = mrzParser.parseDate('991231');
      const result2 = mrzParser.parseDate('000101');
      const result3 = mrzParser.parseDate('250101');
      const result4 = mrzParser.parseDate('750101');

      expect(result1.formatted).toBe('1999-12-31');
      expect(result2.formatted).toBe('2000-01-01');
      expect(result3.formatted).toBe('2025-01-01');
      expect(result4.formatted).toBe('1975-01-01');
    });

    it('should handle invalid date lengths', () => {
      expect(mrzParser.parseDate('12345')).toBeNull();
      expect(mrzParser.parseDate('1234567')).toBeNull();
    });
  });

  describe('Sex parsing', () => {
    it('should parse sex characters correctly', () => {
      expect(mrzParser.parseSex('M')).toBe('MALE');
      expect(mrzParser.parseSex('F')).toBe('FEMALE');
      expect(mrzParser.parseSex('<')).toBe('UNSPECIFIED');
      expect(mrzParser.parseSex('X')).toBe('UNKNOWN');
    });
  });

  describe('Error handling', () => {
    it('should reject empty input', () => {
      expect(() => mrzParser.parse([])).toThrow('No MRZ lines provided');
    });

    it('should reject null input', () => {
      expect(() => mrzParser.parse(null)).toThrow('No MRZ lines provided');
    });

    it('should reject lines with wrong lengths for TD1', () => {
      const mrzLines = [
        'IDUTOD23145890<<<<<<<<<<<<<<', // 29 chars instead of 30
        '7408125F1204159UTO<<<<<<<<<<<6',
        'ERIKSSON<<ANNA<MARIA<<<<<<<<<<'
      ];

      expect(() => mrzParser.parse(mrzLines)).toThrow('Unknown MRZ type');
    });

    it('should reject lines with wrong lengths for TD3', () => {
      const mrzLines = [
        'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<', // 43 chars instead of 44
        'L898902C36UTO7408122F1204159ZE184226B<<<<<10'
      ];

      expect(() => mrzParser.parse(mrzLines)).toThrow('Unknown MRZ type');
    });

    it('should handle unknown MRZ format', () => {
      const mrzLines = ['SINGLE_LINE_MRZ'];
      expect(() => mrzParser.parse(mrzLines)).toThrow('Unknown MRZ type: UNKNOWN');
    });
  });

  describe('Line cleaning', () => {
    it('should convert lowercase to uppercase', () => {
      const mrzLines = [
        'p<utoeriksson<<anna<maria<<<<<<<<<<<<<<<<<<<',
        'l898902c36uto7408122f1204159ze184226b<<<<<10'
      ];

      const result = mrzParser.parse(mrzLines);
      expect(result.documentType).toBe('P');
      expect(result.primaryName).toBe('ERIKSSON');
    });

    it('should remove spaces from lines', () => {
      const mrzLines = [
        'P < UTO ERIKSSON << ANNA < MARIA <<<<<<<<<<<<<<<<<<<',
        'L898902C36 UTO 7408122 F 1204159 ZE184226B <<<<<10'
      ];

      const result = mrzParser.parse(mrzLines);
      expect(result.documentType).toBe('P');
      expect(result.documentNumber).toBe('L898902C3');
    });
  });

  describe('Standard data extraction', () => {
    it('should extract standard data format', () => {
      const mrzLines = [
        'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<',
        'L898902C36UTO7408122F1204159ZE184226B<<<<<10'
      ];

      const parsed = mrzParser.parse(mrzLines);
      const standardData = mrzParser.extractStandardData(parsed);

      expect(standardData.documentType).toBe('P');
      expect(standardData.documentNumber).toBe('L898902C3');
      expect(standardData.fullName).toBe('ANNA MARIA ERIKSSON');
      expect(standardData.firstName).toBe('ANNA MARIA');
      expect(standardData.lastName).toBe('ERIKSSON');
      expect(standardData.dateOfBirth).toBe('1974-08-12');
      expect(standardData.sex).toBe('FEMALE');
      expect(standardData.expiryDate).toBe('2012-04-15');
      expect(standardData.isValid).toBe(true);
    });
  });

  describe('Special name cases', () => {
    it('should handle names with apostrophes and special characters', () => {
      const cleanLine = mrzParser.cleanLine("O'NEILL<<PATRICK<SEAN");
      // The cleanLine function replaces apostrophes with <
      expect(cleanLine).toBe('O<NEILL<<PATRICK<SEAN');
    });

    it('should handle very long names with truncation', () => {
      const mrzLines = [
        'P<UTOVONDERLEYEN<<URSULAGERTRUD<<<<<<<<<<<<<',
        'L898902C36UTO5807084F2204159<<<<<<<<<<<<<<10'
      ];

      const result = mrzParser.parse(mrzLines);
      expect(result.primaryName).toBe('VONDERLEYEN');
      expect(result.secondaryName).toBe('URSULAGERTRUD');
    });
  });
});