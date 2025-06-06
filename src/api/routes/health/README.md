# Health Check Route (`src/api/routes/health`)

## Overview

This directory contains a simple API endpoint designed to provide a basic health check for the CryptoEscrow backend system. Its purpose is to offer a quick way to verify if the backend application is running and if its key dependencies (like Firestore connectivity) are operational.

**Frontend Relevance**: This endpoint is generally **not** intended for direct consumption by the main user-facing frontend application. Its primary users are:
-   Automated monitoring services (e.g., uptime checkers, infrastructure monitoring tools).
-   Load balancers (to determine if an application instance is healthy enough to receive traffic).
-   DevOps and backend developers for quick diagnostics during deployment or troubleshooting.

While the frontend doesn't call it, a healthy backend (as indicated by this endpoint) is crucial for a stable frontend user experience.

## File: `health.js`

-   **Purpose**: Defines the Express.js route for the health check.
-   **Base Path**: This route is typically mounted at `/api/health` (confirm with main router configuration).
-   **Authentication**: This endpoint is typically **public** and does not require authentication, allowing automated services to access it easily.

### Endpoint Details:

-   **`GET /`** (e.g., `/api/health`)
    -   **Description**: Returns a JSON response indicating the overall health status of the backend. It performs a basic check for Firestore connectivity.
    -   **Backend Logic**: When this endpoint is hit, the backend ensures a health status document exists in Firestore and attempts to read it to verify connectivity.
    -   **Success Response (200 OK)**: Indicates the backend is running and Firestore is accessible.
        ```json
        {
          "status": "OK"
        }
        ```
    -   **Error Response (500 Internal Server Error)**: If the health check fails (e.g., cannot connect to Firestore).
        ```json
        {
          "error": "Internal Server Error"
        }
        ```

## Usage & Implications

-   **Monitoring**: Automated tools can poll `GET /api/health` periodically. If it returns a non-200 status or an "unhealthy" payload, alerts can be triggered for the operations team.
-   **Deployment Verification**: After deploying a new version of the backend, this endpoint can be checked as part of an automated CI/CD pipeline or manual verification process to ensure the new deployment is functioning correctly before it receives live traffic.

For frontend developers, knowing this endpoint exists can be useful for communication with the backend team if widespread issues are suspected ("Is the health check endpoint green?"). However, frontend application logic should not typically branch or alter its behavior based on the direct response of this endpoint. 