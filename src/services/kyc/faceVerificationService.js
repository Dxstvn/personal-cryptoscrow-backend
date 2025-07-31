// src/services/kyc/faceVerificationService.js

import * as faceapi from 'face-api.js';
import '@tensorflow/tfjs-node';
import { Canvas, Image, ImageData } from 'canvas';
import path from 'path';
import { fileURLToPath } from 'url';

// Set up canvas for face-api.js in Node.js
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Face Verification Service
 * Handles face detection, liveness check, and face matching
 */
export class FaceVerificationService {
  constructor() {
    this.modelsLoaded = false;
    this.modelsPath = path.join(__dirname, '../../../models/face-api');
  }

  /**
   * Initialize face-api models
   */
  async initialize() {
    if (this.modelsLoaded) return;

    try {
      console.log('[FaceVerification] Loading models...');
      
      // Load models
      await Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromDisk(this.modelsPath),
        faceapi.nets.faceLandmark68Net.loadFromDisk(this.modelsPath),
        faceapi.nets.faceRecognitionNet.loadFromDisk(this.modelsPath),
        faceapi.nets.faceExpressionNet.loadFromDisk(this.modelsPath)
      ]);
      
      this.modelsLoaded = true;
      console.log('[FaceVerification] Models loaded successfully');
    } catch (error) {
      console.error('[FaceVerification] Error loading models:', error);
      console.log('[FaceVerification] Note: You need to download face-api.js models and place them in', this.modelsPath);
      throw error;
    }
  }

  /**
   * Verify liveness from a single image (basic checks)
   * In production, you'd want video-based liveness or multiple images
   * @param {Buffer} imageBuffer - Image data
   * @returns {Promise<Object>} Liveness result
   */
  async verifyLiveness(imageBuffer) {
    try {
      await this.initialize();

      // Convert buffer to canvas image
      const img = new Image();
      img.src = imageBuffer;
      
      // Detect faces with landmarks and expressions
      const detections = await faceapi
        .detectAllFaces(img)
        .withFaceLandmarks()
        .withFaceExpressions()
        .withFaceDescriptors();

      if (detections.length === 0) {
        return {
          isLive: false,
          confidence: 0,
          reason: 'No face detected'
        };
      }

      if (detections.length > 1) {
        return {
          isLive: false,
          confidence: 0,
          reason: 'Multiple faces detected'
        };
      }

      const detection = detections[0];
      const livenessChecks = {
        faceDetected: true,
        faceSizeValid: this.checkFaceSize(detection),
        faceCentered: this.checkFaceCentered(detection, img),
        faceQuality: this.checkFaceQuality(detection),
        expressionNatural: this.checkNaturalExpression(detection),
        landmarksValid: this.checkLandmarks(detection),
        lightingConsistent: await this.checkLighting(img, detection)
      };

      // Calculate liveness score
      const passedChecks = Object.values(livenessChecks).filter(v => v).length;
      const totalChecks = Object.keys(livenessChecks).length;
      const confidence = passedChecks / totalChecks;

      // Determine if likely live
      const isLive = confidence >= 0.7;

      return {
        isLive,
        confidence,
        checks: livenessChecks,
        detection: {
          score: detection.detection.score,
          box: detection.detection.box,
          expressions: detection.expressions
        }
      };
    } catch (error) {
      console.error('[FaceVerification] Error verifying liveness:', error);
      throw error;
    }
  }

  /**
   * Compare faces between document photo and selfie
   * @param {Buffer} documentImageBuffer - Document photo
   * @param {Buffer} selfieImageBuffer - Selfie photo
   * @returns {Promise<Object>} Comparison result
   */
  async compareFaces(documentImageBuffer, selfieImageBuffer) {
    try {
      await this.initialize();

      // Process both images
      const [docDescriptor, selfieDescriptor] = await Promise.all([
        this.extractFaceDescriptor(documentImageBuffer),
        this.extractFaceDescriptor(selfieImageBuffer)
      ]);

      if (!docDescriptor || !selfieDescriptor) {
        return {
          isMatch: false,
          similarity: 0,
          error: 'Could not extract face from one or both images'
        };
      }

      // Calculate euclidean distance between face descriptors
      const distance = faceapi.euclideanDistance(
        docDescriptor.descriptor,
        selfieDescriptor.descriptor
      );

      // Convert distance to similarity score (0-1)
      // Typical threshold is 0.6, but we'll use 0.5 for stricter matching
      const similarity = Math.max(0, 1 - distance);
      const threshold = 0.5;
      const isMatch = distance < threshold;

      return {
        isMatch,
        similarity,
        distance,
        threshold,
        documentFace: {
          score: docDescriptor.detection.score,
          box: docDescriptor.detection.box
        },
        selfieFace: {
          score: selfieDescriptor.detection.score,
          box: selfieDescriptor.detection.box
        }
      };
    } catch (error) {
      console.error('[FaceVerification] Error comparing faces:', error);
      throw error;
    }
  }

  /**
   * Extract face descriptor from image
   * @param {Buffer} imageBuffer - Image data
   * @returns {Promise<Object|null>} Face descriptor or null
   */
  async extractFaceDescriptor(imageBuffer) {
    try {
      const img = new Image();
      img.src = imageBuffer;

      const detections = await faceapi
        .detectAllFaces(img)
        .withFaceLandmarks()
        .withFaceDescriptors();

      if (detections.length === 0) {
        return null;
      }

      // Use the face with highest detection score
      const bestDetection = detections.reduce((prev, current) => 
        prev.detection.score > current.detection.score ? prev : current
      );

      return {
        descriptor: bestDetection.descriptor,
        detection: bestDetection.detection,
        landmarks: bestDetection.landmarks
      };
    } catch (error) {
      console.error('[FaceVerification] Error extracting face descriptor:', error);
      return null;
    }
  }

  /**
   * Check if face size is appropriate
   */
  checkFaceSize(detection) {
    const { width, height } = detection.detection.box;
    const area = width * height;
    
    // Face should occupy reasonable portion of image
    // Typically 10-60% of image area
    const minArea = 0.1;
    const maxArea = 0.6;
    
    // Assuming standard selfie dimensions
    const imageArea = 640 * 480; // This should be dynamic based on actual image
    const faceRatio = area / imageArea;
    
    return faceRatio >= minArea && faceRatio <= maxArea;
  }

  /**
   * Check if face is centered in image
   */
  checkFaceCentered(detection, image) {
    const { x, y, width, height } = detection.detection.box;
    const faceCenterX = x + width / 2;
    const faceCenterY = y + height / 2;
    
    const imageCenterX = image.width / 2;
    const imageCenterY = image.height / 2;
    
    // Calculate deviation from center (as percentage)
    const deviationX = Math.abs(faceCenterX - imageCenterX) / image.width;
    const deviationY = Math.abs(faceCenterY - imageCenterY) / image.height;
    
    // Face should be within 20% of center
    return deviationX < 0.2 && deviationY < 0.2;
  }

  /**
   * Check face quality based on detection score
   */
  checkFaceQuality(detection) {
    // High confidence detection indicates good quality
    return detection.detection.score > 0.9;
  }

  /**
   * Check for natural expression
   */
  checkNaturalExpression(detection) {
    const expressions = detection.expressions;
    
    // Check if expression is too extreme (might indicate printed photo)
    const maxExpression = Math.max(...Object.values(expressions));
    
    // Natural faces usually have mixed expressions, not 100% of one
    return maxExpression < 0.95;
  }

  /**
   * Validate facial landmarks
   */
  checkLandmarks(detection) {
    const landmarks = detection.landmarks;
    const positions = landmarks.positions;
    
    // Check if all 68 landmarks were detected
    if (positions.length !== 68) {
      return false;
    }
    
    // Check for reasonable landmark positions
    // Eyes should be above nose, nose above mouth, etc.
    const leftEye = positions[36]; // Left eye corner
    const rightEye = positions[45]; // Right eye corner
    const nose = positions[30]; // Nose tip
    const mouth = positions[48]; // Left mouth corner
    
    const eyesAboveNose = (leftEye.y < nose.y) && (rightEye.y < nose.y);
    const noseAboveMouth = nose.y < mouth.y;
    
    return eyesAboveNose && noseAboveMouth;
  }

  /**
   * Check lighting consistency (basic check)
   */
  async checkLighting(image, detection) {
    // TODO: Implement proper lighting analysis
    // For now, check if face region has reasonable brightness
    
    // This is a placeholder - in production you'd analyze:
    // - Histogram distribution
    // - Shadow patterns
    // - Specular highlights that might indicate screen/photo
    
    return true;
  }

  /**
   * Detect potential spoofing attempts
   * @param {Buffer[]} imageSequence - Array of image buffers (for motion detection)
   */
  async detectSpoofing(imageSequence) {
    if (!imageSequence || imageSequence.length < 2) {
      return {
        isSpoofing: false,
        confidence: 0,
        reason: 'Insufficient images for spoofing detection'
      };
    }

    try {
      await this.initialize();

      // Extract face descriptors from all images
      const descriptors = await Promise.all(
        imageSequence.map(img => this.extractFaceDescriptor(img))
      );

      // Check for movement between frames
      const movements = [];
      for (let i = 1; i < descriptors.length; i++) {
        if (descriptors[i - 1] && descriptors[i]) {
          const prevBox = descriptors[i - 1].detection.box;
          const currBox = descriptors[i].detection.box;
          
          const movement = {
            x: Math.abs(currBox.x - prevBox.x),
            y: Math.abs(currBox.y - prevBox.y),
            width: Math.abs(currBox.width - prevBox.width),
            height: Math.abs(currBox.height - prevBox.height)
          };
          
          movements.push(movement);
        }
      }

      // Calculate total movement
      const totalMovement = movements.reduce((sum, m) => 
        sum + m.x + m.y + m.width + m.height, 0
      );

      // Check for natural movement patterns
      const hasNaturalMovement = totalMovement > 10 && totalMovement < 100;

      // Check expression changes
      const expressionChanges = await this.checkExpressionChanges(imageSequence);

      // Determine if likely spoofing
      const spoofingIndicators = {
        noMovement: totalMovement < 5,
        excessiveMovement: totalMovement > 200,
        staticExpression: !expressionChanges,
        inconsistentFaces: descriptors.some(d => !d)
      };

      const spoofingCount = Object.values(spoofingIndicators).filter(v => v).length;
      const isSpoofing = spoofingCount >= 2;

      return {
        isSpoofing,
        confidence: spoofingCount / Object.keys(spoofingIndicators).length,
        indicators: spoofingIndicators,
        totalMovement
      };
    } catch (error) {
      console.error('[FaceVerification] Error detecting spoofing:', error);
      throw error;
    }
  }

  /**
   * Check for expression changes across image sequence
   */
  async checkExpressionChanges(imageSequence) {
    try {
      const expressions = await Promise.all(
        imageSequence.map(async (img) => {
          const imgElement = new Image();
          imgElement.src = img;
          
          const detection = await faceapi
            .detectSingleFace(imgElement)
            .withFaceExpressions();
          
          return detection?.expressions || null;
        })
      );

      // Check if expressions change between frames
      let hasChanges = false;
      for (let i = 1; i < expressions.length; i++) {
        if (expressions[i - 1] && expressions[i]) {
          const prevDominant = this.getDominantExpression(expressions[i - 1]);
          const currDominant = this.getDominantExpression(expressions[i]);
          
          if (prevDominant !== currDominant) {
            hasChanges = true;
            break;
          }
        }
      }

      return hasChanges;
    } catch (error) {
      console.error('[FaceVerification] Error checking expression changes:', error);
      return false;
    }
  }

  /**
   * Get dominant expression from expression scores
   */
  getDominantExpression(expressions) {
    return Object.entries(expressions).reduce((a, b) => 
      expressions[a[0]] > expressions[b[0]] ? a : b
    )[0];
  }
}

// Export singleton instance
export const faceVerifier = new FaceVerificationService();