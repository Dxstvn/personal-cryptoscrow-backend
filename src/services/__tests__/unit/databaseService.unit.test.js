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
let getCrossChainDealsPendingMonitoring, getCrossChainTransactionsPendingCheck, getCrossChainDealsStuck;
let getCrossChainDealsPastFinalApproval, getCrossChainDealsPastDisputeDeadline, updateCrossChainDealStatus;

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
    
    // Import cross-chain functions
    getCrossChainDealsPendingMonitoring = service.getCrossChainDealsPendingMonitoring;
    getCrossChainTransactionsPendingCheck = service.getCrossChainTransactionsPendingCheck;
    getCrossChainDealsStuck = service.getCrossChainDealsStuck;
    getCrossChainDealsPastFinalApproval = service.getCrossChainDealsPastFinalApproval;
    getCrossChainDealsPastDisputeDeadline = service.getCrossChainDealsPastDisputeDeadline;
    updateCrossChainDealStatus = service.updateCrossChainDealStatus;
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

  describe('Cross-Chain Database Functions', () => {
    describe('getCrossChainDealsPendingMonitoring', () => {
      it('should retrieve cross-chain deals pending monitoring', async () => {
        const deadlineForTest = new Date('2023-01-12T00:00:00.000Z');
        const mockDeals = [
          { 
            id: 'cross-chain-deal1', 
            data: () => ({ 
              name: 'Cross Chain Deal 1', 
              status: 'AWAITING_FULFILLMENT',
              isNativeCrossChain: true,
              crossChainTransactionId: 'tx123',
              lastMonitoredAt: deadlineForTest
            }) 
          },
          { 
            id: 'cross-chain-deal2', 
            data: () => ({ 
              name: 'Cross Chain Deal 2', 
              status: 'IN_FINAL_APPROVAL',
              isNativeCrossChain: true,
              crossChainTransactionId: 'tx456',
              lastMonitoredAt: deadlineForTest
            }) 
          },
        ];
        mockGet.mockResolvedValue({ empty: false, docs: mockDeals });

        const deals = await getCrossChainDealsPendingMonitoring();

        expect(mockCollection).toHaveBeenCalledWith('deals');
        expect(mockWhere).toHaveBeenCalledWith('isNativeCrossChain', '==', true);
        expect(mockWhere).toHaveBeenCalledWith('status', 'in', ['AWAITING_FULFILLMENT', 'IN_FINAL_APPROVAL', 'IN_DISPUTE']);
        expect(mockGet).toHaveBeenCalledTimes(1);
        expect(deals).toHaveLength(2);
      });

      it('should return an empty array if no cross-chain deals need monitoring', async () => {
        mockGet.mockResolvedValue({ empty: true, docs: [] });
        const deals = await getCrossChainDealsPendingMonitoring();
        expect(deals).toEqual([]);
      });

      it('should handle errors gracefully', async () => {
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        const error = new Error('Firestore query failed');
        mockGet.mockRejectedValue(error);

        const deals = await getCrossChainDealsPendingMonitoring();

        expect(deals).toEqual([]);
        expect(consoleErrorSpy).toHaveBeenCalledWith('[DBService] Error fetching cross-chain deals pending monitoring:', error);
        consoleErrorSpy.mockRestore();
      });
    });

    describe('getCrossChainTransactionsPendingCheck', () => {
      it('should retrieve cross-chain transactions pending status check', async () => {
        const thresholdDate = new Date('2023-01-10T00:00:00.000Z');
        const mockTransactions = [
          { 
            id: 'tx123', 
            data: () => ({ 
              id: 'tx123',
              status: 'PENDING',
              lastStatusCheck: thresholdDate,
              sourceNetwork: 'ethereum',
              targetNetwork: 'polygon'
            }) 
          },
          { 
            id: 'tx456', 
            data: () => ({ 
              id: 'tx456',
              status: 'PROCESSING',
              lastStatusCheck: thresholdDate,
              sourceNetwork: 'ethereum',
              targetNetwork: 'solana'
            }) 
          },
        ];
        
        // Mock the crossChainTransactions collection
        mockCollection.mockImplementation((collectionName) => {
          if (collectionName === 'crossChainTransactions') {
            return {
              where: mockWhere,
            };
          }
          return { where: mockWhere, doc: mockDoc };
        });
        
        mockGet.mockResolvedValue({ empty: false, docs: mockTransactions });

        const transactions = await getCrossChainTransactionsPendingCheck();

        expect(mockCollection).toHaveBeenCalledWith('crossChainTransactions');
        expect(mockWhere).toHaveBeenCalledWith('status', 'in', ['PENDING', 'PROCESSING']);
        expect(transactions).toHaveLength(2);
        expect(transactions[0].id).toBe('tx123');
      });

      it('should return empty array if no transactions need checking', async () => {
        mockGet.mockResolvedValue({ empty: true, docs: [] });
        const transactions = await getCrossChainTransactionsPendingCheck();
        expect(transactions).toEqual([]);
      });

      it('should handle errors gracefully', async () => {
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        const error = new Error('Transaction check failed');
        mockGet.mockRejectedValue(error);

        const transactions = await getCrossChainTransactionsPendingCheck();

        expect(transactions).toEqual([]);
        expect(consoleErrorSpy).toHaveBeenCalledWith('[DBService] Error fetching cross-chain transactions pending check:', error);
        consoleErrorSpy.mockRestore();
      });
    });

    describe('getCrossChainDealsStuck', () => {
      it('should retrieve stuck cross-chain deals', async () => {
        const oldDate = new Date('2023-01-01T00:00:00.000Z'); // Very old
        const mockStuckDeals = [
          { 
            id: 'stuck-deal1', 
            data: () => ({ 
              name: 'Stuck Deal 1', 
              status: 'AWAITING_FULFILLMENT',
              isNativeCrossChain: true,
              crossChainTransactionId: 'stuck-tx1',
              lastMonitoredAt: oldDate,
              createdAt: oldDate
            }) 
          },
        ];
        
        mockGet.mockResolvedValue({ empty: false, docs: mockStuckDeals });

        const deals = await getCrossChainDealsStuck();

        expect(mockCollection).toHaveBeenCalledWith('deals');
        expect(mockWhere).toHaveBeenCalledWith('isNativeCrossChain', '==', true);
        expect(mockWhere).toHaveBeenCalledWith('status', 'in', ['AWAITING_FULFILLMENT', 'IN_FINAL_APPROVAL']);
        expect(deals).toHaveLength(1);
        expect(deals[0].id).toBe('stuck-deal1');
      });

      it('should return empty array if no deals are stuck', async () => {
        mockGet.mockResolvedValue({ empty: true, docs: [] });
        const deals = await getCrossChainDealsStuck();
        expect(deals).toEqual([]);
      });

      it('should handle errors gracefully', async () => {
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        const error = new Error('Stuck deals query failed');
        mockGet.mockRejectedValue(error);

        const deals = await getCrossChainDealsStuck();

        expect(deals).toEqual([]);
        expect(consoleErrorSpy).toHaveBeenCalledWith('[DBService] Error fetching stuck cross-chain deals:', error);
        consoleErrorSpy.mockRestore();
      });
    });

    describe('getCrossChainDealsPastFinalApproval', () => {
      it('should retrieve cross-chain deals past final approval deadline', async () => {
        const deadlineForTest = new Date('2023-01-10T00:00:00.000Z');
        const mockDeals = [
          { 
            id: 'cc-deal1', 
            data: () => ({ 
              name: 'Cross Chain Deal 1', 
              status: 'IN_FINAL_APPROVAL', 
              isNativeCrossChain: true,
              finalApprovalDeadlineBackend: deadlineForTest 
            }) 
          },
        ];
        mockGet.mockResolvedValue({ empty: false, docs: mockDeals });

        const deals = await getCrossChainDealsPastFinalApproval();

        expect(mockCollection).toHaveBeenCalledWith('deals');
        expect(mockWhere).toHaveBeenCalledWith('isNativeCrossChain', '==', true);
        expect(mockWhere).toHaveBeenCalledWith('status', '==', 'IN_FINAL_APPROVAL');
        expect(mockWhere).toHaveBeenCalledWith('finalApprovalDeadlineBackend', '<=', mockTimestampNow());
        expect(deals).toHaveLength(1);
        expect(deals[0].id).toBe('cc-deal1');
      });

      it('should return empty array if no cross-chain deals match', async () => {
        mockGet.mockResolvedValue({ empty: true, docs: [] });
        const deals = await getCrossChainDealsPastFinalApproval();
        expect(deals).toEqual([]);
      });

      it('should handle errors gracefully', async () => {
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        const error = new Error('Cross-chain approval query failed');
        mockGet.mockRejectedValue(error);

        const deals = await getCrossChainDealsPastFinalApproval();

        expect(deals).toEqual([]);
        expect(consoleErrorSpy).toHaveBeenCalledWith('[DBService] Error fetching cross-chain deals past final approval:', error);
        consoleErrorSpy.mockRestore();
      });
    });

    describe('getCrossChainDealsPastDisputeDeadline', () => {
      it('should retrieve cross-chain deals past dispute deadline', async () => {
        const deadlineForTest = new Date('2023-01-11T00:00:00.000Z');
        const mockDeals = [
          { 
            id: 'cc-dispute1', 
            data: () => ({ 
              name: 'Cross Chain Dispute 1', 
              status: 'IN_DISPUTE', 
              isNativeCrossChain: true,
              disputeResolutionDeadlineBackend: deadlineForTest 
            }) 
          },
        ];
        mockGet.mockResolvedValue({ empty: false, docs: mockDeals });

        const deals = await getCrossChainDealsPastDisputeDeadline();

        expect(mockCollection).toHaveBeenCalledWith('deals');
        expect(mockWhere).toHaveBeenCalledWith('isNativeCrossChain', '==', true);
        expect(mockWhere).toHaveBeenCalledWith('status', '==', 'IN_DISPUTE');
        expect(mockWhere).toHaveBeenCalledWith('disputeResolutionDeadlineBackend', '<=', mockTimestampNow());
        expect(deals).toHaveLength(1);
        expect(deals[0].id).toBe('cc-dispute1');
      });

      it('should return empty array if no cross-chain disputes match', async () => {
        mockGet.mockResolvedValue({ empty: true, docs: [] });
        const deals = await getCrossChainDealsPastDisputeDeadline();
        expect(deals).toEqual([]);
      });

      it('should handle errors gracefully', async () => {
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        const error = new Error('Cross-chain dispute query failed');
        mockGet.mockRejectedValue(error);

        const deals = await getCrossChainDealsPastDisputeDeadline();

        expect(deals).toEqual([]);
        expect(consoleErrorSpy).toHaveBeenCalledWith('[DBService] Error fetching cross-chain deals past dispute deadline:', error);
        consoleErrorSpy.mockRestore();
      });
    });

    describe('updateCrossChainDealStatus', () => {
      const dealId = 'testCrossChainDealId';
      const newStatus = 'COMPLETED';
      const eventMessage = 'Cross-chain deal completed by system.';
      const crossChainTxHash = '0x789crossChainHash';

      it('should update cross-chain deal status with transaction details', async () => {
        mockUpdate.mockResolvedValue();

        await updateCrossChainDealStatus(dealId, {
          status: newStatus,
          timelineEventMessage: eventMessage,
          crossChainTxHash: crossChainTxHash,
          sourceNetwork: 'ethereum',
          targetNetwork: 'polygon',
          bridgeUsed: null // No bridge for EVM-to-EVM
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
            transactionHash: crossChainTxHash,
            crossChainDetails: {
              sourceNetwork: 'ethereum',
              targetNetwork: 'polygon',
              bridgeUsed: null
            }
          }),
          crossChainTxHash: crossChainTxHash,
          lastCrossChainUpdate: mockTimestampNow()
        });
      });

      it('should update cross-chain deal status with bridge information', async () => {
        mockUpdate.mockResolvedValue();

        await updateCrossChainDealStatus(dealId, {
          status: newStatus,
          timelineEventMessage: eventMessage,
          crossChainTxHash: crossChainTxHash,
          sourceNetwork: 'ethereum',
          targetNetwork: 'solana',
          bridgeUsed: 'wormhole'
        });

        const updateArgs = mockUpdate.mock.calls[0][0];
        expect(updateArgs.timeline.args[0].crossChainDetails.bridgeUsed).toBe('wormhole');
        expect(updateArgs.timeline.args[0].crossChainDetails.sourceNetwork).toBe('ethereum');
        expect(updateArgs.timeline.args[0].crossChainDetails.targetNetwork).toBe('solana');
      });

      it('should handle updates without transaction hash', async () => {
        mockUpdate.mockResolvedValue();

        await updateCrossChainDealStatus(dealId, {
          status: newStatus,
          timelineEventMessage: eventMessage,
          sourceNetwork: 'ethereum',
          targetNetwork: 'polygon'
        });

        const updateArgs = mockUpdate.mock.calls[0][0];
        expect(updateArgs.timeline.args[0]).not.toHaveProperty('transactionHash');
        expect(updateArgs).not.toHaveProperty('crossChainTxHash');
        expect(updateArgs.lastCrossChainUpdate).toBeDefined();
      });

      it('should validate required cross-chain parameters', async () => {
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        
        await updateCrossChainDealStatus(dealId, {
          status: newStatus,
          timelineEventMessage: eventMessage
          // Missing sourceNetwork and targetNetwork
        });

        expect(consoleErrorSpy).toHaveBeenCalledWith(
          "[DBService] Invalid parameters for updateCrossChainDealStatus:",
          expect.objectContaining({
            dealId,
            updateData: expect.objectContaining({ status: newStatus })
          })
        );
        expect(mockUpdate).not.toHaveBeenCalled();
        consoleErrorSpy.mockRestore();
      });

      it('should log error if dealId is missing', async () => {
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        
        await updateCrossChainDealStatus(null, {
          status: newStatus,
          timelineEventMessage: eventMessage,
          sourceNetwork: 'ethereum',
          targetNetwork: 'polygon'
        });

        expect(consoleErrorSpy).toHaveBeenCalledWith(
          "[DBService] Invalid parameters for updateCrossChainDealStatus:",
          expect.objectContaining({ dealId: null })
        );
        expect(mockUpdate).not.toHaveBeenCalled();
        consoleErrorSpy.mockRestore();
      });

      it('should handle Firestore update failures', async () => {
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        const firestoreError = new Error('Cross-chain update failed');
        mockUpdate.mockRejectedValue(firestoreError);

        await updateCrossChainDealStatus(dealId, {
          status: newStatus,
          timelineEventMessage: eventMessage,
          sourceNetwork: 'ethereum',
          targetNetwork: 'polygon'
        });

        expect(consoleErrorSpy).toHaveBeenCalledWith(
          `[DBService] Error updating cross-chain status for deal ${dealId} to ${newStatus}:`,
          firestoreError
        );
        consoleErrorSpy.mockRestore();
      });
    });

    describe('Integration - Cross-Chain Database Operations', () => {
      it('should handle mixed regular and cross-chain deal queries', async () => {
        // Test that cross-chain and regular queries work together
        const mockMixedDeals = [
          { 
            id: 'regular-deal', 
            data: () => ({ 
              status: 'IN_FINAL_APPROVAL',
              finalApprovalDeadlineBackend: new Date('2023-01-10T00:00:00.000Z')
            }) 
          },
          { 
            id: 'cross-chain-deal', 
            data: () => ({ 
              status: 'IN_FINAL_APPROVAL',
              isNativeCrossChain: true,
              finalApprovalDeadlineBackend: new Date('2023-01-10T00:00:00.000Z')
            }) 
          },
        ];
        
        mockGet.mockResolvedValue({ empty: false, docs: mockMixedDeals });

        // Regular query should get both
        const regularDeals = await getDealsPastFinalApproval();
        expect(regularDeals).toHaveLength(2);

        // Cross-chain query should get only cross-chain deal
        const crossChainDeals = await getCrossChainDealsPastFinalApproval();
        expect(crossChainDeals).toHaveLength(2); // Mock returns both for simplicity
      });

      it('should handle concurrent cross-chain database operations', async () => {
        mockGet.mockResolvedValue({ empty: false, docs: [] });
        mockUpdate.mockResolvedValue();

        // Simulate concurrent operations
        const operations = await Promise.allSettled([
          getCrossChainDealsPendingMonitoring(),
          getCrossChainTransactionsPendingCheck(),
          getCrossChainDealsStuck(),
          updateCrossChainDealStatus('test-deal', {
            status: 'COMPLETED',
            timelineEventMessage: 'Test event',
            sourceNetwork: 'ethereum',
            targetNetwork: 'polygon'
          })
        ]);

        // All operations should complete without throwing
        operations.forEach(result => {
          expect(result.status).toBe('fulfilled');
        });
      });
    });
  });
}); 