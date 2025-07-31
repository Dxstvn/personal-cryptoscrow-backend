# Face-API.js Models

This directory should contain the face-api.js models for face detection and recognition.

## Required Models

Download the following models from the face-api.js repository:
https://github.com/justadudewhohacks/face-api.js-models

1. **ssd_mobilenetv1_model** - For face detection
   - ssd_mobilenetv1_model-weights_manifest.json
   - ssd_mobilenetv1_model-shard1

2. **face_landmark_68_model** - For facial landmark detection
   - face_landmark_68_model-weights_manifest.json
   - face_landmark_68_model-shard1

3. **face_recognition_model** - For face recognition
   - face_recognition_model-weights_manifest.json
   - face_recognition_model-shard1

4. **face_expression_model** - For expression detection
   - face_expression_model-weights_manifest.json
   - face_expression_model-shard1

## Download Instructions

```bash
# Download models
wget https://github.com/justadudewhohacks/face-api.js-models/raw/master/ssd_mobilenetv1_model-weights_manifest.json
wget https://github.com/justadudewhohacks/face-api.js-models/raw/master/ssd_mobilenetv1_model-shard1

wget https://github.com/justadudewhohacks/face-api.js-models/raw/master/face_landmark_68_model-weights_manifest.json
wget https://github.com/justadudewhohacks/face-api.js-models/raw/master/face_landmark_68_model-shard1

wget https://github.com/justadudewhohacks/face-api.js-models/raw/master/face_recognition_model-weights_manifest.json
wget https://github.com/justadudewhohacks/face-api.js-models/raw/master/face_recognition_model-shard1

wget https://github.com/justadudewhohacks/face-api.js-models/raw/master/face_expression_model-weights_manifest.json
wget https://github.com/justadudewhohacks/face-api.js-models/raw/master/face_expression_model-shard1
```

## Note

These models are required for the face verification service to work properly. Without them, liveness detection and face matching will fail.