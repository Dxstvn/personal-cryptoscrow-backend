// src/services/kyc/utils/livenessDetector.js

import { createCanvas, loadImage } from 'canvas';

/**
 * Advanced Liveness Detection using Human library
 * Detects whether a face is live or a spoof attempt
 */
export class LivenessDetector {
  constructor() {
    this.minFrames = 5; // Minimum frames for analysis
    this.blinkThreshold = 0.2; // Eye aspect ratio threshold
    this.movementThreshold = 10; // Minimum pixels of movement
    this.expressionChangeThreshold = 0.3; // Expression change threshold
  }

  /**
   * Perform comprehensive liveness detection
   * @param {Array<Buffer>} imageSequence - Sequence of face images
   * @param {Object} humanInstance - Human library instance
   * @returns {Promise<Object>} Liveness detection results
   */
  async detectLiveness(imageSequence, humanInstance) {
    if (!imageSequence || imageSequence.length < this.minFrames) {
      throw new Error(`Need at least ${this.minFrames} frames for liveness detection`);
    }

    console.log(`[LivenessDetector] Analyzing ${imageSequence.length} frames`);

    // Extract face data from all frames
    const frameAnalysis = await this.analyzeFrames(imageSequence, humanInstance);

    // Perform multiple liveness checks
    const livenessChecks = {
      // 1. Eye blink detection
      blinkDetected: this.detectBlinks(frameAnalysis),
      
      // 2. Face movement tracking
      movementDetected: this.detectMovement(frameAnalysis),
      
      // 3. Expression changes
      expressionChanges: this.detectExpressionChanges(frameAnalysis),
      
      // 4. 3D structure analysis
      depth3D: this.analyze3DStructure(frameAnalysis),
      
      // 5. Texture analysis
      textureAnalysis: this.analyzeTexture(frameAnalysis),
      
      // 6. Consistency checks
      consistencyScore: this.checkConsistency(frameAnalysis),
      
      // 7. Anti-spoofing checks
      antiSpoofing: this.performAntiSpoofingChecks(frameAnalysis),
      
      // 8. Iris detection (unique to Human)
      irisTracking: this.checkIrisTracking(frameAnalysis)
    };

    // Calculate overall liveness score
    const livenessScore = this.calculateLivenessScore(livenessChecks);
    const isLive = livenessScore > 0.7;

    return {
      isLive,
      confidence: livenessScore,
      checks: livenessChecks,
      frameCount: imageSequence.length,
      recommendation: this.getRecommendation(livenessScore, livenessChecks)
    };
  }

  /**
   * Analyze all frames to extract face data
   */
  async analyzeFrames(imageSequence, humanInstance) {
    const frameData = [];

    for (let i = 0; i < imageSequence.length; i++) {
      try {
        const img = await this.prepareImage(imageSequence[i]);
        const result = await humanInstance.detect(img);

        if (result.face && result.face.length > 0) {
          const face = result.face[0];
          frameData.push({
            frameIndex: i,
            face,
            landmarks: this.extractKeyLandmarksFromHuman(face),
            emotion: face.emotion,
            boundingBox: face.box,
            mesh: face.mesh,
            iris: face.iris,
            timestamp: Date.now()
          });
        }
      } catch (error) {
        console.warn(`[LivenessDetector] Failed to analyze frame ${i}:`, error.message);
      }
    }

    return frameData;
  }

  /**
   * Extract key facial landmarks from Human face data
   */
  extractKeyLandmarksFromHuman(face) {
    // Human provides 468 mesh points with specific indices for features
    const mesh = face.mesh || [];
    
    // Key landmark indices in Human's mesh
    const landmarks = {
      leftEye: this.getEyeLandmarksFromMesh(mesh, 'left'),
      rightEye: this.getEyeLandmarksFromMesh(mesh, 'right'),
      nose: this.getNoseLandmarksFromMesh(mesh),
      mouth: this.getMouthLandmarksFromMesh(mesh),
      jawline: this.getJawlineLandmarksFromMesh(mesh)
    };
    
    return landmarks;
  }

  /**
   * Get eye landmarks from mesh points
   */
  getEyeLandmarksFromMesh(mesh, side) {
    if (!mesh || mesh.length < 468) return { points: [], aspectRatio: 0, center: { x: 0, y: 0 } };
    
    // Human mesh indices for eyes
    const eyeIndices = {
      left: [33, 160, 158, 133, 153, 144], // Left eye key points
      right: [362, 385, 387, 263, 373, 380] // Right eye key points
    };
    
    const indices = eyeIndices[side];
    const points = indices.map(i => ({ x: mesh[i][0], y: mesh[i][1], z: mesh[i][2] }));
    
    // Calculate eye aspect ratio (EAR)
    if (points.length >= 6) {
      // Vertical distances
      const v1 = this.euclideanDistance(points[1], points[5]);
      const v2 = this.euclideanDistance(points[2], points[4]);
      
      // Horizontal distance
      const h = this.euclideanDistance(points[0], points[3]);
      
      // Eye aspect ratio
      const ear = h > 0 ? (v1 + v2) / (2.0 * h) : 0;

      return {
        points,
        aspectRatio: ear,
        center: {
          x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
          y: points.reduce((sum, p) => sum + p.y, 0) / points.length
        }
      };
    }
    
    return { points, aspectRatio: 0, center: { x: 0, y: 0 } };
  }

  /**
   * Get nose landmarks from mesh
   */
  getNoseLandmarksFromMesh(mesh) {
    if (!mesh || mesh.length < 468) return [];
    
    // Human mesh indices for nose
    const noseIndices = [1, 2, 5, 6, 19, 20, 94, 125, 235, 236];
    return noseIndices.map(i => ({ x: mesh[i][0], y: mesh[i][1], z: mesh[i][2] }));
  }

  /**
   * Get mouth landmarks from mesh
   */
  getMouthLandmarksFromMesh(mesh) {
    if (!mesh || mesh.length < 468) return [];
    
    // Human mesh indices for mouth
    const mouthIndices = [13, 14, 269, 270, 267, 271, 272, 17, 18, 85, 86, 87, 88, 89, 90, 91];
    return mouthIndices.map(i => ({ x: mesh[i][0], y: mesh[i][1], z: mesh[i][2] }));
  }

  /**
   * Get jawline landmarks from mesh
   */
  getJawlineLandmarksFromMesh(mesh) {
    if (!mesh || mesh.length < 468) return [];
    
    // Human mesh indices for jawline
    const jawIndices = [172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397, 288, 361, 323];
    return jawIndices.map(i => ({ x: mesh[i][0], y: mesh[i][1], z: mesh[i][2] }));
  }

  /**
   * Detect eye blinks across frames
   */
  detectBlinks(frameData) {
    if (frameData.length < 3) return { detected: false, count: 0 };

    const leftEARs = frameData.map(f => f.landmarks.leftEye.aspectRatio).filter(ear => ear > 0);
    const rightEARs = frameData.map(f => f.landmarks.rightEye.aspectRatio).filter(ear => ear > 0);
    
    let blinkCount = 0;
    let inBlink = false;

    // Analyze both eyes
    for (let i = 1; i < Math.min(leftEARs.length, rightEARs.length); i++) {
      const avgEAR = (leftEARs[i] + rightEARs[i]) / 2;
      
      if (avgEAR < this.blinkThreshold && !inBlink) {
        inBlink = true;
      } else if (avgEAR >= this.blinkThreshold && inBlink) {
        blinkCount++;
        inBlink = false;
      }
    }

    return {
      detected: blinkCount > 0,
      count: blinkCount,
      confidence: Math.min(blinkCount * 0.3, 1.0)
    };
  }

  /**
   * Detect face movement
   */
  detectMovement(frameData) {
    if (frameData.length < 2) return { detected: false, distance: 0 };

    let totalMovement = 0;
    let significantMovements = 0;

    for (let i = 1; i < frameData.length; i++) {
      const prev = frameData[i - 1].boundingBox;
      const curr = frameData[i].boundingBox;
      
      // Calculate center point movement
      const prevCenter = {
        x: prev[0] + prev[2] / 2,
        y: prev[1] + prev[3] / 2
      };
      
      const currCenter = {
        x: curr[0] + curr[2] / 2,
        y: curr[1] + curr[3] / 2
      };
      
      const distance = this.euclideanDistance(prevCenter, currCenter);
      totalMovement += distance;
      
      if (distance > this.movementThreshold) {
        significantMovements++;
      }
    }

    const avgMovement = totalMovement / (frameData.length - 1);

    return {
      detected: significantMovements > 0,
      averageDistance: avgMovement,
      significantCount: significantMovements,
      confidence: Math.min(avgMovement / 50, 1.0)
    };
  }

  /**
   * Detect expression changes
   */
  detectExpressionChanges(frameData) {
    if (frameData.length < 2) return { detected: false, changes: [] };

    const expressionTypes = ['neutral', 'happy', 'sad', 'angry', 'fear', 'disgust', 'surprise'];
    const changes = [];
    let totalChange = 0;

    for (let i = 1; i < frameData.length; i++) {
      const prevEmotions = frameData[i - 1].emotion || [];
      const currEmotions = frameData[i].emotion || [];
      
      // Convert emotion array to object for comparison
      const prevExpr = {};
      const currExpr = {};
      
      prevEmotions.forEach(e => { prevExpr[e.emotion] = e.score; });
      currEmotions.forEach(e => { currExpr[e.emotion] = e.score; });
      
      for (const expr of expressionTypes) {
        const prevScore = prevExpr[expr] || 0;
        const currScore = currExpr[expr] || 0;
        const change = Math.abs(currScore - prevScore);
        if (change > this.expressionChangeThreshold) {
          changes.push({
            frame: i,
            expression: expr,
            change
          });
        }
        totalChange += change;
      }
    }

    const avgChange = totalChange / ((frameData.length - 1) * expressionTypes.length);

    return {
      detected: changes.length > 0,
      changes,
      averageChange: avgChange,
      confidence: Math.min(avgChange * 2, 1.0)
    };
  }

  /**
   * Analyze 3D face structure
   */
  analyze3DStructure(frameData) {
    if (frameData.length < 2) return { score: 0.5, confidence: 0.3 };

    // Analyze face proportions and depth
    const proportions = frameData.map(frame => {
      const mesh = frame.mesh || [];
      
      if (mesh.length < 468) {
        return null;
      }
      
      // Calculate depth variance (z-coordinates)
      const zCoords = mesh.map(point => point[2]);
      const zMin = Math.min(...zCoords);
      const zMax = Math.max(...zCoords);
      const depthRange = zMax - zMin;
      
      // Calculate facial ratios using mesh points
      const landmarks = frame.landmarks;
      
      const eyeDistance = this.euclideanDistance(
        landmarks.leftEye.center,
        landmarks.rightEye.center
      );
      
      const noseLength = landmarks.nose.length > 2 ? 
        this.euclideanDistance(landmarks.nose[0], landmarks.nose[landmarks.nose.length - 1]) : 0;
      
      const mouthWidth = landmarks.mouth.length > 6 ?
        this.euclideanDistance(landmarks.mouth[0], landmarks.mouth[6]) : 0;
      
      return {
        depthRange,
        eyeToNoseRatio: noseLength > 0 ? eyeDistance / noseLength : 0,
        eyeToMouthRatio: mouthWidth > 0 ? eyeDistance / mouthWidth : 0,
        faceWidth: frame.boundingBox[2],
        faceHeight: frame.boundingBox[3]
      };
    }).filter(p => p !== null);

    // Check consistency of proportions and depth
    const consistency = this.calculateProportionConsistency(proportions);
    const hasGoodDepth = proportions.some(p => p.depthRange > 10);

    return {
      score: consistency * (hasGoodDepth ? 1.2 : 0.8),
      confidence: 0.8,
      is3D: consistency > 0.8 && hasGoodDepth,
      hasDepth: hasGoodDepth
    };
  }

  /**
   * Check iris tracking (unique to Human)
   */
  checkIrisTracking(frameData) {
    const irisData = frameData.map(f => f.iris).filter(iris => iris && iris.length > 0);
    
    if (irisData.length < frameData.length * 0.5) {
      return {
        detected: false,
        confidence: 0,
        movements: 0
      };
    }

    // Track iris movements
    let movements = 0;
    for (let i = 1; i < irisData.length; i++) {
      if (irisData[i - 1] && irisData[i]) {
        // Check if iris position changed
        const prevIris = irisData[i - 1][0]; // Left iris
        const currIris = irisData[i][0];
        
        if (prevIris && currIris) {
          const distance = Math.sqrt(
            Math.pow(currIris[0] - prevIris[0], 2) +
            Math.pow(currIris[1] - prevIris[1], 2)
          );
          
          if (distance > 2) movements++;
        }
      }
    }

    return {
      detected: true,
      confidence: Math.min(irisData.length / frameData.length, 1.0),
      movements,
      coverage: irisData.length / frameData.length
    };
  }

  /**
   * Analyze texture for screen/paper detection
   */
  analyzeTexture(frameData) {
    // Analyze mesh quality and consistency
    const meshQualities = frameData.map(f => {
      if (!f.mesh || f.mesh.length < 468) return 0;
      
      // Check mesh point distribution
      const zCoords = f.mesh.map(p => p[2]);
      const variance = this.calculateVariance(zCoords);
      
      return variance > 5 ? 1 : 0; // Good variance indicates real face
    });
    
    const avgQuality = meshQualities.reduce((a, b) => a + b, 0) / meshQualities.length;

    return {
      score: avgQuality,
      screenDetected: avgQuality < 0.3,
      paperDetected: avgQuality < 0.5 && avgQuality >= 0.3,
      confidence: 0.7
    };
  }

  /**
   * Check consistency across frames
   */
  checkConsistency(frameData) {
    if (frameData.length < 2) return 0.5;

    // Check face size consistency
    const sizes = frameData.map(f => f.boundingBox[2] * f.boundingBox[3]);
    const sizeVariance = this.calculateVariance(sizes);
    const sizeConsistency = 1 - Math.min(sizeVariance / 10000, 1);

    // Check landmark stability
    const landmarkStability = this.calculateLandmarkStability(frameData);

    // Check mesh consistency
    const meshConsistency = frameData.filter(f => f.mesh && f.mesh.length === 468).length / frameData.length;

    return (sizeConsistency + landmarkStability + meshConsistency) / 3;
  }

  /**
   * Perform anti-spoofing checks
   */
  performAntiSpoofingChecks(frameData) {
    const checks = {
      // Check for static image (no changes between frames)
      staticImage: this.detectStaticImage(frameData),
      
      // Check for video replay attack
      videoReplay: this.detectVideoReplay(frameData),
      
      // Check for mask/cutout
      maskDetected: this.detectMask(frameData),
      
      // Check lighting consistency
      lightingConsistent: this.checkLightingConsistency(frameData),
      
      // Check for mesh quality
      meshQualityGood: this.checkMeshQuality(frameData)
    };

    const spoofingScore = Object.values(checks).filter(v => v === false).length / Object.keys(checks).length;

    return {
      ...checks,
      antiSpoofScore: 1 - spoofingScore
    };
  }

  /**
   * Check mesh quality
   */
  checkMeshQuality(frameData) {
    const goodMeshes = frameData.filter(f => {
      if (!f.mesh || f.mesh.length < 468) return false;
      
      // Check if mesh has proper 3D structure
      const zCoords = f.mesh.map(p => p[2]);
      const depthRange = Math.max(...zCoords) - Math.min(...zCoords);
      
      return depthRange > 10;
    });
    
    return goodMeshes.length > frameData.length * 0.8;
  }

  /**
   * Detect static image attack
   */
  detectStaticImage(frameData) {
    if (frameData.length < 2) return true;

    // Check if all frames are identical
    let identicalFrames = 0;
    
    for (let i = 1; i < frameData.length; i++) {
      const similarity = this.calculateFrameSimilarity(frameData[i - 1], frameData[i]);
      if (similarity > 0.99) {
        identicalFrames++;
      }
    }

    return identicalFrames < frameData.length - 1;
  }

  /**
   * Detect video replay attack
   */
  detectVideoReplay(frameData) {
    // Check for unnatural patterns
    const movements = [];
    
    for (let i = 1; i < frameData.length; i++) {
      const prev = frameData[i - 1].boundingBox;
      const curr = frameData[i].boundingBox;
      
      movements.push({
        x: curr[0] - prev[0],
        y: curr[1] - prev[1]
      });
    }
    
    // Check for repeating patterns
    const patternDetected = this.detectRepeatingPattern(movements);
    
    return !patternDetected;
  }

  /**
   * Detect repeating pattern in movements
   */
  detectRepeatingPattern(movements) {
    if (movements.length < 4) return false;
    
    // Simple pattern detection - check if movements repeat
    for (let patternLen = 2; patternLen <= movements.length / 2; patternLen++) {
      let matches = 0;
      
      for (let i = 0; i < movements.length - patternLen; i++) {
        const pattern = movements.slice(i, i + patternLen);
        const next = movements.slice(i + patternLen, i + patternLen * 2);
        
        if (this.patternsMatch(pattern, next)) {
          matches++;
        }
      }
      
      if (matches > movements.length / (patternLen * 3)) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Check if two movement patterns match
   */
  patternsMatch(pattern1, pattern2) {
    if (pattern1.length !== pattern2.length) return false;
    
    const threshold = 2; // pixels
    
    for (let i = 0; i < pattern1.length; i++) {
      if (Math.abs(pattern1[i].x - pattern2[i].x) > threshold ||
          Math.abs(pattern1[i].y - pattern2[i].y) > threshold) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Detect mask or cutout
   */
  detectMask(frameData) {
    // Check for consistent mesh boundaries
    const meshBoundaryScores = frameData.map(f => {
      if (!f.mesh || f.mesh.length < 468) return 0;
      
      // Check jawline mesh points for natural variation
      const jawlinePoints = f.landmarks.jawline;
      if (jawlinePoints.length < 10) return 0;
      
      // Calculate variance in z-coordinates
      const zVariance = this.calculateVariance(jawlinePoints.map(p => p.z || 0));
      
      return zVariance > 2 ? 1 : 0;
    });
    
    const avgScore = meshBoundaryScores.reduce((a, b) => a + b, 0) / meshBoundaryScores.length;
    
    return avgScore < 0.7; // Low score indicates possible mask
  }

  /**
   * Check lighting consistency
   */
  checkLightingConsistency(frameData) {
    // For now, assume lighting is consistent
    // In production, would analyze face brightness distribution
    return true;
  }

  /**
   * Calculate overall liveness score
   */
  calculateLivenessScore(checks) {
    const weights = {
      blinkDetected: 0.15,
      movementDetected: 0.15,
      expressionChanges: 0.15,
      depth3D: 0.20,
      textureAnalysis: 0.10,
      consistencyScore: 0.10,
      antiSpoofing: 0.10,
      irisTracking: 0.05 // New weight for iris tracking
    };

    let score = 0;

    // Blink detection
    if (checks.blinkDetected.detected) {
      score += weights.blinkDetected * checks.blinkDetected.confidence;
    }

    // Movement detection
    if (checks.movementDetected.detected) {
      score += weights.movementDetected * checks.movementDetected.confidence;
    }

    // Expression changes
    if (checks.expressionChanges.detected) {
      score += weights.expressionChanges * checks.expressionChanges.confidence;
    }

    // 3D structure
    score += weights.depth3D * checks.depth3D.score;

    // Texture analysis
    score += weights.textureAnalysis * checks.textureAnalysis.score;

    // Consistency
    score += weights.consistencyScore * checks.consistencyScore;

    // Anti-spoofing
    score += weights.antiSpoofing * checks.antiSpoofing.antiSpoofScore;

    // Iris tracking
    if (checks.irisTracking.detected) {
      score += weights.irisTracking * checks.irisTracking.confidence;
    }

    return Math.min(score, 1.0);
  }

  /**
   * Get recommendation based on liveness score
   */
  getRecommendation(score, checks) {
    if (score > 0.85) {
      return {
        action: 'accept',
        message: 'Strong liveness indicators detected'
      };
    } else if (score > 0.7) {
      return {
        action: 'accept_with_caution',
        message: 'Liveness likely but some checks inconclusive'
      };
    } else if (score > 0.5) {
      return {
        action: 'manual_review',
        message: 'Liveness uncertain, manual review required',
        concerns: this.identifyConcerns(checks)
      };
    } else {
      return {
        action: 'reject',
        message: 'Potential spoof attempt detected',
        reasons: this.identifyReasons(checks)
      };
    }
  }

  /**
   * Identify specific concerns
   */
  identifyConcerns(checks) {
    const concerns = [];

    if (!checks.blinkDetected.detected) {
      concerns.push('No eye blinks detected');
    }

    if (!checks.movementDetected.detected) {
      concerns.push('Insufficient face movement');
    }

    if (!checks.expressionChanges.detected) {
      concerns.push('No expression changes detected');
    }

    if (!checks.depth3D.is3D) {
      concerns.push('Face appears flat (possible 2D image)');
    }

    if (!checks.irisTracking.detected) {
      concerns.push('Unable to track iris movement');
    }

    return concerns;
  }

  /**
   * Identify rejection reasons
   */
  identifyReasons(checks) {
    const reasons = [];

    if (!checks.antiSpoofing.staticImage) {
      reasons.push('Static image detected');
    }

    if (checks.antiSpoofing.maskDetected) {
      reasons.push('Face mask or cutout detected');
    }

    if (checks.textureAnalysis.screenDetected) {
      reasons.push('Screen presentation detected');
    }

    if (checks.consistencyScore < 0.3) {
      reasons.push('Inconsistent face data across frames');
    }

    if (!checks.antiSpoofing.meshQualityGood) {
      reasons.push('Poor 3D mesh quality');
    }

    return reasons.length > 0 ? reasons : ['Multiple liveness checks failed'];
  }

  /**
   * Helper: Calculate Euclidean distance
   */
  euclideanDistance(p1, p2) {
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
  }

  /**
   * Helper: Calculate variance
   */
  calculateVariance(values) {
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    return values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  }

  /**
   * Helper: Calculate proportion consistency
   */
  calculateProportionConsistency(proportions) {
    if (proportions.length < 2) return 0.5;

    const ratios = ['eyeToNoseRatio', 'eyeToMouthRatio'];
    let totalConsistency = 0;

    for (const ratio of ratios) {
      const values = proportions.map(p => p[ratio]).filter(v => v > 0);
      if (values.length > 1) {
        const variance = this.calculateVariance(values);
        const consistency = 1 - Math.min(variance / 0.1, 1);
        totalConsistency += consistency;
      }
    }

    return totalConsistency / ratios.length;
  }

  /**
   * Helper: Calculate landmark stability
   */
  calculateLandmarkStability(frameData) {
    if (frameData.length < 2) return 0.5;
    
    // Check how stable key landmarks are
    let stability = 0;
    let checks = 0;
    
    for (let i = 1; i < frameData.length; i++) {
      const prev = frameData[i - 1].landmarks;
      const curr = frameData[i].landmarks;
      
      // Check eye centers
      if (prev.leftEye.center.x > 0 && curr.leftEye.center.x > 0) {
        const distance = this.euclideanDistance(prev.leftEye.center, curr.leftEye.center);
        stability += distance < 20 ? 1 : 0;
        checks++;
      }
      
      if (prev.rightEye.center.x > 0 && curr.rightEye.center.x > 0) {
        const distance = this.euclideanDistance(prev.rightEye.center, curr.rightEye.center);
        stability += distance < 20 ? 1 : 0;
        checks++;
      }
    }
    
    return checks > 0 ? stability / checks : 0.5;
  }

  /**
   * Helper: Calculate frame similarity
   */
  calculateFrameSimilarity(frame1, frame2) {
    // Compare bounding boxes
    const box1 = frame1.boundingBox;
    const box2 = frame2.boundingBox;
    
    const xDiff = Math.abs(box1[0] - box2[0]);
    const yDiff = Math.abs(box1[1] - box2[1]);
    const widthDiff = Math.abs(box1[2] - box2[2]);
    const heightDiff = Math.abs(box1[3] - box2[3]);
    
    const totalDiff = xDiff + yDiff + widthDiff + heightDiff;
    
    return 1 - Math.min(totalDiff / 100, 1);
  }

  /**
   * Prepare image for Human detection
   * @param {Buffer} imageBuffer - Image buffer
   * @returns {Promise<Canvas>} Canvas with image
   */
  async prepareImage(imageBuffer) {
    try {
      // If imageBuffer is already a Canvas, return it
      if (imageBuffer.getContext) {
        return imageBuffer;
      }
      
      // Convert buffer to image
      const img = await loadImage(imageBuffer);
      
      // Create canvas with image dimensions
      const canvas = createCanvas(img.width, img.height);
      const ctx = canvas.getContext('2d');
      
      // Draw image to canvas
      ctx.drawImage(img, 0, 0);
      
      return canvas;
    } catch (error) {
      console.error('[LivenessDetector] Error preparing image:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const livenessDetector = new LivenessDetector();