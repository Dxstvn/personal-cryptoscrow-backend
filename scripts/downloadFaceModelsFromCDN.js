#!/usr/bin/env node

// scripts/downloadFaceModelsFromCDN.js

import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MODELS_DIR = path.join(__dirname, '..', 'models', 'face-api');

// Alternative CDN source for face-api.js models
const CDN_BASE_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model/';

// Required models with CDN paths
const REQUIRED_MODELS = [
  // SSD MobileNet V1 - Face Detection
  {
    name: 'ssd_mobilenetv1_model',
    files: [
      { 
        url: 'ssd_mobilenetv1_model-weights_manifest.json',
        dest: 'ssd_mobilenetv1_model-weights_manifest.json'
      },
      { 
        url: 'ssd_mobilenetv1_model.weights',
        dest: 'ssd_mobilenetv1_model-shard1'
      }
    ]
  },
  // Face Landmark 68 Points - Facial Landmarks Detection
  {
    name: 'face_landmark_68_model',
    files: [
      {
        url: 'face_landmark_68_model-weights_manifest.json',
        dest: 'face_landmark_68_model-weights_manifest.json'
      },
      {
        url: 'face_landmark_68_model.weights',
        dest: 'face_landmark_68_model-shard1'
      }
    ]
  },
  // Face Recognition Model - Face Matching
  {
    name: 'face_recognition_model',
    files: [
      {
        url: 'face_recognition_model-weights_manifest.json',
        dest: 'face_recognition_model-weights_manifest.json'
      },
      {
        url: 'face_recognition_model.weights',
        dest: 'face_recognition_model-shard1'
      }
    ]
  },
  // Face Expression Model - Expression Detection
  {
    name: 'face_expression_model',
    files: [
      {
        url: 'face_expression_model-weights_manifest.json',
        dest: 'face_expression_model-weights_manifest.json'
      },
      {
        url: 'face_expression_model.weights',
        dest: 'face_expression_model-shard1'
      }
    ]
  }
];

/**
 * Download a file from URL with progress tracking
 */
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading: ${path.basename(destPath)}`);
    
    const file = fs.createWriteStream(destPath);
    let downloadedBytes = 0;
    
    https.get(url, (response) => {
      if (response.statusCode === 200) {
        const totalBytes = parseInt(response.headers['content-length'], 10);
        
        response.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          if (totalBytes) {
            const percent = ((downloadedBytes / totalBytes) * 100).toFixed(1);
            process.stdout.write(`\r  Progress: ${percent}% (${(downloadedBytes / 1024 / 1024).toFixed(2)} MB)`);
          }
        });
        
        response.pipe(file);
        
        file.on('finish', () => {
          file.close();
          console.log(`\n✓ Downloaded: ${path.basename(destPath)}`);
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
      if (fs.existsSync(destPath)) {
        fs.unlinkSync(destPath);
      }
      reject(err);
    });
  });
}

/**
 * Alternative: Create a minimal model set for testing
 */
async function createMinimalModels() {
  console.log('\n📝 Creating minimal model files for testing...');
  
  // Create minimal manifest files
  const minimalManifest = {
    "format": "layers-model",
    "generatedBy": "test",
    "convertedBy": "test",
    "modelTopology": {
      "class_name": "Model",
      "config": {}
    },
    "weightsManifest": [{
      "paths": ["shard1"],
      "weights": []
    }]
  };
  
  const models = [
    'ssd_mobilenetv1_model',
    'face_landmark_68_model',
    'face_recognition_model',
    'face_expression_model'
  ];
  
  for (const model of models) {
    const manifestPath = path.join(MODELS_DIR, `${model}-weights_manifest.json`);
    const weightsPath = path.join(MODELS_DIR, `${model}-shard1`);
    
    // Write manifest
    fs.writeFileSync(manifestPath, JSON.stringify(minimalManifest, null, 2));
    console.log(`✓ Created: ${model}-weights_manifest.json`);
    
    // Create empty weights file
    fs.writeFileSync(weightsPath, Buffer.alloc(100));
    console.log(`✓ Created: ${model}-shard1`);
  }
  
  console.log('\n⚠️  Note: These are minimal placeholder files.');
  console.log('For production use, you need to download the actual models.');
}

/**
 * Download all models
 */
async function downloadAllModels() {
  console.log('🤖 Face-API.js Model Downloader (CDN Version)');
  console.log('=============================================\n');
  
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

  console.log(`Attempting to download ${totalFiles} files for ${REQUIRED_MODELS.length} models from CDN...\n`);

  // Try downloading from CDN
  for (const model of REQUIRED_MODELS) {
    console.log(`\n📦 Downloading ${model.name}...`);
    
    for (const file of model.files) {
      const url = CDN_BASE_URL + file.url;
      const destPath = path.join(MODELS_DIR, file.dest);
      
      // Check if file already exists
      if (fs.existsSync(destPath)) {
        const stats = fs.statSync(destPath);
        if (stats.size > 1000) { // More than 1KB
          console.log(`✓ Already exists: ${file.dest}`);
          downloadedFiles++;
          continue;
        }
      }
      
      try {
        await downloadFile(url, destPath);
        downloadedFiles++;
      } catch (error) {
        console.error(`✗ Failed to download ${file.dest}: ${error.message}`);
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
    console.log('\n⚠️  CDN download failed. Creating minimal models for development...');
    await createMinimalModels();
    
    console.log('\n📌 Manual Download Instructions:');
    console.log('==================================');
    console.log('1. Visit: https://github.com/vladmandic/face-api/tree/main/model');
    console.log('2. Download the following files:');
    console.log('   - ssd_mobilenetv1_model-weights_manifest.json');
    console.log('   - ssd_mobilenetv1_model.weights');
    console.log('   - face_landmark_68_model-weights_manifest.json');
    console.log('   - face_landmark_68_model.weights');
    console.log('   - face_recognition_model-weights_manifest.json');
    console.log('   - face_recognition_model.weights');
    console.log('   - face_expression_model-weights_manifest.json');
    console.log('   - face_expression_model.weights');
    console.log(`3. Place them in: ${MODELS_DIR}`);
    console.log('4. Rename .weights files to -shard1 (e.g., ssd_mobilenetv1_model.weights → ssd_mobilenetv1_model-shard1)');
  }
}

// Run the downloader
downloadAllModels().catch(error => {
  console.error('\n❌ Error downloading models:', error);
  process.exit(1);
});