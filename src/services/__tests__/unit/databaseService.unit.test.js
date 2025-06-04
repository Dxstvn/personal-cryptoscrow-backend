import { jest } from '@jest/globals';

// Mock Firestore and adminApp before importing the service
const mockGetFirestore = jest.fn();
const mockCollection = jest.fn();
const mockDoc = jest.fn();
const mockWhere = jest.fn();
const mockGet = jest.fn();
const mockUpdate = jest.fn();
const mockFieldValueServerTimestamp = jest.fn(() => 'mock_server_timestamp');
const mockFieldValueArrayUnion = jest.fn((...args) => ({ type: 'arrayUnion', args }));
const mockTimestampNow = jest.fn();
const mockAdminApp = {}; // Mock adminApp

// Mock the firebase-admin default import - this is what databaseService uses in test mode
const mockFirestore = jest.fn();
jest.unstable_mockModule('firebase-admin', () => ({
  default: {
    firestore: mockFirestore,
  },
}));

jest.unstable_mockModule('firebase-admin/firestore', () => ({
  getFirestore: mockGetFirestore,
  Timestamp: {
    now: mockTimestampNow,
    fromDate: jest.fn(date => ({
      toDate: () => date,
      toMillis: () => date.getTime(),
      seconds: Math.floor(date.getTime() / 1000),
      nanoseconds: (date.getTime() % 1000) * 1e6,
      isEqual: (other) => date.getTime() === other.toMillis(), // Basic mock
    })),
  },
  FieldValue: {
    serverTimestamp: mockFieldValueServerTimestamp,
    arrayUnion: mockFieldValueArrayUnion,
  },
}));

jest.unstable_mockModule('../../../api/routes/auth/admin.js', () => ({
  adminApp: mockAdminApp,
  getAdminApp: jest.fn().mockResolvedValue(mockAdminApp),
}));

// Dynamically import the service functions after mocks are set up
let getDealsPastFinalApproval, getDealsPastDisputeDeadline, updateDealStatusInDB;

describe('Database Service - Unit Tests', () => {
  beforeAll(async () => {
    // Setup the mock database instance that will be returned by admin.firestore()
    const mockDbInstance = {
      collection: mockCollection,
      doc: mockDoc,
    };

    // Configure admin.firestore() to return our mock database instance
    mockFirestore.mockReturnValue(mockDbInstance);

    // Setup default mock implementation for getFirestore (for non-test environments)
    mockGetFirestore.mockReturnValue(mockDbInstance);

    // Import service functions here so they use the mocked dependencies
    const service = await import('../../databaseService.js');
    getDealsPastFinalApproval = service.getDealsPastFinalApproval;
    getDealsPastDisputeDeadline = service.getDealsPastDisputeDeadline;
    updateDealStatusInDB = service.updateDealStatusInDB;
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset and reconfigure mocks that might change per test or need fresh instances
    // mockGetFirestore is already configured in beforeAll for initial db setup.
    // If its behavior needs to change per test (e.g. throw error on db init), do it here.

    mockCollection.mockReturnValue({
      where: mockWhere,
      doc: mockDoc,
    });
    mockWhere.mockReturnValue({
      where: mockWhere, // Chain .where calls
      get: mockGet,
      orderBy: jest.fn().mockReturnThis(), // Mock orderBy if used with where
      limit: jest.fn().mockReturnThis(),   // Mock limit if used with where
    });
    mockDoc.mockReturnValue({
        update: mockUpdate,
        get: mockGet, // For doc().get() if ever needed by itself
    });

    // Mock Timestamp.now() to return a fixed date for consistent testing
    const fixedDate = new Date('2023-01-15T12:00:00.000Z');
    mockTimestampNow.mockReturnValue({
      toDate: () => fixedDate,
      toMillis: () => fixedDate.getTime(),
      seconds: Math.floor(fixedDate.getTime() / 1000),
      nanoseconds: 0, // Simplified for mock
    });
  });

  describe('getDealsPastFinalApproval', () => {
    it('should retrieve deals past final approval deadline', async () => {
      const deadlineForTest = new Date('2023-01-10T00:00:00.000Z'); // Fixed date
      const mockDeals = [
        { id: 'deal1', data: () => ({ name: 'Deal 1', status: 'IN_FINAL_APPROVAL', finalApprovalDeadlineBackend: deadlineForTest }) },
        { id: 'deal2', data: () => ({ name: 'Deal 2', status: 'IN_FINAL_APPROVAL', finalApprovalDeadlineBackend: deadlineForTest }) },
      ];
      mockGet.mockResolvedValue({ empty: false, docs: mockDeals });

      const deals = await getDealsPastFinalApproval();

      expect(mockCollection).toHaveBeenCalledWith('deals');
      expect(mockWhere).toHaveBeenCalledWith('status', '==', 'IN_FINAL_APPROVAL');
      expect(mockWhere).toHaveBeenCalledWith('finalApprovalDeadlineBackend', '<=', mockTimestampNow());
      expect(mockGet).toHaveBeenCalledTimes(1);
      expect(deals).toHaveLength(2);
      expect(deals[0]).toEqual({ id: 'deal1', name: 'Deal 1', status: 'IN_FINAL_APPROVAL', finalApprovalDeadlineBackend: deadlineForTest });
    });

    it('should return an empty array if no deals match', async () => {
      mockGet.mockResolvedValue({ empty: true, docs: [] });
      const deals = await getDealsPastFinalApproval();
      expect(deals).toEqual([]);
    });

    it('should log an error and return an empty array if Firestore query fails', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const firestoreError = new Error('Firestore query failed');
      mockGet.mockRejectedValue(firestoreError);

      const deals = await getDealsPastFinalApproval();

      expect(deals).toEqual([]);
      expect(consoleErrorSpy).toHaveBeenCalledWith('[DBService] Error fetching deals past final approval:', firestoreError);
      consoleErrorSpy.mockRestore();
    });
  });

  describe('getDealsPastDisputeDeadline', () => {
    it('should retrieve deals past dispute deadline', async () => {
      const deadlineForTest = new Date('2023-01-11T00:00:00.000Z'); // Fixed date
      const mockDeals = [
        { id: 'deal3', data: () => ({ name: 'Deal 3', status: 'IN_DISPUTE', disputeResolutionDeadlineBackend: deadlineForTest }) },
      ];
      mockGet.mockResolvedValue({ empty: false, docs: mockDeals });

      const deals = await getDealsPastDisputeDeadline();

      expect(mockCollection).toHaveBeenCalledWith('deals');
      expect(mockWhere).toHaveBeenCalledWith('status', '==', 'IN_DISPUTE');
      expect(mockWhere).toHaveBeenCalledWith('disputeResolutionDeadlineBackend', '<=', mockTimestampNow());
      expect(deals).toHaveLength(1);
      expect(deals[0]).toEqual({ id: 'deal3', name: 'Deal 3', status: 'IN_DISPUTE', disputeResolutionDeadlineBackend: deadlineForTest });
    });

    it('should return an empty array if no deals match', async () => {
      mockGet.mockResolvedValue({ empty: true, docs: [] });
      const deals = await getDealsPastDisputeDeadline();
      expect(deals).toEqual([]);
    });

    it('should log an error and return an empty array if Firestore query fails', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const firestoreError = new Error('Firestore query failed for dispute');
      mockGet.mockRejectedValue(firestoreError);

      const deals = await getDealsPastDisputeDeadline();

      expect(deals).toEqual([]);
      expect(consoleErrorSpy).toHaveBeenCalledWith('[DBService] Error fetching deals past dispute deadline:', firestoreError);
      consoleErrorSpy.mockRestore();
    });
  });

  describe('updateDealStatusInDB', () => {
    const dealId = 'testDealId';
    const newStatus = 'COMPLETED';
    const eventMessage = 'Deal completed by system.';

    it('should update deal status and add timeline event with transactionHash', async () => {
      const transactionHash = '0x123txHash';
      mockUpdate.mockResolvedValue(); // Simulate successful update

      await updateDealStatusInDB(dealId, {
        status: newStatus,
        timelineEventMessage: eventMessage,
        autoReleaseTxHash: transactionHash // Use a specific hash field like autoReleaseTxHash or autoCancelTxHash
      });

      expect(mockCollection).toHaveBeenCalledWith('deals');
      expect(mockDoc).toHaveBeenCalledWith(dealId);
      expect(mockUpdate).toHaveBeenCalledWith({
        status: newStatus,
        updatedAt: mockTimestampNow(),
        timeline: mockFieldValueArrayUnion({
          event: eventMessage,
          timestamp: mockTimestampNow(),
          systemTriggered: true,
          transactionHash: transactionHash,
        }),
        autoReleaseTxHash: transactionHash
      });
    });

    it('should update deal status and add timeline event without transactionHash', async () => {
      mockUpdate.mockResolvedValue();

      await updateDealStatusInDB(dealId, { 
        status: newStatus, 
        timelineEventMessage: eventMessage 
      }); // No transactionHash in the object

      expect(mockUpdate).toHaveBeenCalledWith({
        status: newStatus,
        updatedAt: mockTimestampNow(),
        timeline: mockFieldValueArrayUnion({
          event: eventMessage,
          timestamp: mockTimestampNow(),
          systemTriggered: true,
          // No transactionHash property here
        }),
        // No hash fields in the main update object if not provided
      });
       // Check that the object passed to arrayUnion does not contain transactionHash
      const timelineEventArg = mockFieldValueArrayUnion.mock.calls[0][0];
      expect(timelineEventArg).not.toHaveProperty('transactionHash');
      // Also check that the main update data does not have irrelevant hash fields
      const updateDataArg = mockUpdate.mock.calls[0][0];
      expect(updateDataArg).not.toHaveProperty('autoReleaseTxHash');
      expect(updateDataArg).not.toHaveProperty('autoCancelTxHash');
    });

    it('should log an error and not call update if dealId is missing', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      await updateDealStatusInDB(null, { status: newStatus, timelineEventMessage: eventMessage });
      expect(consoleErrorSpy).toHaveBeenCalledWith("[DBService] Invalid parameters for updateDealStatusInDB:", { dealId: null, updateData: { status: newStatus, timelineEventMessage: eventMessage } });
      expect(mockUpdate).not.toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

    it('should log an error and not call update if newStatus is missing', async () => {
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        await updateDealStatusInDB(dealId, { timelineEventMessage: eventMessage }); // status is missing
        expect(consoleErrorSpy).toHaveBeenCalledWith("[DBService] Invalid parameters for updateDealStatusInDB:", { dealId, updateData: { timelineEventMessage: eventMessage } });
        expect(mockUpdate).not.toHaveBeenCalled();
        consoleErrorSpy.mockRestore();
      });

    it('should log an error and not call update if eventMessage is missing', async () => {
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        await updateDealStatusInDB(dealId, { status: newStatus }); // eventMessage is missing
        expect(consoleErrorSpy).toHaveBeenCalledWith("[DBService] Invalid parameters for updateDealStatusInDB:", { dealId, updateData: { status: newStatus } });
        expect(mockUpdate).not.toHaveBeenCalled();
        consoleErrorSpy.mockRestore();
    });
    
    it('should log an error if Firestore update fails', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const firestoreError = new Error('Firestore update failed');
      mockUpdate.mockRejectedValue(firestoreError);

      await updateDealStatusInDB(dealId, { status: newStatus, timelineEventMessage: eventMessage });

      expect(consoleErrorSpy).toHaveBeenCalledWith(`[DBService] Error updating status for deal ${dealId} to ${newStatus}:`, firestoreError);
      consoleErrorSpy.mockRestore();
    });
  });
}); 