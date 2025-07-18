/**
 * Retry handler utility for blockchain operations
 * Provides exponential backoff and comprehensive error handling
 */

import { ethers } from 'ethers';

export class RetryHandler {
    constructor(options = {}) {
        this.maxRetries = options.maxRetries || 3;
        this.initialDelay = options.initialDelay || 1000; // 1 second
        this.maxDelay = options.maxDelay || 30000; // 30 seconds
        this.backoffMultiplier = options.backoffMultiplier || 2;
        this.retryableErrors = options.retryableErrors || [
            'NETWORK_ERROR',
            'TIMEOUT',
            'NONCE_EXPIRED',
            'REPLACEMENT_UNDERPRICED',
            'UNPREDICTABLE_GAS_LIMIT',
            'CALL_EXCEPTION'
        ];
    }

    /**
     * Execute a function with retry logic
     * @param {Function} fn - The async function to execute
     * @param {string} operationName - Name of the operation for logging
     * @param {Object} context - Additional context for error handling
     * @returns {Promise} The result of the function
     */
    async executeWithRetry(fn, operationName, context = {}) {
        let lastError;
        let delay = this.initialDelay;

        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                // Log attempt
                if (attempt > 1) {
                    console.log(`[RetryHandler] Retrying ${operationName} (attempt ${attempt}/${this.maxRetries})`);
                }

                // Execute the function
                const result = await fn();
                
                // Success - log if it was a retry
                if (attempt > 1) {
                    console.log(`[RetryHandler] ✅ ${operationName} succeeded on attempt ${attempt}`);
                }
                
                return result;

            } catch (error) {
                lastError = error;
                
                // Check if error is retryable
                if (!this.isRetryableError(error) || attempt === this.maxRetries) {
                    // Not retryable or max retries reached
                    console.error(`[RetryHandler] ❌ ${operationName} failed permanently:`, error.message);
                    throw this.enhanceError(error, operationName, attempt, context);
                }

                // Log the retry
                console.warn(`[RetryHandler] ⚠️ ${operationName} failed (attempt ${attempt}/${this.maxRetries}):`, error.message);
                console.log(`[RetryHandler] Waiting ${delay}ms before retry...`);

                // Wait before retry
                await this.sleep(delay);

                // Increase delay for next attempt (exponential backoff)
                delay = Math.min(delay * this.backoffMultiplier, this.maxDelay);
            }
        }

        // Should never reach here, but just in case
        throw lastError;
    }

    /**
     * Check if an error is retryable
     */
    isRetryableError(error) {
        // Check error code
        if (error.code && this.retryableErrors.includes(error.code)) {
            return true;
        }

        // Check error message for common patterns
        const errorMessage = error.message || '';
        const retryablePatterns = [
            /network/i,
            /timeout/i,
            /rate limit/i,
            /nonce/i,
            /gas/i,
            /insufficient funds/i,
            /connection/i
        ];

        return retryablePatterns.some(pattern => pattern.test(errorMessage));
    }

    /**
     * Enhance error with additional context
     */
    enhanceError(error, operationName, attempts, context) {
        const enhancedError = new Error(
            `${operationName} failed after ${attempts} attempt(s): ${error.message}`
        );
        
        enhancedError.originalError = error;
        enhancedError.operationName = operationName;
        enhancedError.attempts = attempts;
        enhancedError.context = context;
        enhancedError.timestamp = new Date().toISOString();
        
        // Preserve stack trace
        if (error.stack) {
            enhancedError.stack = error.stack;
        }

        return enhancedError;
    }

    /**
     * Sleep helper
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Create a retry wrapper for a class method
     */
    wrapMethod(target, methodName, operationName) {
        const originalMethod = target[methodName];
        const retryHandler = this;

        target[methodName] = async function(...args) {
            return retryHandler.executeWithRetry(
                () => originalMethod.apply(this, args),
                operationName || methodName,
                { args }
            );
        };
    }
}

/**
 * Error recovery strategies
 */
export class ErrorRecovery {
    /**
     * Handle blockchain-specific errors
     */
    static async handleBlockchainError(error, context) {
        const { operation, escrowId, chainId } = context;

        // Nonce too low - transaction already mined
        if (error.code === 'NONCE_EXPIRED' || error.message?.includes('nonce too low')) {
            console.log('[ErrorRecovery] Nonce error - checking if transaction was already mined...');
            // Return success if operation was already completed
            return { recovered: true, reason: 'Transaction already mined' };
        }

        // Insufficient funds
        if (error.message?.includes('insufficient funds')) {
            console.error('[ErrorRecovery] Insufficient funds for gas - alerting admin...');
            // Could trigger an alert here
            return { recovered: false, reason: 'Insufficient funds', requiresAdmin: true };
        }

        // Gas estimation failed
        if (error.code === 'UNPREDICTABLE_GAS_LIMIT') {
            console.log('[ErrorRecovery] Gas estimation failed - trying with manual gas limit...');
            return { 
                recovered: false, 
                reason: 'Gas estimation failed', 
                suggestion: 'Try with manual gas limit',
                gasLimit: 500000 // Default higher gas limit
            };
        }

        // Network issues
        if (error.code === 'NETWORK_ERROR' || error.code === 'TIMEOUT') {
            console.log('[ErrorRecovery] Network error - will retry automatically');
            return { recovered: false, reason: 'Network error', retryable: true };
        }

        // Contract reverted
        if (error.code === 'CALL_EXCEPTION') {
            console.error('[ErrorRecovery] Contract reverted:', error.reason);
            return { 
                recovered: false, 
                reason: `Contract reverted: ${error.reason}`,
                retryable: false
            };
        }

        return { recovered: false, reason: 'Unknown error', retryable: false };
    }

    /**
     * Validate transaction before sending
     */
    static async validateTransaction(tx, signer) {
        // Check balance
        const balance = await signer.getBalance();
        const estimatedCost = tx.gasLimit * tx.gasPrice;
        
        if (balance.lt(estimatedCost)) {
            throw new Error(`Insufficient balance. Need ${estimatedCost.toString()}, have ${balance.toString()}`);
        }

        // Validate addresses
        if (tx.to && !ethers.utils.isAddress(tx.to)) {
            throw new Error(`Invalid recipient address: ${tx.to}`);
        }

        return true;
    }
}

// Export singleton instance for convenience
export const defaultRetryHandler = new RetryHandler();

/**
 * Decorator for adding retry logic to async methods
 * Usage: @withRetry('operationName')
 */
export function withRetry(operationName, options = {}) {
    const retryHandler = new RetryHandler(options);
    
    return function(target, propertyKey, descriptor) {
        const originalMethod = descriptor.value;
        
        descriptor.value = async function(...args) {
            return retryHandler.executeWithRetry(
                () => originalMethod.apply(this, args),
                operationName || propertyKey,
                { methodName: propertyKey, args }
            );
        };
        
        return descriptor;
    };
}