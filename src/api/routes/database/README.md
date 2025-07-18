# File Management Routes (`/files`)

## Overview

This directory provides secure file management endpoints for the CryptoEscrow platform. Despite the directory name (`database`), this module specifically handles file uploads, downloads, and metadata management for escrow deals using Firebase Storage and Firestore.

**Base Path**: `/files`  
**Authentication**: All endpoints require Firebase ID Token (`Authorization: Bearer <TOKEN>`)  
**Purpose**: Enable secure document management for escrow transactions

## Core Endpoints

### 1. Upload File
**POST** `/files/upload`

Uploads a file and associates it with a specific escrow deal.

**Request Type**: `multipart/form-data`

**Form Data Fields**:
- `file` (required): The file to upload
- `dealId` (required): The ID of the deal to associate the file with

**Allowed File Types**:
- PDF: `application/pdf` (.pdf)
- Images: JPEG (.jpg, .jpeg), PNG (.png), GIF (.gif)
- Documents: Word (.doc, .docx)

**File Constraints**:
- Maximum size: 5MB
- Single file per request
- File signature validation for security

**Success Response** (200 OK):
```json
{
  "message": "File uploaded successfully",
  "fileId": "generated-uuid",
  "url": "https://storage.googleapis.com/..."
}
```

**Error Responses**:
- `400 Bad Request`: Missing file/dealId, invalid file type, file too large
- `403 Forbidden`: User not authorized for this deal
- `404 Not Found`: Deal not found
- `429 Too Many Requests`: Rate limit exceeded (5 uploads per minute)

**Backend Security**:
1. Validates file MIME type and extension
2. Checks file signature (magic bytes) 
3. Sanitizes filenames
4. Verifies user is participant in deal
5. Generates secure storage paths with UUIDs

### 2. Get Files for My Deals
**GET** `/files/my-deals`

Retrieves metadata for all files in deals where the user is a participant.

**Success Response** (200 OK):
```json
[
  {
    "dealId": "deal-id",
    "fileId": "file-uuid",
    "filename": "contract.pdf",
    "contentType": "application/pdf",
    "size": 1048576,
    "uploadedAt": "2023-10-26T10:00:00.000Z",
    "uploadedBy": "uploader-uid",
    "downloadPath": "/files/download/deal-id/file-uuid"
  }
]
```

**Notes**:
- Returns empty array if no deals found
- Aggregates files from all user's deals
- Provides download paths for each file

### 3. Download File
**GET** `/files/download/:dealId/:fileId`

Downloads a specific file from a deal.

**URL Parameters**:
- `:dealId` - The deal ID
- `:fileId` - The file ID

**Response**: Binary file stream with appropriate headers
- `Content-Type`: Original file MIME type
- `Content-Disposition`: Attachment with original filename

**Error Responses**:
- `403 Forbidden`: User not authorized for this deal
- `404 Not Found`: Deal or file not found
- `500 Internal Server Error`: Storage access error

**Security**:
- Verifies user is participant in the deal
- Streams file directly from Firebase Storage
- No public URLs exposed

## Frontend Integration Guide

### 1. File Upload Implementation
```javascript
async function uploadFile(file, dealId) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('dealId', dealId);
  
  try {
    const response = await fetch('/files/upload', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`
      },
      body: formData
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    // Handle specific errors
    if (error.message.includes('File too large')) {
      showNotification('File must be under 5MB', 'error');
    } else if (error.message.includes('Invalid file type')) {
      showNotification('Only PDF, images, and Word documents allowed', 'error');
    }
    throw error;
  }
}
```

### 2. File Upload UI Component
```javascript
function FileUploader({ dealId, onUploadComplete }) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  
  const handleFileSelect = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    // Client-side validation
    if (file.size > 5 * 1024 * 1024) {
      showError('File must be under 5MB');
      return;
    }
    
    const allowedTypes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/gif',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    
    if (!allowedTypes.includes(file.type)) {
      showError('Invalid file type');
      return;
    }
    
    setUploading(true);
    try {
      const result = await uploadFile(file, dealId);
      onUploadComplete(result);
      showSuccess('File uploaded successfully');
    } catch (error) {
      showError('Upload failed');
    } finally {
      setUploading(false);
    }
  };
  
  return (
    <div>
      <input
        type="file"
        onChange={handleFileSelect}
        accept=".pdf,.jpg,.jpeg,.png,.gif,.doc,.docx"
        disabled={uploading}
      />
      {uploading && <ProgressBar value={progress} />}
    </div>
  );
}
```

### 3. File List Display
```javascript
function DealFiles({ dealId }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    fetchDealFiles();
  }, [dealId]);
  
  const fetchDealFiles = async () => {
    try {
      const response = await authenticatedFetch('/files/my-deals');
      const allFiles = await response.json();
      const dealFiles = allFiles.filter(f => f.dealId === dealId);
      setFiles(dealFiles);
    } catch (error) {
      showError('Failed to load files');
    } finally {
      setLoading(false);
    }
  };
  
  const downloadFile = (downloadPath, filename) => {
    // Create temporary link for download
    const link = document.createElement('a');
    link.href = `${API_BASE_URL}${downloadPath}`;
    link.download = filename;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    
    // Add auth header for the request
    link.addEventListener('click', (e) => {
      e.preventDefault();
      fetch(link.href, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      })
      .then(res => res.blob())
      .then(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      });
    });
    
    link.click();
  };
  
  return (
    <div>
      {loading ? (
        <LoadingSpinner />
      ) : (
        <FileList 
          files={files}
          onDownload={downloadFile}
          onUploadComplete={fetchDealFiles}
        />
      )}
    </div>
  );
}
```

### 4. Real-time File Updates
```javascript
// Listen for new files in a deal
function useDealFiles(dealId) {
  const [files, setFiles] = useState([]);
  
  useEffect(() => {
    if (!dealId) return;
    
    const filesRef = collection(db, 'deals', dealId, 'files');
    const unsubscribe = onSnapshot(filesRef, (snapshot) => {
      const updatedFiles = [];
      snapshot.forEach((doc) => {
        updatedFiles.push({
          id: doc.id,
          ...doc.data()
        });
      });
      setFiles(updatedFiles);
    });
    
    return unsubscribe;
  }, [dealId]);
  
  return files;
}
```

## Security Features

### File Upload Security
1. **MIME Type Validation**: Checks against allowed types
2. **Extension Validation**: Verifies file extensions
3. **File Signature Validation**: Checks magic bytes
4. **Filename Sanitization**: Removes special characters
5. **Size Limits**: 5MB per file
6. **Rate Limiting**: 5 uploads per minute per user

### Access Control
- Deal participant verification on all operations
- No public file URLs - all downloads require authentication
- Secure file paths with UUIDs prevent enumeration

### Storage Security
- Files stored in structured paths: `deals/{dealId}/{fileId}{extension}`
- Metadata stored separately in Firestore
- Signed URLs with expiration (7 days) in production

## Error Handling

### Common Upload Errors
- **"File too large"**: File exceeds 5MB limit
- **"Invalid file type"**: File type not in allowed list
- **"File signature does not match"**: File content doesn't match declared type
- **"Unauthorized access"**: User not participant in deal

### Network Error Handling
```javascript
const uploadWithRetry = async (file, dealId, maxRetries = 3) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await uploadFile(file, dealId);
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, i)));
    }
  }
};
```

## UI/UX Recommendations

### Upload Experience
1. **Drag & Drop**: Support drag-and-drop file uploads
2. **Progress Indication**: Show upload progress for large files
3. **File Preview**: Display thumbnails for images
4. **Batch Upload**: Queue multiple files (one at a time due to API limit)

### File Display
1. **File Icons**: Show appropriate icons by file type
2. **Metadata Display**: Show size, upload date, uploader name
3. **Quick Actions**: One-click download, preview for images/PDFs
4. **Search/Filter**: Filter files by type or name

### Error Feedback
1. **Clear Messages**: User-friendly error descriptions
2. **Retry Options**: Allow easy retry for failed uploads
3. **Validation Feedback**: Show why a file was rejected

## Testing Support

The module includes special handling for test environments:
- Uses Firebase Storage emulator in test mode
- Generates mock download URLs for emulator
- Flexible token authentication for testing

## Performance Considerations

### Upload Optimization
- Client-side validation before upload attempt
- Compress images before upload if needed
- Show upload progress for better UX

### Download Optimization
- Stream files directly from storage
- Implement client-side caching for frequently accessed files
- Consider generating preview thumbnails for images

## Next Steps for Frontend

1. **Implement Drag & Drop**: Modern file upload interface
2. **Add File Preview**: In-browser preview for PDFs and images
3. **Batch Operations**: Support multiple file uploads/downloads
4. **File Categories**: Organize files by type (contracts, photos, etc.)
5. **Version Control**: Track file versions if replacements are needed
6. **Virus Scanning**: Integrate with virus scanning service for production