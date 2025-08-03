# KYC/AML Integration Test Data

This directory contains test data for comprehensive KYC/AML integration testing.

## Directory Structure

```
test-data/
├── documents/          # Sample identity documents for OCR testing
│   ├── passport_sample_1.jpg
│   ├── passport_sample_2.jpg
│   ├── license_sample_1.jpg
│   ├── national_id_sample_1.jpg
│   └── utility_bill_sample_1.pdf
├── images/             # Sample selfie images for face verification
│   ├── selfie_good_lighting.jpg
│   ├── selfie_poor_lighting.jpg
│   ├── photo_of_photo.jpg (spoof attempt)
│   └── screen_photo.jpg (spoof attempt)
├── samples/            # Test data configurations
│   ├── test-users.json
│   ├── sanctions-test-cases.json
│   └── kyc-scenarios.json
└── README.md
```

## Test Data Categories

### Identity Documents
- **Passport samples**: Various formats and qualities for OCR testing
- **Driver's License**: Different state/country formats
- **National ID**: Multiple country variations
- **Proof of Address**: Utility bills, bank statements (anonymized)

### Face Verification Images
- **Valid selfies**: Good lighting, proper angles
- **Poor quality**: Low light, blurry, tilted
- **Spoof attempts**: Photos of photos, screen captures

### Test Scenarios
- **Basic KYC**: Document-only verification
- **Enhanced KYC**: Document + address + AML screening
- **Full KYC**: Complete pipeline with liveness detection

## Data Privacy & Security

- All test documents are anonymized or synthetic
- No real personal information is stored
- Images are for testing purposes only
- Complies with GDPR and privacy regulations

## Usage in Integration Tests

Test data is loaded dynamically by integration tests:

```javascript
const testData = {
  documents: {
    validPassport: './test-data/documents/passport_sample_1.jpg',
    validLicense: './test-data/documents/license_sample_1.jpg',
    proofOfAddress: './test-data/documents/utility_bill_sample_1.pdf'
  },
  images: {
    validSelfie: './test-data/images/selfie_good_lighting.jpg',
    poorQuality: './test-data/images/selfie_poor_lighting.jpg',
    spoofAttempt: './test-data/images/photo_of_photo.jpg'
  }
};
```

## Adding New Test Data

1. Follow naming conventions: `{type}_sample_{number}.{ext}`
2. Ensure all data is anonymized
3. Update test configurations in `/samples/` directory
4. Document any special requirements or properties