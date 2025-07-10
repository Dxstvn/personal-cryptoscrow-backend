/**
 * Extension to databaseService.js to emit events on condition updates
 * Add this to your existing databaseService.js
 */

// Add to the existing databaseService class:

class DatabaseServiceWithEvents extends DatabaseService {
    constructor() {
        super();
        this.EventEmitter = require('events');
        this.events = new this.EventEmitter();
    }

    /**
     * Update escrow condition with event emission
     */
    async updateEscrowCondition(escrowId, conditionMet) {
        // Call original update method
        const result = await super.updateEscrowCondition(escrowId, conditionMet);
        
        // Emit event for real-time sync
        this.events.emit('conditionUpdated', escrowId, conditionMet);
        
        return result;
    }

    /**
     * Batch update conditions with event emission
     */
    async batchUpdateConditions(updates) {
        const results = [];
        
        for (const { escrowId, conditionMet } of updates) {
            try {
                await this.updateEscrowCondition(escrowId, conditionMet);
                results.push({ escrowId, success: true });
            } catch (error) {
                results.push({ escrowId, success: false, error: error.message });
            }
        }
        
        return results;
    }

    /**
     * Get escrows where database condition differs from contract
     */
    async getEscrowsWithPendingConditions() {
        const query = `
            SELECT e.*, 
                   e.condition_met as db_condition,
                   ec.condition_met as contract_condition
            FROM escrows e
            LEFT JOIN escrow_contract_state ec ON e.escrow_id = ec.escrow_id
            WHERE e.condition_met != COALESCE(ec.condition_met, false)
               OR (e.condition_met = true AND ec.condition_met IS NULL)
        `;
        
        const result = await this.pool.query(query);
        return result.rows;
    }

    /**
     * Subscribe to condition updates
     */
    on(event, handler) {
        this.events.on(event, handler);
    }

    /**
     * Unsubscribe from events
     */
    off(event, handler) {
        this.events.off(event, handler);
    }
}

// Example integration in your API endpoint:
/*
// In your API route that updates conditions:
app.post('/api/escrow/:id/condition', async (req, res) => {
    const { escrowId } = req.params;
    const { conditionMet } = req.body;
    
    try {
        // Update database (this will emit the event)
        await databaseService.updateEscrowCondition(escrowId, conditionMet);
        
        // The contractConditionSync service will automatically
        // pick up this change and update the contract
        
        res.json({ success: true, message: 'Condition updated' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
*/