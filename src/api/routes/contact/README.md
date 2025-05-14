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
    -   **Request Body**: `{ "recipientEmail": "friend@example.com" }`
    -   **Backend Logic**: Creates an "invitation" document in Firestore, typically including sender UID, recipient email, status (`pending`), and a timestamp. May also trigger an email notification to the recipient if email services (e.g., Nodemailer) are integrated.
    -   **Success Response (200 OK)**: `{ "message": "Invitation sent successfully.", "invitationId": "generatedInvitationId" }` (The `invitationId` can be useful for tracking).
    -   **Error Responses**: `400 Bad Request` (e.g., invalid email format, missing email), `404 Not Found` (e.g., if recipient email must correspond to an existing user, though typically invites can go to non-users too), `409 Conflict` (e.g., invitation already pending or users are already contacts).
    -   **Frontend Actions**: Provide a form for the user to enter the recipient's email. Display success or error messages. Optionally, update a list of "sent invitations" in the UI.

-   **`GET /pending`**
    -   **Description**: Retrieves a list of all *pending* contact invitations that have been sent *to* the currently authenticated user.
    -   **Success Response (200 OK)**: An array of invitation objects.
        ```json
        [
          {
            "invitationId": "invitationDocId1",
            "senderId": "senderFirebaseUid",
            "senderEmail": "sender@example.com",
            "senderDisplayName": "John Sender", // If available
            "sentAt": "2023-10-26T10:00:00.000Z" // ISO 8601 Timestamp
          }
          // ... more pending invitations
        ]
        ```
    -   **Frontend Actions**: Display these invitations in a dedicated section of the UI (e.g., "Pending Invitations"). For each invitation, provide options to "Accept" or "Decline".

-   **`POST /response`**
    -   **Description**: Allows the authenticated user to respond (accept or decline) to a specific contact invitation they have received.
    -   **Request Body**: `{ "invitationId": "invitationDocId1", "action": "accept" }` (or `"action": "decline"`)
    -   **Backend Logic**: Updates the status of the specified invitation document in Firestore. If `"accept"`:
        -   Changes invitation status to `accepted`.
        -   Creates a mutual contact relationship in Firestore between the sender and recipient (e.g., in a `contacts` subcollection for each user or a top-level `contactPairs` collection).
        -   May trigger a notification to the original sender.
    -   If `"decline"`, changes invitation status to `declined`.
    -   **Success Response (200 OK)**: `{ "message": "Invitation <accepted/declined> successfully." }`.
    -   **Error Responses**: `400 Bad Request` (missing fields, invalid action), `404 Not Found` (invitation ID not found or not addressed to current user).
    -   **Frontend Actions**: After a successful response, remove the invitation from the "Pending Invitations" list. If accepted, update the user's main contact list (or trigger a refresh of that list).

-   **`GET /contacts`**
    -   **Description**: Retrieves the authenticated user's list of established (accepted) contacts.
    -   **Success Response (200 OK)**: An array of contact objects.
        ```json
        [
          {
            "contactRelationshipId": "contactPairDocId1", // ID of the document representing the contact link
            "userId": "friendFirebaseUid1", // The UID of the contact person
            "email": "friend1@example.com",
            "displayName": "Friend One", // Display name of the contact
            "addedAt": "2023-10-25T10:00:00.000Z" // When the contact was established
          }
          // ... more contacts
        ]
        ```
    -   **Frontend Actions**: Display this list in a "My Contacts" section. This data can be used to populate recipient fields when initiating actions like creating a new deal.

-   **`DELETE /contacts/:contactId`**
    -   **Description**: Allows the authenticated user to remove an established contact from their list.
    -   **URL Parameter**: `:contactId` is the ID of the contact relationship to be removed (e.g., `contactRelationshipId` from the `GET /contacts` response).
    -   **Backend Logic**: Deletes the contact relationship document(s) in Firestore.
    -   **Success Response (200 OK)**: `{ "message": "Contact removed successfully." }`.
    -   **Error Responses**: `404 Not Found` (contact ID not found or not associated with current user).
    -   **Frontend Actions**: Remove the contact from the displayed list. Confirm the deletion with the user.

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