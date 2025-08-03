// src/services/kyc/utils/__tests__/modelVerifier.test.js

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ModelVerifier } from '../modelVerifier.js';
import fs from 'fs';
import path from 'path';

// Mock fs module
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
    statSync: vi.fn()
  },
  existsSync: vi.fn(),
  statSync: vi.fn()
}));

describe('ModelVerifier', () => {
  let verifier;
  const mockModelsPath = '/test/models';

  beforeEach(() => {
    verifier = new ModelVerifier(mockModelsPath);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with models path and required models', () => {
      expect(verifier.modelsPath).toBe(mockModelsPath);
      expect(verifier.requiredModels).toHaveLength(4);
      expect(verifier.requiredModels[0].name).toBe('ssd_mobilenetv1');
      expect(verifier.requiredModels[1].name).toBe('face_landmark_68');
      expect(verifier.requiredModels[2].name).toBe('face_recognition');
      expect(verifier.requiredModels[3].name).toBe('face_expression');
    });

    it('should define minimum sizes for each model', () => {
      expect(verifier.requiredModels[0].minSize).toBe(5000000); // 5MB
      expect(verifier.requiredModels[1].minSize).toBe(350000);  // 350KB
      expect(verifier.requiredModels[2].minSize).toBe(6000000); // 6MB
      expect(verifier.requiredModels[3].minSize).toBe(300000);  // 300KB
    });
  });

  describe('verifyModels', () => {
    it('should verify all models are valid and not placeholders', () => {
      // Mock all files exist with proper sizes
      fs.existsSync.mockReturnValue(true);
      fs.statSync.mockImplementation((filePath) => {
        if (filePath.includes('ssd_mobilenetv1')) {
          return { size: 6000000 }; // 6MB
        } else if (filePath.includes('face_landmark_68')) {
          return { size: 400000 }; // 400KB
        } else if (filePath.includes('face_recognition')) {
          return { size: 7000000 }; // 7MB
        } else if (filePath.includes('face_expression')) {
          return { size: 350000 }; // 350KB
        }
        return { size: 1000000 }; // Default 1MB
      });

      const results = verifier.verifyModels();

      expect(results.valid).toBe(true);
      expect(results.usePlaceholders).toBe(false);
      expect(results.models.ssd_mobilenetv1.valid).toBe(true);
      expect(results.models.ssd_mobilenetv1.isPlaceholder).toBe(false);
      expect(results.models.face_landmark_68.valid).toBe(true);
      expect(results.models.face_recognition.valid).toBe(true);
      expect(results.models.face_expression.valid).toBe(true);
    });

    it('should detect placeholder models', () => {
      // Mock files exist but with small sizes (placeholders)
      fs.existsSync.mockReturnValue(true);
      fs.statSync.mockReturnValue({ size: 1000 }); // 1KB - definitely a placeholder

      const results = verifier.verifyModels();

      expect(results.valid).toBe(false);
      expect(results.usePlaceholders).toBe(true);
      expect(results.models.ssd_mobilenetv1.isPlaceholder).toBe(true);
      expect(results.models.face_landmark_68.isPlaceholder).toBe(true);
    });

    it('should handle missing models', () => {
      // Mock some files missing
      fs.existsSync.mockImplementation((filePath) => {
        // Only ssd_mobilenetv1 exists
        return filePath.includes('ssd_mobilenetv1');
      });
      fs.statSync.mockReturnValue({ size: 6000000 });

      const results = verifier.verifyModels();

      expect(results.valid).toBe(false);
      expect(results.models.ssd_mobilenetv1.valid).toBe(true);
      expect(results.models.face_landmark_68.valid).toBe(false);
      expect(results.models.face_landmark_68.exists).toBe(false);
    });
  });

  describe('verifyModel', () => {
    it('should verify valid model with correct size', () => {
      const model = {
        name: 'test_model',
        manifest: 'test_model_manifest.json',
        weights: ['test_model_shard1', 'test_model_shard2'],
        minSize: 1000000 // 1MB
      };

      fs.existsSync.mockReturnValue(true);
      fs.statSync.mockReturnValue({ size: 600000 }); // 600KB per file

      const result = verifier.verifyModel(model);

      expect(result.valid).toBe(true);
      expect(result.exists).toBe(true);
      expect(result.isPlaceholder).toBe(false);
      expect(result.size).toBe(1200000); // 1.2MB total
      expect(result.message).toContain('Model loaded successfully');
      expect(result.message).toContain('1.14 MB'); // 1200000 / 1024 / 1024 = 1.14
    });

    it('should detect placeholder model', () => {
      const model = {
        name: 'test_model',
        manifest: 'test_model_manifest.json',
        weights: ['test_model_shard1'],
        minSize: 1000000 // 1MB
      };

      fs.existsSync.mockReturnValue(true);
      fs.statSync.mockReturnValue({ size: 1000 }); // 1KB - too small

      const result = verifier.verifyModel(model);

      expect(result.valid).toBe(true);
      expect(result.exists).toBe(true);
      expect(result.isPlaceholder).toBe(true);
      expect(result.size).toBe(1000);
      expect(result.message).toContain('placeholder');
      expect(result.message).toContain('0.98 KB');
    });

    it('should handle missing manifest file', () => {
      const model = {
        name: 'test_model',
        manifest: 'test_model_manifest.json',
        weights: ['test_model_shard1'],
        minSize: 1000000
      };

      fs.existsSync.mockReturnValue(false);

      const result = verifier.verifyModel(model);

      expect(result.valid).toBe(false);
      expect(result.exists).toBe(false);
      expect(result.message).toContain('Manifest file not found');
    });

    it('should handle missing weight files', () => {
      const model = {
        name: 'test_model',
        manifest: 'test_model_manifest.json',
        weights: ['test_model_shard1', 'test_model_shard2'],
        minSize: 1000000
      };

      // Manifest exists but weight files don't
      fs.existsSync.mockImplementation((filePath) => {
        return filePath.includes('manifest');
      });

      const result = verifier.verifyModel(model);

      expect(result.valid).toBe(false);
      expect(result.exists).toBe(false);
      expect(result.message).toContain('Weight file not found');
    });

    it('should calculate total size across multiple weight files', () => {
      const model = {
        name: 'test_model',
        manifest: 'test_model_manifest.json',
        weights: ['shard1', 'shard2', 'shard3'],
        minSize: 3000000 // 3MB
      };

      fs.existsSync.mockReturnValue(true);
      let callCount = 0;
      fs.statSync.mockImplementation(() => {
        // Return different sizes for each shard
        const sizes = [1000000, 1500000, 1000000]; // 1MB, 1.5MB, 1MB
        return { size: sizes[callCount++ % sizes.length] };
      });

      const result = verifier.verifyModel(model);

      expect(result.valid).toBe(true);
      expect(result.size).toBe(3500000); // 3.5MB total
      expect(result.isPlaceholder).toBe(false);
    });
  });

  describe('getMockDetection', () => {
    it('should return mock face detection result', () => {
      const mockResult = ModelVerifier.getMockDetection();

      expect(mockResult).toHaveProperty('detection');
      expect(mockResult).toHaveProperty('landmarks');
      expect(mockResult).toHaveProperty('expressions');

      // Check detection structure
      expect(mockResult.detection._score).toBe(0.95);
      expect(mockResult.detection._classScore).toBe(0.95);
      expect(mockResult.detection._className).toBe('face');
      expect(mockResult.detection._box).toMatchObject({
        _x: 100,
        _y: 100,
        _width: 200,
        _height: 200
      });

      // Check landmarks
      expect(mockResult.landmarks._positions).toHaveLength(68);
      expect(mockResult.landmarks._positions[0]).toHaveProperty('_x');
      expect(mockResult.landmarks._positions[0]).toHaveProperty('_y');

      // Check expressions
      expect(mockResult.expressions.neutral).toBe(0.7);
      expect(mockResult.expressions.happy).toBe(0.2);
      expect(mockResult.expressions.sad).toBe(0.05);
      expect(mockResult.expressions.angry).toBe(0.02);
      expect(mockResult.expressions.fearful).toBe(0.01);
      expect(mockResult.expressions.disgusted).toBe(0.01);
      expect(mockResult.expressions.surprised).toBe(0.01);

      // Expressions should sum to approximately 1
      const sumExpressions = Object.values(mockResult.expressions).reduce((a, b) => a + b, 0);
      expect(sumExpressions).toBeCloseTo(1.0, 2);
    });

    it('should generate different landmark positions', () => {
      const mockResult = ModelVerifier.getMockDetection();
      const positions = mockResult.landmarks._positions;

      // Check that positions are not all the same
      const firstX = positions[0]._x;
      const firstY = positions[0]._y;
      const allSame = positions.every(p => p._x === firstX && p._y === firstY);

      expect(allSame).toBe(false);
    });
  });

  describe('getMockLivenessResult', () => {
    it('should return mock liveness result', () => {
      const mockResult = ModelVerifier.getMockLivenessResult();

      expect(mockResult.isLive).toBe(true);
      expect(mockResult.confidence).toBe(0.85);
      expect(mockResult.frameCount).toBe(5);

      // Check all checks are present
      expect(mockResult.checks).toHaveProperty('blinkDetected');
      expect(mockResult.checks).toHaveProperty('movementDetected');
      expect(mockResult.checks).toHaveProperty('expressionChanges');
      expect(mockResult.checks).toHaveProperty('depth3D');
      expect(mockResult.checks).toHaveProperty('textureAnalysis');
      expect(mockResult.checks).toHaveProperty('consistencyScore');
      expect(mockResult.checks).toHaveProperty('antiSpoofing');

      // Check blink detection
      expect(mockResult.checks.blinkDetected).toMatchObject({
        detected: true,
        count: 2,
        confidence: 0.9
      });

      // Check movement detection
      expect(mockResult.checks.movementDetected).toMatchObject({
        detected: true,
        averageDistance: 15,
        significantCount: 3,
        confidence: 0.8
      });

      // Check expression changes
      expect(mockResult.checks.expressionChanges.detected).toBe(true);
      expect(mockResult.checks.expressionChanges.changes).toHaveLength(2);
      expect(mockResult.checks.expressionChanges.averageChange).toBe(0.35);

      // Check 3D depth
      expect(mockResult.checks.depth3D).toMatchObject({
        score: 0.9,
        confidence: 0.7,
        is3D: true
      });

      // Check texture analysis
      expect(mockResult.checks.textureAnalysis).toMatchObject({
        score: 0.85,
        screenDetected: false,
        paperDetected: false,
        confidence: 0.6
      });

      // Check anti-spoofing
      expect(mockResult.checks.antiSpoofing).toMatchObject({
        staticImage: true,
        videoReplay: true,
        maskDetected: false,
        lightingConsistent: true,
        antiSpoofScore: 0.9
      });

      // Check recommendation
      expect(mockResult.recommendation).toMatchObject({
        action: 'accept',
        message: expect.stringContaining('mock detection')
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle empty weights array', () => {
      const model = {
        name: 'test_model',
        manifest: 'test_model_manifest.json',
        weights: [],
        minSize: 1000000
      };

      fs.existsSync.mockImplementation((filePath) => {
        return filePath.includes('manifest');
      });

      const result = verifier.verifyModel(model);

      expect(result.valid).toBe(true);
      expect(result.size).toBe(0);
      expect(result.isPlaceholder).toBe(true);
    });

    it('should handle very large model files', () => {
      const model = {
        name: 'large_model',
        manifest: 'large_model_manifest.json',
        weights: ['large_shard1', 'large_shard2'],
        minSize: 50000000 // 50MB
      };

      fs.existsSync.mockReturnValue(true);
      fs.statSync.mockReturnValue({ size: 30000000 }); // 30MB per file

      const result = verifier.verifyModel(model);

      expect(result.valid).toBe(true);
      expect(result.size).toBe(60000000); // 60MB total
      expect(result.isPlaceholder).toBe(false);
      expect(result.message).toContain('57.22 MB');
    });

    it('should handle model at exact minimum size', () => {
      const model = {
        name: 'exact_model',
        manifest: 'exact_model_manifest.json',
        weights: ['exact_shard1'],
        minSize: 1000000 // 1MB
      };

      fs.existsSync.mockReturnValue(true);
      fs.statSync.mockReturnValue({ size: 1000000 }); // Exactly 1MB

      const result = verifier.verifyModel(model);

      expect(result.valid).toBe(true);
      expect(result.isPlaceholder).toBe(false);
    });
  });

  describe('Console output', () => {
    it('should log success message when all models are valid', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      fs.existsSync.mockReturnValue(true);
      fs.statSync.mockReturnValue({ size: 10000000 }); // 10MB

      verifier.verifyModels();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Checking face-api.js models'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('✅ All models verified and ready'));

      consoleSpy.mockRestore();
    });

    it('should log warning when using placeholders', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      fs.existsSync.mockReturnValue(true);
      fs.statSync.mockReturnValue({ size: 1000 }); // 1KB - placeholder

      verifier.verifyModels();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Using placeholder models'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Download real models from'));

      consoleSpy.mockRestore();
    });
  });
});