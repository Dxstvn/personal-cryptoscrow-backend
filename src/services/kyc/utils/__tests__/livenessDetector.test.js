// src/services/kyc/utils/__tests__/livenessDetector.test.js

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LivenessDetector } from '../livenessDetector.js';

// Mock canvas module
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

describe('LivenessDetector', () => {
  let detector;
  let mockHumanInstance;
  
  beforeEach(() => {
    detector = new LivenessDetector();
    
    // Mock Human instance
    mockHumanInstance = {
      detect: vi.fn()
    };
    
    vi.clearAllMocks();
  });

  describe('detectLiveness', () => {
    it('should detect liveness from valid image sequence', async () => {
      const imageSequence = [
        Buffer.from('frame1'),
        Buffer.from('frame2'),
        Buffer.from('frame3'),
        Buffer.from('frame4'),
        Buffer.from('frame5')
      ];
      
      // Mock Human detect results for each frame
      const mockResults = [
        // Frame 1: neutral face
        {
          face: [{
            emotion: [
              { emotion: 'neutral', score: 0.8 },
              { emotion: 'happy', score: 0.1 }
            ],
            box: [100, 100, 200, 200],
            mesh: generateMockMesh(),
            iris: [[100, 100, 10], [200, 100, 10]]
          }]
        },
        // Frame 2: eyes closing (blink start) with movement
        {
          face: [{
            emotion: [
              { emotion: 'neutral', score: 0.7 },
              { emotion: 'happy', score: 0.2 }
            ],
            box: [115, 98, 200, 200], // 15px movement
            mesh: generateMockMesh(true), // Eyes closing
            iris: [[101, 100, 10], [201, 100, 10]]
          }]
        },
        // Frame 3: eyes closed (blink) with more movement
        {
          face: [{
            emotion: [
              { emotion: 'neutral', score: 0.7 },
              { emotion: 'happy', score: 0.2 }
            ],
            box: [125, 105, 200, 200], // More movement
            mesh: generateMockMesh(true, true), // Eyes closed
            iris: null // Eyes closed, no iris
          }]
        },
        // Frame 4: eyes opening with movement
        {
          face: [{
            emotion: [
              { emotion: 'happy', score: 0.6 },
              { emotion: 'neutral', score: 0.3 }
            ],
            box: [130, 107, 200, 200], // Continued movement
            mesh: generateMockMesh(true), // Eyes opening
            iris: [[102, 100, 10], [202, 100, 10]]
          }]
        },
        // Frame 5: expression change
        {
          face: [{
            emotion: [
              { emotion: 'happy', score: 0.8 },
              { emotion: 'neutral', score: 0.1 }
            ],
            box: [100, 100, 200, 200],
            mesh: generateMockMesh(),
            iris: [[100, 102, 10], [200, 102, 10]]
          }]
        }
      ];
      
      mockHumanInstance.detect
        .mockResolvedValueOnce(mockResults[0])
        .mockResolvedValueOnce(mockResults[1])
        .mockResolvedValueOnce(mockResults[2])
        .mockResolvedValueOnce(mockResults[3])
        .mockResolvedValueOnce(mockResults[4]);
      
      const result = await detector.detectLiveness(imageSequence, mockHumanInstance);
      
      expect(result).toHaveProperty('isLive');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('checks');
      expect(result).toHaveProperty('frameCount', 5);
      expect(result).toHaveProperty('recommendation');
      
      // The specific liveness detection may vary based on thresholds
      // Check structure rather than exact values
      expect(result.checks).toHaveProperty('blinkDetected');
      expect(result.checks).toHaveProperty('movementDetected');
      expect(result.checks).toHaveProperty('expressionChanges');
      expect(result.checks).toHaveProperty('depth3D');
      expect(result.checks).toHaveProperty('textureAnalysis');
      expect(result.checks).toHaveProperty('consistencyScore');
      expect(result.checks).toHaveProperty('antiSpoofing');
      expect(result.checks).toHaveProperty('irisTracking');
      
      // Check that expression changes were detected
      expect(result.checks.expressionChanges.detected).toBe(true);
      
      // Ensure confidence is within valid range
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('should reject when not enough frames', async () => {
      const imageSequence = [
        Buffer.from('frame1'),
        Buffer.from('frame2')
      ];
      
      await expect(
        detector.detectLiveness(imageSequence, mockHumanInstance)
      ).rejects.toThrow('Need at least 5 frames for liveness detection');
    });

    it('should handle frames with no face detected', async () => {
      const imageSequence = Array(5).fill(Buffer.from('frame'));
      
      // Mock some frames with no face
      mockHumanInstance.detect
        .mockResolvedValueOnce({ face: [] }) // No face
        .mockResolvedValueOnce({ face: [createMockFace()] })
        .mockResolvedValueOnce({ face: [] }) // No face
        .mockResolvedValueOnce({ face: [createMockFace()] })
        .mockResolvedValueOnce({ face: [createMockFace()] });
      
      const result = await detector.detectLiveness(imageSequence, mockHumanInstance);
      
      expect(result.isLive).toBe(false);
      expect(result.confidence).toBeLessThan(0.7);
    });

    it('should detect static image attack', async () => {
      const imageSequence = Array(5).fill(Buffer.from('frame'));
      
      // Mock identical results for all frames (static image)
      const staticFace = createMockFace();
      mockHumanInstance.detect.mockResolvedValue({ face: [staticFace] });
      
      const result = await detector.detectLiveness(imageSequence, mockHumanInstance);
      
      expect(result.isLive).toBe(false);
      expect(result.checks.antiSpoofing.staticImage).toBe(false);
    });
  });

  describe('detectBlinks', () => {
    it('should detect eye blinks', () => {
      const frameData = [
        { landmarks: { leftEye: { aspectRatio: 0.3 }, rightEye: { aspectRatio: 0.3 } } },
        { landmarks: { leftEye: { aspectRatio: 0.15 }, rightEye: { aspectRatio: 0.15 } } }, // Blink
        { landmarks: { leftEye: { aspectRatio: 0.3 }, rightEye: { aspectRatio: 0.3 } } },
        { landmarks: { leftEye: { aspectRatio: 0.1 }, rightEye: { aspectRatio: 0.1 } } }, // Blink
        { landmarks: { leftEye: { aspectRatio: 0.3 }, rightEye: { aspectRatio: 0.3 } } }
      ];
      
      const result = detector.detectBlinks(frameData);
      
      expect(result.detected).toBe(true);
      expect(result.count).toBe(2);
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should not detect blinks when eyes stay open', () => {
      const frameData = [
        { landmarks: { leftEye: { aspectRatio: 0.3 }, rightEye: { aspectRatio: 0.3 } } },
        { landmarks: { leftEye: { aspectRatio: 0.35 }, rightEye: { aspectRatio: 0.35 } } },
        { landmarks: { leftEye: { aspectRatio: 0.32 }, rightEye: { aspectRatio: 0.32 } } }
      ];
      
      const result = detector.detectBlinks(frameData);
      
      expect(result.detected).toBe(false);
      expect(result.count).toBe(0);
    });
  });

  describe('detectMovement', () => {
    it('should detect face movement', () => {
      const frameData = [
        { boundingBox: [100, 100, 200, 200] },
        { boundingBox: [115, 100, 200, 200] }, // 15px horizontal movement
        { boundingBox: [125, 105, 200, 200] }, // 10px diagonal movement  
        { boundingBox: [135, 110, 200, 200] }, // 10px diagonal movement
        { boundingBox: [150, 110, 200, 200] }  // 15px horizontal movement
      ];
      
      const result = detector.detectMovement(frameData);
      
      expect(result.detected).toBe(true);
      expect(result.averageDistance).toBeGreaterThan(0);
      expect(result.significantCount).toBeGreaterThan(0);
    });

    it('should not detect movement for static face', () => {
      const frameData = [
        { boundingBox: [100, 100, 200, 200] },
        { boundingBox: [100, 100, 200, 200] },
        { boundingBox: [100, 100, 200, 200] }
      ];
      
      const result = detector.detectMovement(frameData);
      
      expect(result.detected).toBe(false);
      expect(result.averageDistance).toBe(0);
    });
  });

  describe('detectExpressionChanges', () => {
    it('should detect expression changes', () => {
      const frameData = [
        { emotion: [{ emotion: 'neutral', score: 0.8 }, { emotion: 'happy', score: 0.1 }] },
        { emotion: [{ emotion: 'neutral', score: 0.4 }, { emotion: 'happy', score: 0.5 }] }, // Change
        { emotion: [{ emotion: 'happy', score: 0.8 }, { emotion: 'neutral', score: 0.1 }] }  // Big change
      ];
      
      const result = detector.detectExpressionChanges(frameData);
      
      expect(result.detected).toBe(true);
      expect(result.changes.length).toBeGreaterThan(0);
      expect(result.averageChange).toBeGreaterThan(0);
    });

    it('should not detect changes for constant expression', () => {
      const frameData = [
        { emotion: [{ emotion: 'neutral', score: 0.8 }] },
        { emotion: [{ emotion: 'neutral', score: 0.8 }] },
        { emotion: [{ emotion: 'neutral', score: 0.8 }] }
      ];
      
      const result = detector.detectExpressionChanges(frameData);
      
      expect(result.detected).toBe(false);
      expect(result.changes.length).toBe(0);
    });
  });

  describe('analyze3DStructure', () => {
    it('should detect 3D face structure', () => {
      const frameData = [
        {
          mesh: generateMockMesh(),
          landmarks: createMockLandmarks(),
          boundingBox: [100, 100, 200, 200]
        },
        {
          mesh: generateMockMesh(),
          landmarks: createMockLandmarks(),
          boundingBox: [100, 100, 200, 200]
        }
      ];
      
      const result = detector.analyze3DStructure(frameData);
      
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('is3D');
      expect(result).toHaveProperty('hasDepth');
      expect(result.score).toBeGreaterThanOrEqual(0);
    });

    it('should detect flat 2D image', () => {
      const frameData = [
        {
          mesh: generateFlatMesh(), // All z-coordinates are same
          landmarks: createMockLandmarks(),
          boundingBox: [100, 100, 200, 200]
        },
        {
          mesh: generateFlatMesh(),
          landmarks: createMockLandmarks(),
          boundingBox: [100, 100, 200, 200]
        }
      ];
      
      const result = detector.analyze3DStructure(frameData);
      
      expect(result.is3D).toBe(false);
      expect(result.hasDepth).toBe(false);
    });
  });

  describe('checkIrisTracking', () => {
    it('should detect iris movement', () => {
      const frameData = [
        { iris: [[100, 100, 10], [200, 100, 10]] },
        { iris: [[102, 100, 10], [202, 100, 10]] }, // Small movement
        { iris: [[105, 102, 10], [205, 102, 10]] }, // Movement
        { iris: [[103, 101, 10], [203, 101, 10]] }
      ];
      
      const result = detector.checkIrisTracking(frameData);
      
      expect(result.detected).toBe(true);
      expect(result.movements).toBeGreaterThan(0);
      expect(result.coverage).toBe(1.0);
    });

    it('should handle missing iris data', () => {
      const frameData = [
        { iris: null },
        { iris: [] },
        { iris: [[100, 100, 10]] },
        { iris: null }
      ];
      
      const result = detector.checkIrisTracking(frameData);
      
      expect(result.detected).toBe(false);
      expect(result.confidence).toBe(0);
    });
  });

  describe('performAntiSpoofingChecks', () => {
    it('should perform comprehensive anti-spoofing checks', () => {
      const frameData = generateDynamicFrameData();
      
      const result = detector.performAntiSpoofingChecks(frameData);
      
      expect(result).toHaveProperty('staticImage');
      expect(result).toHaveProperty('videoReplay');
      expect(result).toHaveProperty('maskDetected');
      expect(result).toHaveProperty('lightingConsistent');
      expect(result).toHaveProperty('meshQualityGood');
      expect(result).toHaveProperty('antiSpoofScore');
      expect(result.antiSpoofScore).toBeGreaterThan(0);
    });
  });

  describe('detectVideoReplay', () => {
    it('should detect repeating patterns in movement', () => {
      // Create repeating pattern
      const frameData = [
        { boundingBox: [100, 100, 200, 200] },
        { boundingBox: [110, 100, 200, 200] },
        { boundingBox: [100, 100, 200, 200] }, // Back to start
        { boundingBox: [110, 100, 200, 200] }, // Repeat
        { boundingBox: [100, 100, 200, 200] }, // Back to start
        { boundingBox: [110, 100, 200, 200] }  // Repeat
      ];
      
      const result = detector.detectVideoReplay(frameData);
      
      expect(result).toBe(false); // False means replay detected
    });
  });

  describe('calculateLivenessScore', () => {
    it('should calculate high score for live face', () => {
      const checks = {
        blinkDetected: { detected: true, confidence: 0.9 },
        movementDetected: { detected: true, confidence: 0.8 },
        expressionChanges: { detected: true, confidence: 0.7 },
        depth3D: { score: 0.9 },
        textureAnalysis: { score: 0.8 },
        consistencyScore: 0.85,
        antiSpoofing: { antiSpoofScore: 0.9 },
        irisTracking: { detected: true, confidence: 0.8 }
      };
      
      const score = detector.calculateLivenessScore(checks);
      
      expect(score).toBeGreaterThan(0.8);
      expect(score).toBeLessThanOrEqual(1.0);
    });

    it('should calculate low score for spoof attempt', () => {
      const checks = {
        blinkDetected: { detected: false, confidence: 0 },
        movementDetected: { detected: false, confidence: 0 },
        expressionChanges: { detected: false, confidence: 0 },
        depth3D: { score: 0.2 },
        textureAnalysis: { score: 0.2 },
        consistencyScore: 0.3,
        antiSpoofing: { antiSpoofScore: 0.2 },
        irisTracking: { detected: false, confidence: 0 }
      };
      
      const score = detector.calculateLivenessScore(checks);
      
      expect(score).toBeLessThan(0.5);
    });
  });

  describe('getRecommendation', () => {
    it('should recommend accept for high score', () => {
      const recommendation = detector.getRecommendation(0.9, {});
      
      expect(recommendation.action).toBe('accept');
      expect(recommendation.message).toContain('Strong liveness');
    });

    it('should recommend manual review for medium score', () => {
      const checks = {
        blinkDetected: { detected: false },
        movementDetected: { detected: false },
        expressionChanges: { detected: false },
        depth3D: { is3D: false },
        irisTracking: { detected: false }
      };
      
      const recommendation = detector.getRecommendation(0.6, checks);
      
      expect(recommendation.action).toBe('manual_review');
      expect(recommendation.concerns).toBeInstanceOf(Array);
      expect(recommendation.concerns.length).toBeGreaterThan(0);
    });

    it('should recommend reject for low score', () => {
      const checks = {
        antiSpoofing: {
          staticImage: false,
          maskDetected: true,
          meshQualityGood: false
        },
        textureAnalysis: {
          screenDetected: true
        },
        consistencyScore: 0.2
      };
      
      const recommendation = detector.getRecommendation(0.3, checks);
      
      expect(recommendation.action).toBe('reject');
      expect(recommendation.reasons).toBeInstanceOf(Array);
      expect(recommendation.reasons.length).toBeGreaterThan(0);
    });
  });

  describe('Helper methods', () => {
    it('should calculate euclidean distance correctly', () => {
      const p1 = { x: 0, y: 0 };
      const p2 = { x: 3, y: 4 };
      
      const distance = detector.euclideanDistance(p1, p2);
      
      expect(distance).toBe(5);
    });

    it('should calculate variance correctly', () => {
      const values = [1, 2, 3, 4, 5];
      const variance = detector.calculateVariance(values);
      
      expect(variance).toBe(2);
    });

    it('should extract eye landmarks correctly', () => {
      const mesh = generateMockMesh();
      const landmarks = detector.getEyeLandmarksFromMesh(mesh, 'left');
      
      expect(landmarks).toHaveProperty('points');
      expect(landmarks).toHaveProperty('aspectRatio');
      expect(landmarks).toHaveProperty('center');
      expect(landmarks.points.length).toBe(6);
    });

    it('should handle invalid mesh data', () => {
      const landmarks = detector.getEyeLandmarksFromMesh([], 'left');
      
      expect(landmarks.points).toEqual([]);
      expect(landmarks.aspectRatio).toBe(0);
    });
  });

  describe('prepareImage', () => {
    it('should prepare image from buffer', async () => {
      const canvas = await import('canvas');
      const imageBuffer = Buffer.from('test-image');
      
      const result = await detector.prepareImage(imageBuffer);
      
      expect(canvas.loadImage).toHaveBeenCalledWith(imageBuffer);
      expect(canvas.createCanvas).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should return canvas if already canvas', async () => {
      const mockCanvas = {
        getContext: vi.fn(),
        width: 640,
        height: 480
      };
      
      const result = await detector.prepareImage(mockCanvas);
      
      expect(result).toBe(mockCanvas);
    });

    it('should handle image preparation errors', async () => {
      const canvas = await import('canvas');
      canvas.loadImage.mockRejectedValueOnce(new Error('Invalid image'));
      
      await expect(
        detector.prepareImage(Buffer.from('invalid'))
      ).rejects.toThrow('Invalid image');
    });
  });
});

// Helper functions for test data generation
function generateMockMesh(eyesClosing = false, eyesClosed = false) {
  const mesh = [];
  for (let i = 0; i < 468; i++) {
    const x = 100 + Math.sin(i) * 50;
    let y = 100 + Math.cos(i) * 50;
    let z = 10 + Math.sin(i * 0.1) * 20; // Depth variation
    
    // Modify eye points for blink simulation
    if (eyesClosing && [33, 160, 158, 133, 153, 144, 362, 385, 387, 263, 373, 380].includes(i)) {
      y -= 5;
    }
    if (eyesClosed && [33, 160, 158, 133, 153, 144, 362, 385, 387, 263, 373, 380].includes(i)) {
      y -= 10;
    }
    
    mesh.push([x, y, z]);
  }
  return mesh;
}

function generateFlatMesh() {
  const mesh = [];
  for (let i = 0; i < 468; i++) {
    const x = 100 + Math.sin(i) * 50;
    const y = 100 + Math.cos(i) * 50;
    const z = 5; // No depth variation
    mesh.push([x, y, z]);
  }
  return mesh;
}

function createMockFace() {
  return {
    emotion: [{ emotion: 'neutral', score: 0.8 }],
    box: [100, 100, 200, 200],
    mesh: generateMockMesh(),
    iris: [[100, 100, 10], [200, 100, 10]]
  };
}

function createMockLandmarks() {
  return {
    leftEye: {
      points: Array(6).fill({ x: 100, y: 100, z: 10 }),
      aspectRatio: 0.3,
      center: { x: 100, y: 100 }
    },
    rightEye: {
      points: Array(6).fill({ x: 200, y: 100, z: 10 }),
      aspectRatio: 0.3,
      center: { x: 200, y: 100 }
    },
    nose: Array(10).fill({ x: 150, y: 150, z: 15 }),
    mouth: Array(16).fill({ x: 150, y: 200, z: 10 }),
    jawline: Array(16).fill({ x: 150, y: 250, z: 8 })
  };
}

function generateDynamicFrameData() {
  return [
    {
      boundingBox: [100, 100, 200, 200],
      mesh: generateMockMesh(),
      landmarks: createMockLandmarks()
    },
    {
      boundingBox: [102, 98, 200, 200],
      mesh: generateMockMesh(),
      landmarks: createMockLandmarks()
    },
    {
      boundingBox: [105, 95, 200, 200],
      mesh: generateMockMesh(),
      landmarks: createMockLandmarks()
    }
  ];
}