# Contact Management Routes (`src/api/routes/contact`)

## Overview

This module provides the API endpoints for managing user contacts and the invitation workflow. It enables users to build a network within the CryptoEscrow platform, which can then be used, for example, to easily select counter-parties when creating new escrow deals.

**Frontend Relevance**: This module is key for any social or preparatory features in the frontend UI. Frontend developers will use these endpoints to build UIs for sending invitations, viewing and responding to pending invitations, listing existing contacts, and removing contacts. The data retrieved (like contact lists) can populate selection inputs in other parts of the application, such as the "New Deal" form.

## File: `contactRoutes.js`

-   **Purpose**: Defines all Express.js routes related to contact and invitation management.
-   **Base Path**: These routes are typically mounted under `/api/contact` (verify with main router configuration).
-   **Authentication**: All endpoints in this module require a valid Firebase ID Token (sent as `Authorization: Bearer <TOKEN>`) for user identification and authorization.

### Key Endpoints & Frontend Interaction Details:

-   **`POST /invite`**
    -   **Description**: Allows the authenticated user to send a contact invitation to another individual using their email address.
    -   **Request Body**: `{ "contactEmail": "friend@example.com" }`
    -   **Backend Logic**: Creates an "invitation" document in Firestore, including sender UID, recipient email, sender and receiver profile data (names, phone, wallets), status (`pending`), and a timestamp.
    -   **Success Response (201 Created)**: `{ "message": "Invitation sent successfully", "invitationId": "generatedInvitationId" }`.
    -   **Error Responses**: `400 Bad Request` (e.g., invalid email format, missing email, self-invitation, already contacts), `404 Not Found` (recipient email not found in system), `500 Internal Server Error`.
    -   **Frontend Actions**: Provide a form for the user to enter the recipient's email. Display success or error messages. Optionally, update a list of "sent invitations" in the UI.

-   **`GET /pending`**
    -   **Description**: Retrieves a list of all *pending* contact invitations that have been sent *to* the currently authenticated user.
    -   **Success Response (200 OK)**: 
        ```json
        {
          "invitations": [
            {
              "id": "invitationDocId1",
              "senderId": "senderFirebaseUid",
              "senderEmail": "sender@example.com",
              "senderFirstName": "John"
            }
            // ... more pending invitations
          ]
        }
        ```
    -   **Frontend Actions**: Display these invitations in a dedicated section of the UI (e.g., "Pending Invitations"). For each invitation, provide options to "Accept" or "Deny".

-   **`POST /response`**
    -   **Description**: Allows the authenticated user to respond (accept or deny) to a specific contact invitation they have received.
    -   **Request Body**: `{ "invitationId": "invitationDocId1", "action": "accept" }` (or `"action": "deny"`)
    -   **Backend Logic**: Updates the status of the specified invitation document in Firestore. If `"accept"`:
        -   Changes invitation status to `accepted`.
        -   Creates a mutual contact relationship in Firestore (each user gets the other in their contacts subcollection with full profile data including wallets).
    -   If `"deny"`, changes invitation status to `denied`.
    -   **Success Response (200 OK)**: `{ "message": "Invitation <accepted/declined>" }`.
    -   **Error Responses**: `400 Bad Request` (missing fields, invalid action, invitation already processed), `403 Forbidden` (not authorized to respond), `404 Not Found` (invitation not found).
    -   **Frontend Actions**: After a successful response, remove the invitation from the "Pending Invitations" list. If accepted, update the user's main contact list (or trigger a refresh of that list).

-   **`GET /contacts`**
    -   **Description**: Retrieves the authenticated user's list of established (accepted) contacts.
    -   **Success Response (200 OK)**: 
        ```json
        {
          "contacts": [
            {
              "id": "contactUid1", // Firebase UID of the contact
              "email": "friend1@example.com",
              "first_name": "Friend",
              "last_name": "One", 
              "phone_number": "+1234567890",
              "wallets": ["0x1234567890123456789012345678901234567890"]
            }
            // ... more contacts
          ]
        }
        ```
    -   **Frontend Actions**: Display this list in a "My Contacts" section. This data can be used to populate recipient fields when initiating actions like creating a new deal.

-   **`DELETE /contacts/:contactId`**
    -   **Description**: Allows the authenticated user to remove an established contact from their list.
    -   **URL Parameter**: `:contactId` is the Firebase UID of the contact to be removed.
    -   **Backend Logic**: Deletes the contact relationship from both users' contact subcollections using a batch operation.
    -   **Success Response (200 OK)**: `{ "message": "Contact removed successfully" }`.
    -   **Error Responses**: `400 Bad Request` (invalid contact ID, self-removal), `500 Internal Server Error`.
    -   **Frontend Actions**: Remove the contact from the displayed list. Consider confirming the deletion with the user.

## Data Models (Illustrative Firestore Structure)

-   **Invitations Collection** (e.g., `/invitations/{invitationId}`):
    -   `senderId: string`
    -   `senderEmail: string`
    -   `recipientEmail: string`
    -   `status: "pending" | "accepted" | "declined"`
    -   `sentAt: Timestamp`
    -   `respondedAt: Timestamp (optional)`

-   **Contacts Subcollection** (e.g., `/users/{userId}/contacts/{contactUserId}`):
    -   `email: string` (contact's email)
    -   `displayName: string` (contact's display name)
    -   `addedAt: Timestamp`
    *(Alternatively, a top-level collection linking two user IDs could be used.)*

## Frontend UI/UX Considerations

-   Provide clear visual feedback for all actions (sending invitation, accepting, declining, removing).
-   Use real-time listeners on Firestore for pending invitations and contact lists to ensure the UI is always up-to-date without manual refreshes.
-   Implement search or filtering for large contact lists.
-   Handle edge cases gracefully (e.g., trying to invite an already existing contact, responding to an already actioned invitation). 