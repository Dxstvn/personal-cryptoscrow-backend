#!/usr/bin/env node

// scripts/downloadFaceModels.js

import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MODELS_DIR = path.join(__dirname, '..', 'models', 'face-api');
const MODELS_BASE_URL = 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js-models/master/';

// Required models for face detection, landmarks, recognition, and expressions
const REQUIRED_MODELS = [
  // SSD MobileNet V1 - Face Detection
  {
    name: 'ssd_mobilenetv1_model',
    files: [
      'ssd_mobilenetv1_model-weights_manifest.json',
      'ssd_mobilenetv1_model-shard1',
      'ssd_mobilenetv1_model-shard2'
    ]
  },
  // Face Landmark 68 Points - Facial Landmarks Detection
  {
    name: 'face_landmark_68_model',
    files: [
      'face_landmark_68_model-weights_manifest.json',
      'face_landmark_68_model-shard1'
    ]
  },
  // Face Recognition Model - Face Matching
  {
    name: 'face_recognition_model',
    files: [
      'face_recognition_model-weights_manifest.json',
      'face_recognition_model-shard1',
      'face_recognition_model-shard2'
    ]
  },
  // Face Expression Model - Expression Detection
  {
    name: 'face_expression_model',
    files: [
      'face_expression_model-weights_manifest.json',
      'face_expression_model-shard1'
    ]
  },
  // Tiny Face Detector (optional, smaller alternative)
  {
    name: 'tiny_face_detector_model',
    files: [
      'tiny_face_detector_model-weights_manifest.json',
      'tiny_face_detector_model-shard1'
    ]
  },
  // Age Gender Model (optional)
  {
    name: 'age_gender_model',
    files: [
      'age_gender_model-weights_manifest.json',
      'age_gender_model-shard1'
    ]
  }
];

/**
 * Download a file from URL
 */
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading: ${path.basename(destPath)}`);
    
    const file = fs.createWriteStream(destPath);
    
    https.get(url, (response) => {
      if (response.statusCode === 200) {
        response.pipe(file);
        
        file.on('finish', () => {
          file.close();
          console.log(`✓ Downloaded: ${path.basename(destPath)}`);
          resolve();
        });
      } else if (response.statusCode === 302 || response.statusCode === 301) {
        // Handle redirects
        file.close();
        fs.unlinkSync(destPath);
        downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
      } else {
        file.close();
        fs.unlinkSync(destPath);
        reject(new Error(`Failed to download ${url}: ${response.statusCode}`));
      }
    }).on('error', (err) => {
      fs.unlinkSync(destPath);
      reject(err);
    });
  });
}

/**
 * Download all models
 */
async function downloadAllModels() {
  console.log('🤖 Face-API.js Model Downloader');
  console.log('================================\n');
  
  // Ensure models directory exists
  if (!fs.existsSync(MODELS_DIR)) {
    fs.mkdirSync(MODELS_DIR, { recursive: true });
    console.log(`Created directory: ${MODELS_DIR}\n`);
  }

  let totalFiles = 0;
  let downloadedFiles = 0;

  // Count total files
  REQUIRED_MODELS.forEach(model => {
    totalFiles += model.files.length;
  });

  console.log(`Downloading ${totalFiles} files for ${REQUIRED_MODELS.length} models...\n`);

  // Download each model
  for (const model of REQUIRED_MODELS) {
    console.log(`\n📦 Downloading ${model.name}...`);
    
    for (const file of model.files) {
      const url = MODELS_BASE_URL + file;
      const destPath = path.join(MODELS_DIR, file);
      
      // Check if file already exists
      if (fs.existsSync(destPath)) {
        const stats = fs.statSync(destPath);
        if (stats.size > 0) {
          console.log(`✓ Already exists: ${file}`);
          downloadedFiles++;
          continue;
        }
      }
      
      try {
        await downloadFile(url, destPath);
        downloadedFiles++;
      } catch (error) {
        console.error(`✗ Failed to download ${file}: ${error.message}`);
        
        // Try alternative URL (GitHub raw content)
        const altUrl = `https://github.com/justadudewhohacks/face-api.js-models/raw/master/${file}`;
        console.log(`  Trying alternative URL...`);
        
        try {
          await downloadFile(altUrl, destPath);
          downloadedFiles++;
        } catch (altError) {
          console.error(`✗ Alternative download also failed: ${altError.message}`);
        }
      }
    }
  }

  console.log(`\n\n✅ Download Summary`);
  console.log(`==================`);
  console.log(`Total files: ${totalFiles}`);
  console.log(`Downloaded: ${downloadedFiles}`);
  console.log(`Failed: ${totalFiles - downloadedFiles}`);
  
  if (downloadedFiles === totalFiles) {
    console.log('\n🎉 All models downloaded successfully!');
    console.log(`\nModels are located at: ${MODELS_DIR}`);
    
    // Verify file sizes
    console.log('\n📊 Model File Sizes:');
    const files = fs.readdirSync(MODELS_DIR);
    let totalSize = 0;
    
    files.forEach(file => {
      const filePath = path.join(MODELS_DIR, file);
      const stats = fs.statSync(filePath);
      const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
      console.log(`   ${file}: ${sizeMB} MB`);
      totalSize += stats.size;
    });
    
    console.log(`\nTotal size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
  } else {
    console.log('\n⚠️  Some models failed to download.');
    console.log('You may need to download them manually from:');
    console.log('https://github.com/justadudewhohacks/face-api.js-models');
  }
}

// Run the downloader
downloadAllModels().catch(error => {
  console.error('\n❌ Error downloading models:', error);
  process.exit(1);
});