// Multi-signature service for critical operations
import { getDb } from './databaseService.js';
import { Timestamp } from 'firebase-admin/firestore';
import crypto from 'crypto';
import securityLogger from './securityLogger.js';

/**
 * Multi-signature service for securing critical operations
 * Implements a simple threshold signature scheme
 */
export class MultiSigService {
  constructor() {
    // Configuration for multi-sig requirements
    this.requirements = {
      emergencyStakeReturn: { requiredSignatures: 2, totalSigners: 3 },
      setReputationScore: { requiredSignatures: 2, totalSigners: 3 },
      pauseContract: { requiredSignatures: 2, totalSigners: 3 },
      unpauseContract: { requiredSignatures: 3, totalSigners: 3 }, // Higher threshold for unpausing
      updateReputationTier: { requiredSignatures: 2, totalSigners: 3 }
    };
    
    // Time window for collecting signatures (24 hours)
    this.signatureWindow = 24 * 60 * 60 * 1000;
  }
  
  /**
   * Initiate a multi-sig operation
   * @param {string} operationType - Type of operation requiring multi-sig
   * @param {Object} operationData - Data for the operation
   * @param {string} initiatorId - ID of the user initiating the operation
   * @returns {Promise<string>} Operation ID
   */
  async initiateOperation(operationType, operationData, initiatorId) {
    try {
      const db = await getDb();
      
      // Validate operation type
      if (!this.requirements[operationType]) {
        throw new Error(`Unknown operation type: ${operationType}`);
      }
      
      const operationId = crypto.randomUUID();
      const operation = {
        id: operationId,
        type: operationType,
        data: operationData,
        initiatorId,
        status: 'pending',
        signatures: [{
          signerId: initiatorId,
          timestamp: Timestamp.now(),
          signature: await this.generateSignature(operationId, operationData)
        }],
        requiredSignatures: this.requirements[operationType].requiredSignatures,
        totalSigners: this.requirements[operationType].totalSigners,
        createdAt: Timestamp.now(),
        expiresAt: Timestamp.fromMillis(Date.now() + this.signatureWindow)
      };
      
      // Store operation
      await db.collection('multiSigOperations').doc(operationId).set(operation);
      
      // Log security event
      await securityLogger.logSecurityEvent(
        securityLogger.SecurityEventType.EMERGENCY_ACTION,
        {
          operationId,
          operationType,
          initiatorId,
          action: 'INITIATED',
          requiredSignatures: operation.requiredSignatures
        }
      );
      
      // Notify other signers
      await this.notifySigners(operation);
      
      return operationId;
    } catch (error) {
      console.error('[MultiSig] Failed to initiate operation:', error);
      throw error;
    }
  }
  
  /**
   * Add signature to a pending operation
   * @param {string} operationId - ID of the operation
   * @param {string} signerId - ID of the signer
   * @returns {Promise<Object>} Updated operation status
   */
  async addSignature(operationId, signerId) {
    try {
      const db = await getDb();
      const operationRef = db.collection('multiSigOperations').doc(operationId);
      const operationDoc = await operationRef.get();
      
      if (!operationDoc.exists) {
        throw new Error('Operation not found');
      }
      
      const operation = operationDoc.data();
      
      // Validate operation status
      if (operation.status !== 'pending') {
        throw new Error(`Operation already ${operation.status}`);
      }
      
      // Check if expired
      if (operation.expiresAt.toMillis() < Date.now()) {
        await operationRef.update({ status: 'expired' });
        throw new Error('Operation has expired');
      }
      
      // Check if already signed by this user
      if (operation.signatures.some(sig => sig.signerId === signerId)) {
        throw new Error('Already signed by this user');
      }
      
      // Add signature
      const signature = {
        signerId,
        timestamp: Timestamp.now(),
        signature: await this.generateSignature(operationId, operation.data)
      };
      
      operation.signatures.push(signature);
      
      // Check if we have enough signatures
      if (operation.signatures.length >= operation.requiredSignatures) {
        operation.status = 'ready';
        
        // Execute the operation
        const result = await this.executeOperation(operation);
        operation.status = 'executed';
        operation.executedAt = Timestamp.now();
        operation.executionResult = result;
      }
      
      // Update operation
      await operationRef.update({
        signatures: operation.signatures,
        status: operation.status,
        executedAt: operation.executedAt,
        executionResult: operation.executionResult
      });
      
      // Log security event
      await securityLogger.logSecurityEvent(
        securityLogger.SecurityEventType.EMERGENCY_ACTION,
        {
          operationId,
          operationType: operation.type,
          signerId,
          action: operation.status === 'executed' ? 'EXECUTED' : 'SIGNED',
          totalSignatures: operation.signatures.length,
          requiredSignatures: operation.requiredSignatures
        }
      );
      
      return {
        operationId,
        status: operation.status,
        signatures: operation.signatures.length,
        required: operation.requiredSignatures
      };
    } catch (error) {
      console.error('[MultiSig] Failed to add signature:', error);
      throw error;
    }
  }
  
  /**
   * Execute the multi-sig operation
   * @param {Object} operation - The operation to execute
   * @returns {Promise<Object>} Execution result
   */
  async executeOperation(operation) {
    try {
      // Import services dynamically to avoid circular dependencies
      const { EscrowServiceV3 } = await import('./escrowServiceV3.js');
      const escrowService = new EscrowServiceV3();
      
      switch (operation.type) {
        case 'emergencyStakeReturn':
          return await escrowService.emergencyStakeReturn(
            operation.data.escrowId,
            operation.data.options
          );
          
        case 'setReputationScore':
          const { ReputationService } = await import('./reputationService.js');
          const reputationService = new ReputationService();
          return await reputationService.setReputationScoreWithMultiSig(
            operation.data.userId,
            operation.data.score
          );
          
        case 'pauseContract':
          return await escrowService.pauseContract(operation.data.options);
          
        case 'unpauseContract':
          return await escrowService.unpauseContract(operation.data.options);
          
        case 'updateReputationTier':
          return await escrowService.updateReputationTier(
            operation.data.index,
            operation.data.minScore,
            operation.data.stakePercentage,
            operation.data.options
          );
          
        default:
          throw new Error(`Unknown operation type: ${operation.type}`);
      }
    } catch (error) {
      console.error('[MultiSig] Failed to execute operation:', error);
      throw error;
    }
  }
  
  /**
   * Generate signature for operation data
   * @param {string} operationId - The operation ID
   * @param {Object} data - The operation data
   * @returns {Promise<string>} Signature
   */
  async generateSignature(operationId, data) {
    // In production, this would use actual cryptographic signatures
    // For now, we'll use a simple hash
    const content = JSON.stringify({ operationId, data, timestamp: Date.now() });
    return crypto.createHash('sha256').update(content).digest('hex');
  }
  
  /**
   * Notify other signers about pending operation
   * @param {Object} operation - The operation requiring signatures
   */
  async notifySigners(operation) {
    // In production, this would send notifications via email/SMS/push
    console.log('[MultiSig] Notifying signers for operation:', {
      id: operation.id,
      type: operation.type,
      required: operation.requiredSignatures
    });
  }
  
  /**
   * Get pending operations requiring signatures
   * @param {string} signerId - The signer's ID
   * @returns {Promise<Array>} Pending operations
   */
  async getPendingOperations(signerId) {
    try {
      const db = await getDb();
      const snapshot = await db.collection('multiSigOperations')
        .where('status', '==', 'pending')
        .where('expiresAt', '>', Timestamp.now())
        .get();
      
      const operations = [];
      snapshot.forEach(doc => {
        const operation = doc.data();
        // Only show operations not yet signed by this user
        if (!operation.signatures.some(sig => sig.signerId === signerId)) {
          operations.push({
            id: doc.id,
            type: operation.type,
            initiator: operation.initiatorId,
            createdAt: operation.createdAt.toDate(),
            expiresAt: operation.expiresAt.toDate(),
            signatures: operation.signatures.length,
            required: operation.requiredSignatures,
            data: operation.data
          });
        }
      });
      
      return operations;
    } catch (error) {
      console.error('[MultiSig] Failed to get pending operations:', error);
      throw error;
    }
  }
  
  /**
   * Clean up expired operations
   */
  async cleanupExpiredOperations() {
    try {
      const db = await getDb();
      const snapshot = await db.collection('multiSigOperations')
        .where('status', '==', 'pending')
        .where('expiresAt', '<', Timestamp.now())
        .get();
      
      const batch = db.batch();
      snapshot.forEach(doc => {
        batch.update(doc.ref, { status: 'expired' });
      });
      
      await batch.commit();
      console.log(`[MultiSig] Cleaned up ${snapshot.size} expired operations`);
    } catch (error) {
      console.error('[MultiSig] Failed to cleanup expired operations:', error);
    }
  }
}

// Export singleton instance
export const multiSigService = new MultiSigService();

// Schedule cleanup every hour
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    multiSigService.cleanupExpiredOperations();
  }, 60 * 60 * 1000);
}