#!/usr/bin/env node

// scripts/fixModelNames.js

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MODELS_DIR = path.join(__dirname, '..', 'models', 'face-api');

/**
 * Fix model file names for @vladmandic/face-api
 */
async function fixModelNames() {
  console.log('🔧 Fixing model file names for @vladmandic/face-api');
  console.log('===================================================\n');

  const renamings = [
    // Rename -shard1 files to .bin
    { from: 'ssd_mobilenetv1_model-shard1', to: 'ssd_mobilenetv1_model.bin' },
    { from: 'face_landmark_68_model-shard1', to: 'face_landmark_68_model.bin' },
    { from: 'face_recognition_model-shard1', to: 'face_recognition_model.bin' },
    { from: 'face_expression_model-shard1', to: 'face_expression_model.bin' },
    { from: 'tiny_face_detector_model-shard1', to: 'tiny_face_detector_model.bin' },
    { from: 'age_gender_model-shard1', to: 'age_gender_model.bin' }
  ];

  let renamed = 0;
  let skipped = 0;

  for (const { from, to } of renamings) {
    const fromPath = path.join(MODELS_DIR, from);
    const toPath = path.join(MODELS_DIR, to);

    if (existsSync(fromPath)) {
      // Check if target already exists
      if (existsSync(toPath)) {
        await fs.unlink(toPath);
        console.log(`🗑️  Removed existing: ${to}`);
      }

      await fs.rename(fromPath, toPath);
      console.log(`✅ Renamed: ${from} → ${to}`);
      renamed++;
    } else if (existsSync(toPath)) {
      console.log(`✓ Already correct: ${to}`);
      skipped++;
    } else {
      console.log(`⚠️  Missing: ${from}`);
    }
  }

  console.log(`\n📊 Summary`);
  console.log(`==========`);
  console.log(`✅ Renamed: ${renamed} files`);
  console.log(`✓ Skipped: ${skipped} files (already correct)`);

  // Verify all required files exist
  console.log('\n🔍 Verifying all required models...');
  
  const requiredFiles = [
    'ssd_mobilenetv1_model-weights_manifest.json',
    'ssd_mobilenetv1_model.bin',
    'face_landmark_68_model-weights_manifest.json', 
    'face_landmark_68_model.bin',
    'face_recognition_model-weights_manifest.json',
    'face_recognition_model.bin',
    'face_expression_model-weights_manifest.json',
    'face_expression_model.bin'
  ];

  let allPresent = true;

  for (const file of requiredFiles) {
    const filePath = path.join(MODELS_DIR, file);
    if (existsSync(filePath)) {
      const stats = await fs.stat(filePath);
      const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
      console.log(`✅ ${file} (${sizeMB} MB)`);
    } else {
      console.log(`❌ ${file} - MISSING`);
      allPresent = false;
    }
  }

  if (allPresent) {
    console.log('\n🎉 All models are properly named and ready!');
  } else {
    console.log('\n⚠️  Some models are missing.');
  }
}

// Run the fix
fixModelNames().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});