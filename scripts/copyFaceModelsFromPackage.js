#!/usr/bin/env node

// scripts/copyFaceModelsFromPackage.js

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MODELS_DIR = path.join(__dirname, '..', 'models', 'face-api');
const FACE_API_PACKAGE = path.join(__dirname, '..', 'node_modules', 'face-api.js');

/**
 * Copy models from face-api.js package if available
 */
async function copyModelsFromPackage() {
  console.log('🤖 Face-API.js Model Setup');
  console.log('==========================\n');

  // Check if face-api.js package has models
  const packageModelsDir = path.join(FACE_API_PACKAGE, 'weights');
  const altPackageModelsDir = path.join(FACE_API_PACKAGE, 'models');
  
  let sourceDir = null;
  
  if (existsSync(packageModelsDir)) {
    sourceDir = packageModelsDir;
  } else if (existsSync(altPackageModelsDir)) {
    sourceDir = altPackageModelsDir;
  }
  
  if (sourceDir) {
    console.log(`✓ Found models in face-api.js package at: ${sourceDir}`);
    
    try {
      const files = await fs.readdir(sourceDir);
      console.log(`\nCopying ${files.length} files...`);
      
      for (const file of files) {
        const sourcePath = path.join(sourceDir, file);
        const destPath = path.join(MODELS_DIR, file);
        
        await fs.copyFile(sourcePath, destPath);
        console.log(`✓ Copied: ${file}`);
      }
      
      console.log('\n✅ Models copied successfully!');
    } catch (error) {
      console.error('❌ Error copying models:', error.message);
    }
  } else {
    console.log('⚠️  No models found in face-api.js package.');
    console.log('\nThe models we created are minimal placeholders that will allow the code to run.');
    console.log('However, for actual face detection and verification to work properly, you need the real models.\n');
  }
  
  // Verify current models
  console.log('\n📊 Current Models Status:');
  console.log('========================');
  
  const requiredModels = [
    'ssd_mobilenetv1_model-weights_manifest.json',
    'ssd_mobilenetv1_model-shard1',
    'face_landmark_68_model-weights_manifest.json',
    'face_landmark_68_model-shard1',
    'face_recognition_model-weights_manifest.json',
    'face_recognition_model-shard1',
    'face_expression_model-weights_manifest.json',
    'face_expression_model-shard1'
  ];
  
  let allPresent = true;
  
  for (const model of requiredModels) {
    const modelPath = path.join(MODELS_DIR, model);
    const exists = existsSync(modelPath);
    
    if (exists) {
      const stats = await fs.stat(modelPath);
      const size = (stats.size / 1024).toFixed(2);
      console.log(`✓ ${model} (${size} KB)`);
      
      if (stats.size < 1000 && model.includes('shard')) {
        console.log(`  ⚠️  Warning: This appears to be a placeholder file`);
        allPresent = false;
      }
    } else {
      console.log(`✗ ${model} - MISSING`);
      allPresent = false;
    }
  }
  
  if (allPresent) {
    console.log('\n✅ All required model files are present!');
    console.log('\n⚠️  Note: Some files may be placeholders. For production use:');
  } else {
    console.log('\n⚠️  Some model files are missing or are placeholders.');
  }
  
  console.log('\n📥 To get the real models for production:');
  console.log('==========================================');
  console.log('Option 1: Download from @vladmandic/face-api fork:');
  console.log('  https://github.com/vladmandic/face-api/tree/main/model');
  console.log('\nOption 2: Use a different face detection library like:');
  console.log('  - @tensorflow-models/face-detection');
  console.log('  - @mediapipe/face_detection');
  console.log('\nOption 3: For development/testing, the placeholder models will');
  console.log('  allow the code to initialize but won\'t perform actual detection.');
  
  console.log('\n💡 The KYC system will work with these files, but face verification');
  console.log('   will return mock results until real models are loaded.');
}

// Run the script
copyModelsFromPackage().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});