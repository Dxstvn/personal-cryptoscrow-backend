# File Management Routes (`src/api/routes/database`)

## Overview

This module provides API endpoints specifically for managing files associated with escrow deals within the CryptoEscrow application. It handles the uploading of documents to Firebase Storage and the retrieval of file metadata and download links.

**Important Note on Naming**: While the directory is named `database/`, its current primary function as defined in `fileUploadDownload.js` is **file management** (interacting with Firebase Storage and storing file metadata likely in Firestore), not general-purpose database access for all application entities. General database operations for deals, for instance, are more directly handled by services and exposed via `src/api/routes/transaction/`.

**Frontend Relevance**: This module is crucial for any feature where users need to attach or retrieve documents related to a deal (e.g., signed agreements, inspection reports, proof of identity). Frontend developers will use these endpoints to implement file upload UI components and to display lists of associated files with download capabilities.

## File: `fileUploadDownload.js`

-   **Purpose**: Defines all Express.js routes for file upload and download operations.
-   **Base Path**: These routes are typically mounted under `/api/files` (confirm with the main router configuration, as the directory name `database` might not directly correspond to the route path for files).
-   **Authentication**: All endpoints require a valid Firebase ID Token (`Authorization: Bearer <TOKEN>`).
-   **Primary Storage**: Firebase Storage is used for the actual file binaries.
-   **Metadata Storage**: File metadata (like filename, storage path, uploader, timestamp, associated deal) is typically stored in Firestore, either in a dedicated `files` collection or embedded/referenced within `deals` documents.

### Key Endpoints & Frontend Interaction Details:

-   **`POST /upload`** (e.g., `/api/files/upload`)
    -   **Description**: Allows an authenticated user to upload a file and associate it with a specific escrow deal.
    -   **Request Type**: `multipart/form-data`. This is essential for file uploads.
    -   **Form Data Fields**:
        -   `dealId` (string, required): The Firestore ID of the deal to which this file belongs.
        -   `file` (file object, required): The actual file being uploaded by the user.
        -   `fileType` (string, optional but recommended): A user-defined or application-defined category for the file (e.g., "AGREEMENT", "INSPECTION_REPORT", "PROOF_OF_FUNDS"). This helps in organizing and displaying files.
    -   **Backend Logic**: 
        1.  Validates `dealId` and user permissions for the deal.
        2.  Receives the file stream.
        3.  Uploads the file binary to a structured path in Firebase Storage (e.g., `deals/<dealId>/<timestamp>_<originalFileName>`).
        4.  Creates a metadata document in Firestore (e.g., in a `files` collection or a subcollection under the deal) storing: `fileName`, `storagePath`, `contentType`, `size`, `uploadedBy` (user UID), `uploadedAt` (timestamp), `dealId`, `fileType`.
    -   **Success Response (201 Created)**:
        ```json
        {
          "message": "File uploaded successfully.",
          "fileId": "generatedFileMetadataIdInFirestore",
          "fileName": "originalUploadedFileName.pdf",
          "fileURL": "https://firebasestorage.googleapis.com/.../deals%2FdealId%2F...%2ForiginalFileName.pdf?alt=media&token=...", // A publicly accessible or signed download URL
          "filePath": "deals/dealId/timestamp_originalFileName.pdf", // Path in Firebase Storage
          "fileType": "AGREEMENT",
          "uploadedAt": "2023-10-26T12:00:00.000Z"
        }
        ```
    -   **Error Responses**: `400 Bad Request` (missing `dealId` or `file`), `401/403` (unauthorized), `413 Payload Too Large` (if file exceeds size limits), `500 Internal Server Error` (storage/database issues).
    -   **Frontend Actions**: 
        -   Use an `<input type="file">` element for file selection.
        -   Construct a `FormData` object, appending `dealId`, `file`, and `fileType`.
        -   Make a POST request with `Content-Type: multipart/form-data`.
        -   Implement upload progress indicators if possible.
        -   On success, update the UI to show the newly uploaded file in the context of the relevant deal. The `fileURL` can be used directly for downloads/previews if it's a long-lived public or signed URL.

-   **`GET /my-deals`** (e.g., `/api/files/my-deals` - or better: `GET /deals/:dealId/files`)
    -   **Description**: Retrieves metadata for all files associated with deals the current authenticated user is a participant in. (A more granular `GET /deals/:dealId/files` to get files for a *specific* deal is often more practical for UIs focused on a single deal).
    -   **Backend Logic**: Queries Firestore for file metadata documents where the `dealId` corresponds to deals the user is part of, or for the specified `dealId`.
    -   **Success Response (200 OK)**: An array of file metadata objects, similar to the individual file object in the upload response.
        ```json
        [
          {
            "fileId": "fileMetadataId1",
            "dealId": "associatedDealId1",
            "fileName": "contract.pdf",
            "fileType": "AGREEMENT",
            "uploadedBy": "uploaderFirebaseUid",
            "uploadedAt": "2023-10-25T10:00:00.000Z",
            "fileURL": "https://firebasestorage.googleapis.com/..."
          }
          // ... more files
        ]
        ```
    -   **Frontend Actions**: Display a list of these files, typically within the context of a specific deal. Each file entry should show its name, type, upload date, and provide a download mechanism using its `fileId` or `fileURL`.

-   **`GET /download/:dealId/:fileId`** (e.g., `/api/files/download/:dealId/:fileId`)
    -   **Description**: Allows an authenticated and authorized user to download a specific file by its ID.
    -   **URL Parameters**: `:dealId`, `:fileId` (the Firestore ID of the file metadata document).
    -   **Backend Logic**: 
        1.  Verifies user has access to the specified `dealId`.
        2.  Retrieves file metadata from Firestore using `fileId` (verifying it belongs to `dealId`).
        3.  Gets the `storagePath` from the metadata.
        4.  Either generates a short-lived signed Firebase Storage download URL and redirects the user to it, OR directly streams the file from Firebase Storage to the client with appropriate `Content-Disposition` and `Content-Type` headers.
    -   **Success Response**: The file binary itself (e.g., `Content-Type: application/pdf`). The browser will typically handle this as a download.
    -   **Error Responses**: `401/403` (unauthorized), `404 Not Found` (deal or file not found).
    -   **Frontend Actions**: Provide a download link or button for each file listed. This can be a simple `<a>` tag pointing to this API endpoint, or a JavaScript function that initiates the download (e.g., by setting `window.location.href` or using a library to handle file downloads).

## Frontend UI/UX Considerations

-   **File Type Icons**: Display appropriate icons based on `fileType` or actual file extension.
-   **Upload Progress**: For larger files, provide visual feedback on upload progress.
-   **Error Handling**: Clearly indicate failures during upload (e.g., file too large, network error, server error) or download.
-   **Security**: Ensure that download links are not easily guessable if direct URLs from storage are used; signed URLs (if used by backend) mitigate this by being time-limited and specific.
-   **Real-time Updates**: If a list of files for a deal is displayed, using Firestore real-time listeners on the file metadata (if stored in a queryable way per deal) can keep this list automatically updated when new files are added or removed (if a delete endpoint exists). 