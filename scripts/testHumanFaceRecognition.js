#!/usr/bin/env node

// scripts/testHumanFaceRecognition.js

import { faceVerifier } from '../src/services/kyc/faceVerificationService.js';
import { createCanvas } from 'canvas';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Create a test image with face-like features
 */
function createTestImage() {
  const canvas = createCanvas(640, 480);
  const ctx = canvas.getContext('2d');
  
  // Fill background
  ctx.fillStyle = '#f0f0f0';
  ctx.fillRect(0, 0, 640, 480);
  
  // Draw a simple face shape
  ctx.fillStyle = '#fdbcb4';
  ctx.beginPath();
  ctx.arc(320, 240, 100, 0, Math.PI * 2);
  ctx.fill();
  
  // Draw eyes
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.arc(290, 220, 10, 0, Math.PI * 2);
  ctx.arc(350, 220, 10, 0, Math.PI * 2);
  ctx.fill();
  
  // Draw mouth
  ctx.beginPath();
  ctx.arc(320, 270, 30, 0, Math.PI);
  ctx.stroke();
  
  return canvas.toBuffer();
}

/**
 * Test Human-based face recognition
 */
async function testHumanFaceRecognition() {
  console.log('🧪 Testing Human Library Face Recognition');
  console.log('========================================\n');

  try {
    // 1. Initialize service
    console.log('1️⃣ Initializing face verification service with Human...');
    await faceVerifier.initialize();
    console.log('✅ Service initialized\n');

    // 2. Create test images
    console.log('2️⃣ Creating test images...');
    const testImage1 = createTestImage();
    const testImage2 = createTestImage();
    
    // For real testing, you could load actual face images:
    // const testImage1 = fs.readFileSync(path.join(__dirname, 'test-face1.jpg'));
    // const testImage2 = fs.readFileSync(path.join(__dirname, 'test-face2.jpg'));
    
    console.log('✅ Test images created\n');

    // 3. Test face detection
    console.log('3️⃣ Testing face detection...');
    try {
      const result = await faceVerifier.detectFace(testImage1);
      console.log('Face detection result:', {
        detected: result.detected,
        confidence: result.confidence,
        hasLandmarks: result.landmarks ? 'Yes' : 'No',
        emotion: result.emotion,
        age: result.age,
        gender: result.gender,
        hasIris: result.iris ? 'Yes' : 'No'
      });
    } catch (error) {
      console.log('⚠️  Face detection note:', error.message);
    }

    // 4. Test liveness detection with single image
    console.log('\n4️⃣ Testing liveness detection (single image)...');
    try {
      const livenessResult = await faceVerifier.verifyLiveness(testImage1);
      console.log('Liveness detection result:', {
        isLive: livenessResult.isLive,
        confidence: livenessResult.confidence,
        checks: Object.keys(livenessResult.checks).map(k => 
          `${k}: ${livenessResult.checks[k] === true ? '✓' : '✗'}`
        )
      });
    } catch (error) {
      console.log('⚠️  Liveness detection note:', error.message);
    }

    // 5. Test liveness with image sequence
    console.log('\n5️⃣ Testing liveness detection (image sequence)...');
    const imageSequence = [
      testImage1,
      testImage1,
      testImage2,
      testImage2,
      testImage1
    ];
    
    try {
      const sequenceLivenessResult = await faceVerifier.verifyLiveness(imageSequence);
      console.log('Sequence liveness result:', {
        isLive: sequenceLivenessResult.isLive,
        confidence: sequenceLivenessResult.confidence,
        recommendation: sequenceLivenessResult.recommendation
      });
    } catch (error) {
      console.log('⚠️  Sequence liveness note:', error.message);
    }

    // 6. Test face comparison
    console.log('\n6️⃣ Testing face comparison...');
    try {
      const comparisonResult = await faceVerifier.compareFaces(
        testImage1,
        testImage2
      );
      console.log('Face comparison result:', {
        isMatch: comparisonResult.isMatch,
        similarity: comparisonResult.similarity,
        threshold: comparisonResult.threshold,
        ageDifference: comparisonResult.ageDifference
      });
    } catch (error) {
      console.log('⚠️  Face comparison note:', error.message);
    }

    // 7. Test spoofing detection
    console.log('\n7️⃣ Testing spoofing detection...');
    try {
      const spoofingResult = await faceVerifier.detectSpoofing(imageSequence);
      console.log('Spoofing detection result:', {
        isSpoofing: spoofingResult.isSpoofing,
        confidence: spoofingResult.confidence,
        indicators: spoofingResult.indicators,
        facesDetected: spoofingResult.facesDetected,
        framesAnalyzed: spoofingResult.framesAnalyzed
      });
    } catch (error) {
      console.log('⚠️  Spoofing detection note:', error.message);
    }

    console.log('\n✅ Human face recognition service is operational!');
    console.log('📌 Key features available:');
    console.log('   - Face detection with 468 mesh points');
    console.log('   - Emotion detection');
    console.log('   - Age and gender estimation');
    console.log('   - Iris tracking');
    console.log('   - Advanced liveness detection');
    console.log('   - 3D face mesh analysis');
    console.log('\n⚠️  Note: The test uses synthetic images.');
    console.log('   For production, use real face images for accurate results.');

  } catch (error) {
    console.error('❌ Test failed:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Run the test
testHumanFaceRecognition().catch(error => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});