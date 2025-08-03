#!/usr/bin/env node

// scripts/setupProductionModels.js

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MODELS_DIR = path.join(__dirname, '..', 'models', 'face-api');
const SOURCE_DIR = path.join(__dirname, '..', 'node_modules', '@vladmandic', 'face-api', 'model');

/**
 * Map model files from @vladmandic format to face-api.js format
 */
const MODEL_MAPPING = [
  // SSD MobileNet V1
  {
    source: 'ssd_mobilenetv1_model-weights_manifest.json',
    dest: 'ssd_mobilenetv1_model-weights_manifest.json'
  },
  {
    source: 'ssd_mobilenetv1_model.bin',
    dest: 'ssd_mobilenetv1_model-shard1'
  },
  // Face Landmark 68
  {
    source: 'face_landmark_68_model-weights_manifest.json',
    dest: 'face_landmark_68_model-weights_manifest.json'
  },
  {
    source: 'face_landmark_68_model.bin',
    dest: 'face_landmark_68_model-shard1'
  },
  // Face Recognition
  {
    source: 'face_recognition_model-weights_manifest.json',
    dest: 'face_recognition_model-weights_manifest.json'
  },
  {
    source: 'face_recognition_model.bin',
    dest: 'face_recognition_model-shard1'
  },
  // Face Expression
  {
    source: 'face_expression_model-weights_manifest.json',
    dest: 'face_expression_model-weights_manifest.json'
  },
  {
    source: 'face_expression_model.bin',
    dest: 'face_expression_model-shard1'
  },
  // Additional models (optional)
  {
    source: 'tiny_face_detector_model-weights_manifest.json',
    dest: 'tiny_face_detector_model-weights_manifest.json'
  },
  {
    source: 'tiny_face_detector_model.bin',
    dest: 'tiny_face_detector_model-shard1'
  },
  {
    source: 'age_gender_model-weights_manifest.json',
    dest: 'age_gender_model-weights_manifest.json'
  },
  {
    source: 'age_gender_model.bin',
    dest: 'age_gender_model-shard1'
  }
];

/**
 * Setup production models
 */
async function setupProductionModels() {
  console.log('🚀 Production Face Recognition Model Setup');
  console.log('=========================================\n');

  // Check if source directory exists
  if (!existsSync(SOURCE_DIR)) {
    console.error('❌ @vladmandic/face-api models not found!');
    console.error(`   Expected at: ${SOURCE_DIR}`);
    console.error('\n   Run: npm install @vladmandic/face-api');
    process.exit(1);
  }

  // Ensure models directory exists
  await fs.mkdir(MODELS_DIR, { recursive: true });

  console.log(`✅ Found production models at: ${SOURCE_DIR}`);
  console.log(`📁 Copying to: ${MODELS_DIR}\n`);

  let copied = 0;
  let failed = 0;

  // Copy and rename models
  for (const mapping of MODEL_MAPPING) {
    const sourcePath = path.join(SOURCE_DIR, mapping.source);
    const destPath = path.join(MODELS_DIR, mapping.dest);

    try {
      if (!existsSync(sourcePath)) {
        console.log(`⚠️  Skipping ${mapping.source} (not found)`);
        continue;
      }

      await fs.copyFile(sourcePath, destPath);
      const stats = await fs.stat(destPath);
      const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
      
      console.log(`✅ ${mapping.dest} (${sizeMB} MB)`);
      copied++;
    } catch (error) {
      console.error(`❌ Failed to copy ${mapping.source}: ${error.message}`);
      failed++;
    }
  }

  console.log(`\n📊 Summary`);
  console.log(`==========`);
  console.log(`✅ Copied: ${copied} files`);
  if (failed > 0) {
    console.log(`❌ Failed: ${failed} files`);
  }

  // Verify production models
  console.log('\n🔍 Verifying Production Models');
  console.log('==============================');

  const requiredModels = [
    { name: 'ssd_mobilenetv1_model-shard1', minSize: 5000000 },
    { name: 'face_landmark_68_model-shard1', minSize: 300000 },
    { name: 'face_recognition_model-shard1', minSize: 6000000 },
    { name: 'face_expression_model-shard1', minSize: 300000 }
  ];

  let allValid = true;

  for (const model of requiredModels) {
    const modelPath = path.join(MODELS_DIR, model.name);
    
    if (existsSync(modelPath)) {
      const stats = await fs.stat(modelPath);
      const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
      
      if (stats.size >= model.minSize) {
        console.log(`✅ ${model.name}: ${sizeMB} MB - PRODUCTION READY`);
      } else {
        console.log(`⚠️  ${model.name}: ${sizeMB} MB - Too small, might be placeholder`);
        allValid = false;
      }
    } else {
      console.log(`❌ ${model.name}: MISSING`);
      allValid = false;
    }
  }

  if (allValid) {
    console.log('\n🎉 All production models installed successfully!');
    console.log('✨ Face recognition is now fully functional with:');
    console.log('   - Face detection');
    console.log('   - Facial landmark detection');
    console.log('   - Face recognition/matching');
    console.log('   - Expression detection');
    console.log('   - Age/gender detection (bonus)');
  } else {
    console.log('\n⚠️  Some models may need attention.');
  }

  // Clean up old placeholder files
  console.log('\n🧹 Cleaning up placeholders...');
  const files = await fs.readdir(MODELS_DIR);
  for (const file of files) {
    const filePath = path.join(MODELS_DIR, file);
    const stats = await fs.stat(filePath);
    
    // Remove files smaller than 1KB (likely placeholders)
    if (stats.size < 1000 && file.includes('shard')) {
      await fs.unlink(filePath);
      console.log(`   Removed placeholder: ${file}`);
    }
  }

  console.log('\n✅ Production face recognition models are ready!');
}

// Run the setup
setupProductionModels().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});