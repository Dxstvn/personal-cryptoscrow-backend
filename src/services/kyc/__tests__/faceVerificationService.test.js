// src/services/kyc/__tests__/faceVerificationService.test.js

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FaceVerificationService } from '../faceVerificationService.js';

// Mock @vladmandic/human
vi.mock('@vladmandic/human', () => {
  const mockDetect = vi.fn();
  const mockMatch = vi.fn();
  const mockLoad = vi.fn();
  const mockWarmup = vi.fn();
  
  class MockHuman {
    constructor(config) {
      this.config = config;
      this.detect = mockDetect;
      this.match = mockMatch;
      this.load = mockLoad;
      this.warmup = mockWarmup;
      this.tf = {
        getBackend: vi.fn(() => 'wasm')
      };
      this.models = ['face', 'emotion', 'age', 'gender'];
    }
  }
  
  // Store mock functions globally for test access
  global.mockDetect = mockDetect;
  global.mockMatch = mockMatch;
  global.mockLoad = mockLoad;
  global.mockWarmup = mockWarmup;
  
  return {
    Human: MockHuman
  };
});

// Mock TensorFlow.js
vi.mock('@tensorflow/tfjs-node', () => ({}));

// Mock canvas
vi.mock('canvas', () => ({
  createCanvas: vi.fn(() => ({
    getContext: vi.fn(() => ({
      drawImage: vi.fn()
    })),
    width: 640,
    height: 480
  })),
  loadImage: vi.fn(() => ({
    width: 640,
    height: 480
  }))
}));

// Mock liveness detector
vi.mock('../utils/livenessDetector.js', () => ({
  livenessDetector: {
    detectLiveness: vi.fn()
  }
}));

describe('FaceVerificationService', () => {
  let faceService;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Setup default mock responses
    global.mockLoad.mockResolvedValue();
    global.mockWarmup.mockResolvedValue();
    
    faceService = new FaceVerificationService();
  });

  describe('initialize', () => {
    it('should initialize Human library successfully', async () => {
      await faceService.initialize();
      
      expect(faceService.initialized).toBe(true);
      expect(faceService.human).toBeDefined();
      expect(global.mockLoad).toHaveBeenCalled();
      expect(global.mockWarmup).toHaveBeenCalled();
    });

    it('should not reinitialize if already initialized', async () => {
      await faceService.initialize();
      global.mockLoad.mockClear();
      
      await faceService.initialize();
      
      expect(global.mockLoad).not.toHaveBeenCalled();
    });

    it('should handle initialization errors', async () => {
      global.mockLoad.mockRejectedValueOnce(new Error('Failed to load models'));
      
      await expect(faceService.initialize()).rejects.toThrow('Failed to load models');
    });
  });

  describe('verifyLiveness - single image', () => {
    beforeEach(async () => {
      await faceService.initialize();
    });

    it('should detect live face successfully', async () => {
      const mockFace = {
        score: 0.98,
        box: [200, 150, 240, 240],
        mesh: Array(468).fill(null).map((_, i) => [i, i * 2, i * 0.1]), // Add depth values
        emotion: [
          { emotion: 'neutral', score: 0.7 },
          { emotion: 'happy', score: 0.2 }
        ],
        age: 28,
        gender: 'male',
        genderScore: 0.95,
        iris: [[100, 100, 10]]
      };

      global.mockDetect.mockResolvedValue({
        face: [mockFace]
      });

      const result = await faceService.verifyLiveness(Buffer.from('test-image'));

      expect(result).toMatchObject({
        isLive: true,
        confidence: expect.any(Number),
        checks: {
          faceDetected: true,
          faceSizeValid: true,
          faceCentered: true,
          faceQuality: true,
          expressionNatural: true,
          landmarksValid: true,
          meshQuality: true,
          irisDetected: true,
          ageGenderDetected: true
        }
      });

      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it('should detect no face', async () => {
      global.mockDetect.mockResolvedValue({
        face: []
      });

      const result = await faceService.verifyLiveness(Buffer.from('test-image'));

      expect(result).toMatchObject({
        isLive: false,
        confidence: 0,
        reason: 'No face detected'
      });
    });

    it('should detect multiple faces', async () => {
      global.mockDetect.mockResolvedValue({
        face: [
          { score: 0.9 },
          { score: 0.85 }
        ]
      });

      const result = await faceService.verifyLiveness(Buffer.from('test-image'));

      expect(result).toMatchObject({
        isLive: false,
        confidence: 0,
        reason: 'Multiple faces detected'
      });
    });

    it('should detect face too small', async () => {
      const mockFace = {
        score: 0.95,
        box: [280, 200, 80, 80], // Small face
        mesh: Array(468).fill([0, 0, 0]),
        emotion: [{ emotion: 'neutral', score: 0.8 }],
        age: 25,
        gender: 'female'
      };

      global.mockDetect.mockResolvedValue({
        face: [mockFace]
      });

      const result = await faceService.verifyLiveness(Buffer.from('test-image'));

      expect(result.checks.faceSizeValid).toBe(false);
      expect(result.confidence).toBeLessThan(0.7);
    });

    it('should detect face not centered', async () => {
      const mockFace = {
        score: 0.95,
        box: [50, 50, 200, 200], // Far left/top
        mesh: Array(468).fill([0, 0, 0]),
        emotion: [{ emotion: 'neutral', score: 0.8 }],
        age: 30,
        gender: 'male'
      };

      global.mockDetect.mockResolvedValue({
        face: [mockFace]
      });

      const result = await faceService.verifyLiveness(Buffer.from('test-image'));

      expect(result.checks.faceCentered).toBe(false);
    });

    it('should detect unnatural expression', async () => {
      const mockFace = {
        score: 0.95,
        box: [220, 180, 200, 200],
        mesh: Array(468).fill([0, 0, 0]),
        emotion: [
          { emotion: 'angry', score: 0.96 }, // Over 95% threshold
          { emotion: 'neutral', score: 0.04 }
        ],
        age: 35,
        gender: 'male'
      };

      global.mockDetect.mockResolvedValue({
        face: [mockFace]
      });

      const result = await faceService.verifyLiveness(Buffer.from('test-image'));

      expect(result.checks.expressionNatural).toBe(false);
    });

    it('should detect low quality face', async () => {
      const mockFace = {
        score: 0.45, // Low confidence
        box: [220, 180, 200, 200],
        mesh: Array(468).fill([0, 0, 0]),
        emotion: [{ emotion: 'neutral', score: 0.8 }],
        age: 25,
        gender: 'female'
      };

      global.mockDetect.mockResolvedValue({
        face: [mockFace]
      });

      const result = await faceService.verifyLiveness(Buffer.from('test-image'));

      expect(result.checks.faceQuality).toBe(false);
    });

    it('should detect poor mesh quality', async () => {
      const mockFace = {
        score: 0.9,
        box: [220, 180, 200, 200],
        mesh: Array(100).fill([0, 0, 0]), // Insufficient mesh points
        emotion: [{ emotion: 'neutral', score: 0.8 }],
        age: 25,
        gender: 'female'
      };

      global.mockDetect.mockResolvedValue({
        face: [mockFace]
      });

      const result = await faceService.verifyLiveness(Buffer.from('test-image'));

      expect(result.checks.meshQuality).toBe(false);
    });
  });

  describe('verifyLiveness - image sequence', () => {
    it('should use liveness detector for multiple images', async () => {
      const imageSequence = [
        Buffer.from('frame1'),
        Buffer.from('frame2'),
        Buffer.from('frame3')
      ];

      const mockLivenessResult = {
        isLive: true,
        confidence: 0.9,
        checks: {
          blinkDetected: { detected: true, count: 2 },
          movementDetected: { detected: true },
          expressionChanges: { detected: true }
        }
      };

      const { livenessDetector } = await import('../utils/livenessDetector.js');
      livenessDetector.detectLiveness.mockResolvedValue(mockLivenessResult);

      const result = await faceService.verifyLiveness(imageSequence);

      expect(livenessDetector.detectLiveness).toHaveBeenCalledWith(
        imageSequence,
        faceService.human
      );
      expect(result).toEqual(mockLivenessResult);
    });
  });

  describe('compareFaces', () => {
    beforeEach(async () => {
      await faceService.initialize();
    });

    it('should match similar faces', async () => {
      const mockDocFace = {
        face: [{
          score: 0.95,
          box: [100, 100, 200, 200],
          embedding: new Float32Array(512).fill(0.1),
          age: 25,
          gender: 'male'
        }]
      };

      const mockSelfieFace = {
        face: [{
          score: 0.98,
          box: [150, 120, 220, 220],
          embedding: new Float32Array(512).fill(0.11), // Similar embedding
          age: 26,
          gender: 'male'
        }]
      };

      global.mockDetect
        .mockResolvedValueOnce(mockDocFace)
        .mockResolvedValueOnce(mockSelfieFace);

      global.mockMatch.mockReturnValue(0.85); // High similarity

      const result = await faceService.compareFaces(
        Buffer.from('doc-image'),
        Buffer.from('selfie-image')
      );

      expect(result).toMatchObject({
        isMatch: true,
        similarity: 0.85,
        threshold: 0.5,
        ageDifference: 1
      });

      expect(global.mockMatch).toHaveBeenCalledWith(
        mockDocFace.face[0].embedding,
        mockSelfieFace.face[0].embedding
      );
    });

    it('should not match different faces', async () => {
      const mockDocFace = {
        face: [{
          score: 0.95,
          embedding: new Float32Array(512).fill(0.1),
          age: 25,
          gender: 'male'
        }]
      };

      const mockSelfieFace = {
        face: [{
          score: 0.98,
          embedding: new Float32Array(512).fill(0.9), // Very different
          age: 45,
          gender: 'female'
        }]
      };

      global.mockDetect
        .mockResolvedValueOnce(mockDocFace)
        .mockResolvedValueOnce(mockSelfieFace);

      global.mockMatch.mockReturnValue(0.2); // Low similarity

      const result = await faceService.compareFaces(
        Buffer.from('doc-image'),
        Buffer.from('selfie-image')
      );

      expect(result).toMatchObject({
        isMatch: false,
        similarity: 0.2,
        ageDifference: 20
      });
    });

    it('should handle missing face in document', async () => {
      global.mockDetect
        .mockResolvedValueOnce({ face: [] })
        .mockResolvedValueOnce({ face: [{ score: 0.9 }] });

      const result = await faceService.compareFaces(
        Buffer.from('doc-image'),
        Buffer.from('selfie-image')
      );

      expect(result).toMatchObject({
        isMatch: false,
        similarity: 0,
        error: 'Could not extract face from one or both images'
      });
    });

    it('should handle missing face in selfie', async () => {
      global.mockDetect
        .mockResolvedValueOnce({ face: [{ score: 0.9 }] })
        .mockResolvedValueOnce({ face: [] });

      const result = await faceService.compareFaces(
        Buffer.from('doc-image'),
        Buffer.from('selfie-image')
      );

      expect(result).toMatchObject({
        isMatch: false,
        similarity: 0,
        error: 'Could not extract face from one or both images'
      });
    });

    it('should select best face when multiple detected', async () => {
      const mockDocFace = {
        face: [
          { score: 0.8, embedding: new Float32Array(512).fill(0.1) },
          { score: 0.95, embedding: new Float32Array(512).fill(0.2) }, // Best score
          { score: 0.7, embedding: new Float32Array(512).fill(0.3) }
        ]
      };

      const mockSelfieFace = {
        face: [{
          score: 0.98,
          embedding: new Float32Array(512).fill(0.21)
        }]
      };

      global.mockDetect
        .mockResolvedValueOnce(mockDocFace)
        .mockResolvedValueOnce(mockSelfieFace);

      global.mockMatch.mockReturnValue(0.9);

      await faceService.compareFaces(
        Buffer.from('doc-image'),
        Buffer.from('selfie-image')
      );

      // Should use the face with score 0.95 (index 1)
      expect(global.mockMatch).toHaveBeenCalledWith(
        mockDocFace.face[1].embedding,
        mockSelfieFace.face[0].embedding
      );
    });
  });

  describe('extractFaceDescriptor', () => {
    beforeEach(async () => {
      await faceService.initialize();
    });

    it('should extract face descriptor successfully', async () => {
      const mockFace = {
        score: 0.95,
        box: [100, 100, 200, 200],
        embedding: new Float32Array(512).fill(0.5),
        mesh: Array(468).fill([0, 0, 0]),
        age: 30,
        gender: 'female',
        emotion: [{ emotion: 'happy', score: 0.8 }]
      };

      global.mockDetect.mockResolvedValue({
        face: [mockFace]
      });

      const result = await faceService.extractFaceDescriptor(Buffer.from('test-image'));

      expect(result).toMatchObject({
        embedding: mockFace.embedding,
        score: mockFace.score,
        box: mockFace.box,
        age: mockFace.age,
        gender: mockFace.gender,
        emotion: mockFace.emotion
      });
    });

    it('should return null when no face detected', async () => {
      global.mockDetect.mockResolvedValue({ face: [] });

      const result = await faceService.extractFaceDescriptor(Buffer.from('test-image'));

      expect(result).toBeNull();
    });

    it('should handle detection errors gracefully', async () => {
      global.mockDetect.mockRejectedValue(new Error('Detection failed'));

      const result = await faceService.extractFaceDescriptor(Buffer.from('test-image'));

      expect(result).toBeNull();
    });
  });

  describe('Face quality checks', () => {
    let faceService;

    beforeEach(async () => {
      faceService = new FaceVerificationService();
      await faceService.initialize();
    });

    it('should validate face size correctly', () => {
      const smallFace = { box: [0, 0, 80, 80] };
      const goodFace = { box: [0, 0, 200, 200] };
      const largeFace = { box: [0, 0, 400, 400] }; // 400x400 = 160,000 / 307,200 = ~0.52 (within 0.6 limit)

      expect(faceService.checkFaceSize(smallFace)).toBe(false);
      expect(faceService.checkFaceSize(goodFace)).toBe(true);
      expect(faceService.checkFaceSize(largeFace)).toBe(true);
    });

    it('should check face centering', () => {
      const img = { width: 640, height: 480 };
      
      const centeredFace = { box: [220, 140, 200, 200] };
      const leftFace = { box: [20, 140, 200, 200] };
      const topFace = { box: [220, 20, 200, 200] };

      expect(faceService.checkFaceCentered(centeredFace, img)).toBe(true);
      expect(faceService.checkFaceCentered(leftFace, img)).toBe(false);
      expect(faceService.checkFaceCentered(topFace, img)).toBe(false);
    });

    it('should validate face quality score', () => {
      const lowQuality = { score: 0.4 };
      const goodQuality = { score: 0.95 }; // Above 0.9 threshold

      expect(faceService.checkFaceQuality(lowQuality)).toBe(false);
      expect(faceService.checkFaceQuality(goodQuality)).toBe(true);
    });

    it('should check natural expressions', () => {
      const naturalExpression = {
        emotion: [
          { emotion: 'neutral', score: 0.6 },
          { emotion: 'happy', score: 0.3 }
        ]
      };

      const unnaturalExpression = {
        emotion: [
          { emotion: 'angry', score: 0.98 }, // Over 95% threshold
          { emotion: 'disgust', score: 0.02 }
        ]
      };

      expect(faceService.checkNaturalExpression(naturalExpression)).toBe(true);
      expect(faceService.checkNaturalExpression(unnaturalExpression)).toBe(false);
    });

    it('should validate landmarks', () => {
      const goodLandmarks = { mesh: Array(468).fill([0, 0, 0]) };
      const poorLandmarks = { mesh: Array(100).fill([0, 0, 0]) };
      const noLandmarks = { mesh: null };

      expect(faceService.checkLandmarks(goodLandmarks)).toBe(true);
      expect(faceService.checkLandmarks(poorLandmarks)).toBe(false);
      expect(faceService.checkLandmarks(noLandmarks)).toBe(false);
    });

    it('should check mesh quality', () => {
      const goodMesh = { mesh: Array(468).fill(null).map((_, i) => [i, i * 2, i * 0.1]) }; // Has depth
      const partialMesh = { mesh: Array(300).fill([0, 0, 0]) }; // No depth, less than 400 points
      const poorMesh = { mesh: Array(50).fill([0, 0, 0]) };

      expect(faceService.checkMeshQuality(goodMesh)).toBe(true);
      expect(faceService.checkMeshQuality(partialMesh)).toBe(false); // No depth and < 400 points
      expect(faceService.checkMeshQuality(poorMesh)).toBe(false);
    });
  });

  describe('Performance tests', () => {
    beforeEach(async () => {
      await faceService.initialize();
    });

    it('should process liveness check within acceptable time', async () => {
      global.mockDetect.mockResolvedValue({
        face: [{
          score: 0.95,
          box: [200, 150, 240, 240],
          mesh: Array(468).fill([0, 0, 0]),
          emotion: [{ emotion: 'neutral', score: 0.8 }],
          age: 25,
          gender: 'male'
        }]
      });

      const startTime = Date.now();
      await faceService.verifyLiveness(Buffer.from('test-image'));
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(2000); // Should complete within 2 seconds
    });

    it('should handle concurrent face comparisons', async () => {
      global.mockDetect.mockResolvedValue({
        face: [{
          score: 0.95,
          embedding: new Float32Array(512).fill(0.5)
        }]
      });
      global.mockMatch.mockReturnValue(0.8);

      const promises = Array(5).fill(null).map(() =>
        faceService.compareFaces(Buffer.from('img1'), Buffer.from('img2'))
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(5);
      expect(results.every(r => r.hasOwnProperty('isMatch'))).toBe(true);
    });
  });

  describe('Error handling', () => {
    beforeEach(async () => {
      await faceService.initialize();
    });

    it('should handle Human detection errors gracefully', async () => {
      global.mockDetect.mockRejectedValue(new Error('Detection failed'));

      await expect(
        faceService.verifyLiveness(Buffer.from('test-image'))
      ).rejects.toThrow('Detection failed');
    });

    it('should handle invalid image data', async () => {
      await expect(
        faceService.verifyLiveness(null)
      ).rejects.toThrow();
    });

    it('should handle corrupted embeddings', async () => {
      global.mockDetect.mockResolvedValue({
        face: [{
          embedding: null // Invalid embedding
        }]
      });

      const result = await faceService.extractFaceDescriptor(Buffer.from('test-image'));

      expect(result.embedding).toBeNull();
    });
  });

  describe('Human library configuration', () => {
    it('should configure Human with correct settings', () => {
      const service = new FaceVerificationService();
      
      expect(service.config).toMatchObject({
        backend: 'wasm',
        face: {
          enabled: true,
          detector: { rotation: false, return: true, maxDetected: 5 },
          mesh: { enabled: true },
          description: { enabled: true },
          emotion: { enabled: true },
          age: { enabled: true },
          gender: { enabled: true },
          antispoof: { enabled: true },
          liveness: { enabled: true }
        },
        body: { enabled: false },
        hand: { enabled: false },
        object: { enabled: false }
      });
    });
  });
});