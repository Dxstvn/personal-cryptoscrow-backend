#!/usr/bin/env node

// scripts/testHumanNodeJS.js

import { Human } from '@vladmandic/human';
import { createCanvas, loadImage } from 'canvas';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Test Human library directly in Node.js
 */
async function testHumanNodeJS() {
  console.log('🧪 Testing Human Library in Node.js');
  console.log('===================================\n');

  // Configure Human for Node.js
  const config = {
    backend: 'tensorflow', // Use tensorflow backend for Node.js
    async: true,
    warmup: 'none', // Disable warmup for testing
    debug: true,
    modelBasePath: 'https://cdn.jsdelivr.net/npm/@vladmandic/human/models/',
    face: {
      enabled: true,
      detector: { rotation: false, return: true },
      mesh: { enabled: true },
      iris: { enabled: false },
      description: { enabled: true },
      emotion: { enabled: true },
      age: { enabled: true },
      gender: { enabled: true },
      antispoof: { enabled: true },
      liveness: { enabled: true }
    },
    body: { enabled: false },
    hand: { enabled: false },
    object: { enabled: false },
    gesture: { enabled: false }
  };

  try {
    // 1. Initialize Human
    console.log('1️⃣ Initializing Human library...');
    const human = new Human(config);
    
    // Load models
    await human.load();
    console.log('✅ Models loaded');
    
    // Get backend info
    console.log('📊 Backend:', human.tf.getBackend());
    console.log('📊 Environment:', human.env);
    
    // 2. Create a test image
    console.log('\n2️⃣ Creating test image...');
    const canvas = createCanvas(640, 480);
    const ctx = canvas.getContext('2d');
    
    // Draw a face-like shape
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
    
    // 3. Test face detection
    console.log('\n3️⃣ Testing face detection...');
    const result = await human.detect(canvas);
    
    console.log('Detection results:', {
      face: result.face ? result.face.length : 0,
      persons: result.persons ? result.persons.length : 0,
      performance: result.performance
    });
    
    if (result.face && result.face.length > 0) {
      const face = result.face[0];
      console.log('\nFace details:', {
        score: face.score,
        box: face.box,
        age: face.age,
        gender: face.gender,
        genderScore: face.genderScore,
        emotion: face.emotion ? face.emotion[0] : null,
        embedding: face.embedding ? 'Present' : 'Not present',
        antispoof: face.antispoof,
        liveness: face.liveness,
        mesh: face.mesh ? face.mesh.length : 0
      });
    }
    
    // 4. Test with real image if available
    const testImagePath = path.join(__dirname, '..', 'test-data', 'test-face.jpg');
    try {
      await fs.access(testImagePath);
      console.log('\n4️⃣ Testing with real image...');
      
      const img = await loadImage(testImagePath);
      const imgCanvas = createCanvas(img.width, img.height);
      const imgCtx = imgCanvas.getContext('2d');
      imgCtx.drawImage(img, 0, 0);
      
      const realResult = await human.detect(imgCanvas);
      console.log('Real image results:', {
        face: realResult.face ? realResult.face.length : 0,
        performance: realResult.performance
      });
    } catch (error) {
      console.log('\n4️⃣ No test image found at:', testImagePath);
      console.log('   Place a test-face.jpg in test-data/ folder for real image testing');
    }
    
    // 5. Test face similarity
    console.log('\n5️⃣ Testing face similarity...');
    const canvas2 = createCanvas(640, 480);
    const ctx2 = canvas2.getContext('2d');
    
    // Draw slightly different face
    ctx2.fillStyle = '#fdbcb4';
    ctx2.beginPath();
    ctx2.arc(320, 240, 95, 0, Math.PI * 2);
    ctx2.fill();
    
    ctx2.fillStyle = '#000000';
    ctx2.beginPath();
    ctx2.arc(295, 225, 10, 0, Math.PI * 2);
    ctx2.arc(345, 225, 10, 0, Math.PI * 2);
    ctx2.fill();
    
    const result2 = await human.detect(canvas2);
    
    if (result.face && result.face[0] && result.face[0].embedding &&
        result2.face && result2.face[0] && result2.face[0].embedding) {
      const similarity = human.match(
        result.face[0].embedding,
        result2.face[0].embedding
      );
      console.log('Face similarity:', similarity);
    } else {
      console.log('Could not calculate similarity - embeddings not available');
    }
    
    console.log('\n✅ Human library test completed!');
    console.log('📌 Key findings:');
    console.log('   - Backend:', human.tf.getBackend());
    console.log('   - Models loaded:', Object.keys(human.models).filter(m => human.models[m]).join(', '));
    console.log('   - Face detection:', result.face ? 'Working' : 'Not working');
    console.log('   - Performance:', result.performance);

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Run the test
testHumanNodeJS().catch(error => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});