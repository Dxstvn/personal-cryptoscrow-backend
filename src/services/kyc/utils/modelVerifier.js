// src/services/kyc/utils/modelVerifier.js

import fs from 'fs';
import path from 'path';

/**
 * Model Verifier
 * Checks if face-api.js models are properly loaded
 */
export class ModelVerifier {
  constructor(modelsPath) {
    this.modelsPath = modelsPath;
    this.requiredModels = [
      {
        name: 'ssd_mobilenetv1',
        manifest: 'ssd_mobilenetv1_model-weights_manifest.json',
        weights: ['ssd_mobilenetv1_model-shard1'],
        minSize: 5000000 // 5MB minimum for real model
      },
      {
        name: 'face_landmark_68',
        manifest: 'face_landmark_68_model-weights_manifest.json',
        weights: ['face_landmark_68_model-shard1'],
        minSize: 350000 // 350KB minimum
      },
      {
        name: 'face_recognition',
        manifest: 'face_recognition_model-weights_manifest.json',
        weights: ['face_recognition_model-shard1'],
        minSize: 6000000 // 6MB minimum
      },
      {
        name: 'face_expression',
        manifest: 'face_expression_model-weights_manifest.json',
        weights: ['face_expression_model-shard1'],
        minSize: 300000 // 300KB minimum
      }
    ];
  }

  /**
   * Verify all models
   */
  verifyModels() {
    console.log('[ModelVerifier] Checking face-api.js models...');
    
    const results = {
      valid: true,
      usePlaceholders: false,
      models: {}
    };

    for (const model of this.requiredModels) {
      const modelStatus = this.verifyModel(model);
      results.models[model.name] = modelStatus;
      
      if (!modelStatus.valid || modelStatus.isPlaceholder) {
        results.valid = false;
        results.usePlaceholders = true;
      }
    }

    if (results.usePlaceholders) {
      console.warn('[ModelVerifier] ⚠️  Using placeholder models - face detection will return mock results');
      console.warn('[ModelVerifier] 📥 Download real models from: https://github.com/vladmandic/face-api/tree/main/model');
    } else {
      console.log('[ModelVerifier] ✅ All models verified and ready');
    }

    return results;
  }

  /**
   * Verify individual model
   */
  verifyModel(model) {
    const manifestPath = path.join(this.modelsPath, model.manifest);
    
    // Check manifest exists
    if (!fs.existsSync(manifestPath)) {
      return {
        valid: false,
        exists: false,
        message: `Manifest file not found: ${model.manifest}`
      };
    }

    // Check weights files
    let totalSize = 0;
    for (const weightFile of model.weights) {
      const weightPath = path.join(this.modelsPath, weightFile);
      
      if (!fs.existsSync(weightPath)) {
        return {
          valid: false,
          exists: false,
          message: `Weight file not found: ${weightFile}`
        };
      }
      
      const stats = fs.statSync(weightPath);
      totalSize += stats.size;
    }

    // Check if it's a placeholder
    const isPlaceholder = totalSize < model.minSize;
    
    return {
      valid: true,
      exists: true,
      isPlaceholder,
      size: totalSize,
      message: isPlaceholder 
        ? `Model exists but appears to be a placeholder (${(totalSize / 1024).toFixed(2)} KB)`
        : `Model loaded successfully (${(totalSize / 1024 / 1024).toFixed(2)} MB)`
    };
  }

  /**
   * Get mock face detection result for placeholders
   */
  static getMockDetection() {
    return {
      detection: {
        _score: 0.95,
        _classScore: 0.95,
        _className: 'face',
        _box: {
          _x: 100,
          _y: 100,
          _width: 200,
          _height: 200
        }
      },
      landmarks: {
        _positions: Array(68).fill(null).map((_, i) => ({
          _x: 150 + Math.sin(i) * 50,
          _y: 150 + Math.cos(i) * 50
        })),
        _shift: { _x: 0, _y: 0 }
      },
      expressions: {
        neutral: 0.7,
        happy: 0.2,
        sad: 0.05,
        angry: 0.02,
        fearful: 0.01,
        disgusted: 0.01,
        surprised: 0.01
      }
    };
  }

  /**
   * Get mock liveness result for placeholders
   */
  static getMockLivenessResult() {
    return {
      isLive: true,
      confidence: 0.85,
      checks: {
        blinkDetected: {
          detected: true,
          count: 2,
          confidence: 0.9
        },
        movementDetected: {
          detected: true,
          averageDistance: 15,
          significantCount: 3,
          confidence: 0.8
        },
        expressionChanges: {
          detected: true,
          changes: [
            { frame: 1, expression: 'neutral', change: 0.4 },
            { frame: 3, expression: 'happy', change: 0.3 }
          ],
          averageChange: 0.35,
          confidence: 0.75
        },
        depth3D: {
          score: 0.9,
          confidence: 0.7,
          is3D: true
        },
        textureAnalysis: {
          score: 0.85,
          screenDetected: false,
          paperDetected: false,
          confidence: 0.6
        },
        consistencyScore: 0.88,
        antiSpoofing: {
          staticImage: true,
          videoReplay: true,
          maskDetected: false,
          lightingConsistent: true,
          antiSpoofScore: 0.9
        }
      },
      frameCount: 5,
      recommendation: {
        action: 'accept',
        message: 'Strong liveness indicators detected (using mock detection)'
      }
    };
  }
}

// Export singleton instance
export const modelVerifier = new ModelVerifier(path.join(process.cwd(), 'models', 'face-api'));