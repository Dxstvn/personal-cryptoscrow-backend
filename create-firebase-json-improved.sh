#!/bin/bash

echo "Creating Firebase service account JSON file..."

# Function to install jq if needed
install_jq_if_needed() {
    if ! command -v jq &> /dev/null; then
        echo "📦 jq not found. Installing jq..."
        if command -v yum &> /dev/null; then
            sudo yum install -y jq
        elif command -v dnf &> /dev/null; then
            sudo dnf install -y jq
        elif command -v apt-get &> /dev/null; then
            sudo apt-get update && sudo apt-get install -y jq
        else
            echo "⚠️  Could not install jq automatically. Please install it manually."
            echo "   For Amazon Linux: sudo yum install -y jq"
            return 1
        fi
        
        if command -v jq &> /dev/null; then
            echo "✅ jq installed successfully"
        else
            echo "❌ Failed to install jq"
            return 1
        fi
    fi
}

# Create the JSON file with proper formatting
cat > firebase-service-account.json << 'FIREBASE_JSON'
{
  "type": "service_account",
  "project_id": "ethescrow-377c6",
  "private_key_id": "195f5680fcc9732272ed4b950ee47bca96c02df5",
  "private_key": "-----BEGIN PRIVATE KEY-----\\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQCUTnIMpNPabb5A\\nUJ+HnvAS8Mswus4PktHyD1NtBxjpqDk7Zhmorca8V0wPyyptcIhinCZonKYrRKin\\naERl20e4LdOzzbdleDnrunZq3n4BlHNZLFLG9oiby1yQKdO163V20bzVXJtJHjlD\\nIlq+ybxPsAdCyiCefNE2ARGdllIEMl5qbwMcsqzAMVhJdtS3V8zwnuGhLfXpvdJi\\n65TMUhpWsLVGQeZi/NH2lI9UtXfo6iMFOW6ZgFq2jIFPJtaFeCKAClJawuJYajd0\\ntmJfjydkR/UsjOMfLaML8wzhfVRyeShazd6UJBAuyEbFoiaNAqnnH5zHKhpnAkSm\\nzXeSd985AgMBAAECggEAFSsvT0u1q59vgQmhA8A1f1acgiuf3wwzaGw0mcLiFPP8\\nm1RjBDctv1NsmXKD71QZO44TU2pMs69crWyOGsXWcl0kMy2BaHvlNJcMcQuqC7qv\\nTkKr3Bdzf11jLHaz7+sYfKnKXOAXkDO+s6zzK/lqpis3lhp41nZ1fFJhu88pjMyW\\nEIMIkeBa10/bK/HsFfXHD2n4iCvvkOQbkC2Sz86jLiGYEZ7WDaxxi+890ehOz1ZX\\nI25cHU1FtlsnDKx9q5p4f//nfWU3gWbMmqgThvYbEthJpafuKDZary5alqKhergI\\nxN5B1q7/Bf0EBvtFv6yQXQhVGKXZOWKz57GPk3n9ewKBgQDKQ4Qbi3O6pHtXo5Ch\\nMUcYjwMRruIAmxcR8Uh1JtryyBj694wGwI0VTa4ue4Zqpwkqeedx3lqPXMdeeDch\\neoWtgg4XcRIhK0R/ONmil6YCbEUbOEw4wixo9RbvLHQl20nygylgdQ0pSzrduDaO\\nndKbQ0j5COA90tfkRzT/6Pa9IwKBgQC7tSb/ygiQAiiurVcg2WnnurMPxmNWHvli\\n2zakn5xDi6uvp/EJAy1afFpgwx916qTY6i+yHKFXDZzebZZ/JE/ep7AHQ5jyzWIz\\nEdKJUg2ffXC6Zu4JlMcFa+Z0BXzGZY4MngyMU4c42hwgU3TnzhDROhbBfcKCqOJM\\nfpbN65s98wKBgQC9dK5qyp3VZrot5gTUJ/9LTrH2P1RsctkSMmrHaWTO4oUblwJv\\nVK8SFFgiLAxFHD7mrZcQPtGe1a3dnEcvsb9DPb4LURtFPG0Fqe+Zb+jM/jNhAsPK\\nqn7EtUYNNBt7VkOWyCraselpE5GJG0LnJYefbVAODLVW04bryZMoXkO39wKBgBDP\\nRz/O6vdiihwif9P8RGSxLonyHUFAIts8gGc7t/XAk052vros46nfywQxVSbtLXgT\\neNP9hmFSYcL1k22tZc2tvLDZ19+ejvW92dncVEX9KNQ4lYacITqWEBxBxYvK2m68\\n1KjYbhqkRbKLZsO/i3gBOLp5NasXzrRE/eJRACULAoGBAMiTwGSi5TMGY0ubnQpT\\njziIKf+HCRQZP122D7bpJOr6wkMRlDPRTCvEok+BuRJ8+K6WpA76MRMqOaJ5RIJO\\n/YX3tFv3nehPIHk2RaBy4YhCZOyxxA0LHMChYu9y56gxrDp3HbX7Qs8vUH88WadV\\nvFDYdqEE3eB35dFcbQyFFEoZ\\n-----END PRIVATE KEY-----\\n",
  "client_email": "firebase-adminsdk-fbsvc@ethescrow-377c6.iam.gserviceaccount.com",
  "client_id": "107747821697642800148",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40ethescrow-377c6.iam.gserviceaccount.com",
  "universe_domain": "googleapis.com"
}
FIREBASE_JSON

echo "✅ Firebase service account JSON file created: firebase-service-account.json"

# Basic validation without jq first
echo "🔍 Performing basic JSON format validation..."

# Check if file was created and has content
if [ ! -s firebase-service-account.json ]; then
    echo "❌ JSON file was not created or is empty!"
    exit 1
fi

# Basic syntax check - ensure it starts with { and ends with }
FIRST_CHAR=$(head -c 1 firebase-service-account.json)
LAST_CHAR=$(tail -c 2 firebase-service-account.json | head -c 1)

if [ "$FIRST_CHAR" != "{" ] || [ "$LAST_CHAR" != "}" ]; then
    echo "❌ JSON file doesn't have proper structure (should start with { and end with })"
    exit 1
fi

# Check for required fields using grep
REQUIRED_FIELDS=("project_id" "private_key" "client_email" "type")
for field in "${REQUIRED_FIELDS[@]}"; do
    if ! grep -q "\"$field\"" firebase-service-account.json; then
        echo "❌ Missing required field: $field"
        exit 1
    fi
done

echo "✅ Basic JSON structure validation passed!"

# Try to install and use jq for proper validation
echo "🔍 Attempting advanced JSON validation with jq..."
if install_jq_if_needed; then
    if jq . firebase-service-account.json > /dev/null 2>&1; then
        echo "✅ Advanced JSON validation passed!"
        
        # Extract key information
        PROJECT_ID=$(jq -r '.project_id' firebase-service-account.json)
        CLIENT_EMAIL=$(jq -r '.client_email' firebase-service-account.json)
        
        echo "📋 Firebase Service Account Details:"
        echo "   Project ID: $PROJECT_ID"
        echo "   Client Email: $CLIENT_EMAIL"
    else
        echo "❌ Advanced JSON validation failed!"
        echo "📄 First 200 characters of the file:"
        head -c 200 firebase-service-account.json
        exit 1
    fi
else
    echo "⚠️  Advanced validation skipped (jq not available)"
    echo "✅ Basic validation passed - file should work with AWS Secrets Manager"
fi

echo "📁 File location: $(pwd)/firebase-service-account.json"
echo "🔒 File size: $(wc -c < firebase-service-account.json) bytes"
echo ""
echo "✅ Firebase JSON file is ready for AWS Secrets Manager!"
echo "   Next step: Run ./setup-firebase-secret-fixed.sh and choose option 1" 