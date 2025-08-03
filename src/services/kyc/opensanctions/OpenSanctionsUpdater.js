// src/services/kyc/opensanctions/OpenSanctionsUpdater.js

import { EventEmitter } from 'events';
import { OpenSanctionsDownloader } from '../utils/openSanctionsDownloader.js';
import { OpenSanctionsSQLiteService } from './OpenSanctionsSQLiteService.js';
import { OpenSanctionsService } from './OpenSanctionsService.js';
import { createReadStream, existsSync, writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';
import cron from 'node-cron';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Incremental updater for OpenSanctions data
 * Checks for updates and applies them efficiently
 */
export class OpenSanctionsUpdater extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      checkInterval: config.checkInterval || '0 3 * * *', // Daily at 3 AM
      autoUpdate: config.autoUpdate !== false,
      useSQLite: config.useSQLite !== false,
      updateHistoryFile: config.updateHistoryFile || 
        join(__dirname, '../../../../data/opensanctions-update-history.json'),
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 60000, // 1 minute
      ...config
    };
    
    this.downloader = new OpenSanctionsDownloader();
    this.service = null;
    this.updateTask = null;
    this.isUpdating = false;
    this.updateHistory = this.loadUpdateHistory();
  }

  /**
   * Initialize the updater
   */
  async initialize() {
    // Initialize downloader
    await this.downloader.initialize();
    
    // Initialize the appropriate service
    if (this.config.useSQLite) {
      this.service = new OpenSanctionsSQLiteService(this.config.sqliteConfig);
    } else {
      this.service = new OpenSanctionsService(this.config.postgresConfig);
    }
    
    await this.service.initialize();
    
    // Schedule automatic updates if enabled
    if (this.config.autoUpdate) {
      this.scheduleUpdates();
    }
    
    this.emit('initialized');
  }

  /**
   * Schedule automatic updates
   */
  scheduleUpdates() {
    if (this.updateTask) {
      this.updateTask.stop();
    }
    
    this.updateTask = cron.schedule(this.config.checkInterval, async () => {
      await this.checkAndUpdate();
    });
    
    console.log(`[OpenSanctions Updater] Scheduled updates: ${this.config.checkInterval}`);
    this.emit('scheduled', { interval: this.config.checkInterval });
  }

  /**
   * Check for updates and apply if available
   */
  async checkAndUpdate() {
    if (this.isUpdating) {
      console.log('[OpenSanctions Updater] Update already in progress, skipping');
      return { updated: false, reason: 'update_in_progress' };
    }
    
    this.isUpdating = true;
    const startTime = Date.now();
    
    try {
      // Check if update is needed
      const needsUpdate = await this.downloader.needsUpdate('default');
      
      if (!needsUpdate) {
        console.log('[OpenSanctions Updater] Data is up to date');
        this.isUpdating = false;
        return { updated: false, reason: 'already_up_to_date' };
      }
      
      console.log('[OpenSanctions Updater] Update available, starting update process');
      this.emit('update:start');
      
      // Download latest dataset
      const downloadResult = await this.downloader.downloadDataset('default');
      
      if (!downloadResult.success) {
        throw new Error(`Download failed: ${downloadResult.error}`);
      }
      
      // Get current statistics before update
      const beforeStats = await this.service.getStatistics();
      
      // Apply incremental updates
      const updateResult = await this.applyIncrementalUpdate(downloadResult.path);
      
      // Get statistics after update
      const afterStats = await this.service.getStatistics();
      
      // Record update history
      const updateRecord = {
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        entitiesBefore: beforeStats.total,
        entitiesAfter: afterStats.total,
        entitiesAdded: updateResult.added,
        entitiesUpdated: updateResult.updated,
        entitiesRemoved: updateResult.removed,
        errors: updateResult.errors
      };
      
      this.addUpdateHistory(updateRecord);
      
      console.log('[OpenSanctions Updater] Update completed successfully');
      console.log(`  - Added: ${updateResult.added}`);
      console.log(`  - Updated: ${updateResult.updated}`);
      console.log(`  - Removed: ${updateResult.removed}`);
      console.log(`  - Duration: ${(updateRecord.duration / 1000).toFixed(1)}s`);
      
      this.emit('update:complete', updateRecord);
      this.isUpdating = false;
      
      return { 
        updated: true, 
        stats: updateRecord 
      };
      
    } catch (error) {
      console.error('[OpenSanctions Updater] Update failed:', error);
      this.emit('update:error', error);
      this.isUpdating = false;
      
      return { 
        updated: false, 
        reason: 'error', 
        error: error.message 
      };
    }
  }

  /**
   * Apply incremental updates from new dataset
   */
  async applyIncrementalUpdate(datasetPath) {
    const stats = {
      added: 0,
      updated: 0,
      removed: 0,
      errors: 0,
      processed: 0
    };
    
    try {
      // Start transaction for better performance
      if (this.config.useSQLite) {
        this.service.db.exec('BEGIN TRANSACTION');
      }
      
      // Track existing entities for removal detection
      const existingEntities = new Set();
      const processedEntities = new Set();
      
      // Get all existing entity IDs (in batches for memory efficiency)
      if (this.config.useSQLite) {
        const stmt = this.service.db.prepare('SELECT id FROM opensanctions_entities');
        for (const row of stmt.iterate()) {
          existingEntities.add(row.id);
        }
      }
      
      // Stream and process the new dataset
      const stream = createReadStream(datasetPath);
      const rl = readline.createInterface({
        input: stream,
        crlfDelay: Infinity
      });
      
      console.log('[OpenSanctions Updater] Processing updates...');
      
      for await (const line of rl) {
        if (line.trim()) {
          try {
            const entity = JSON.parse(line);
            processedEntities.add(entity.id);
            
            // Check if entity exists
            const exists = existingEntities.has(entity.id);
            
            if (exists) {
              // Update existing entity
              await this.updateEntity(entity);
              stats.updated++;
            } else {
              // Add new entity
              await this.addEntity(entity);
              stats.added++;
            }
            
            stats.processed++;
            
            // Progress update
            if (stats.processed % 10000 === 0) {
              process.stdout.write(
                `\r  Processed: ${stats.processed.toLocaleString()} ` +
                `(+${stats.added} ↑${stats.updated})`
              );
            }
            
          } catch (error) {
            stats.errors++;
            if (stats.errors < 100) {
              console.error(`\n  Error processing entity: ${error.message}`);
            }
          }
        }
      }
      
      console.log('\n[OpenSanctions Updater] Detecting removed entities...');
      
      // Find and remove entities that are no longer in the dataset
      for (const entityId of existingEntities) {
        if (!processedEntities.has(entityId)) {
          await this.removeEntity(entityId);
          stats.removed++;
        }
      }
      
      // Commit transaction
      if (this.config.useSQLite) {
        this.service.db.exec('COMMIT');
      }
      
      // Clear caches
      if (this.service.cache) {
        this.service.cache.clear();
      }
      
      return stats;
      
    } catch (error) {
      // Rollback on error
      if (this.config.useSQLite) {
        try {
          this.service.db.exec('ROLLBACK');
        } catch (e) {
          // Ignore rollback errors
        }
      }
      
      throw error;
    }
  }

  /**
   * Transform entity data
   */
  transformEntity(entity) {
    const properties = entity.properties || {};
    
    return {
      id: entity.id,
      schema: entity.schema,
      name: properties.name?.[0] || 'Unknown',
      type: entity.schema?.includes('Person') ? 'individual' : 
            entity.schema?.includes('Vessel') ? 'vessel' :
            entity.schema?.includes('Aircraft') ? 'aircraft' : 'entity',
      nationality: properties.nationality?.[0],
      dateOfBirth: properties.birthDate?.[0],
      placeOfBirth: properties.birthPlace?.[0],
      gender: properties.gender?.[0],
      identifiers: {
        passport: properties.passport,
        nationalId: properties.idNumber,
        taxId: properties.taxNumber,
        registrationNumber: properties.registrationNumber
      },
      aliases: [
        ...(properties.alias || []),
        ...(properties.weakAlias || []),
        ...(properties.previousName || [])
      ].filter(Boolean),
      notes: properties.notes?.[0],
      lastSeen: entity.last_seen,
      datasets: entity.datasets || [],
      score: entity.score || 0
    };
  }

  /**
   * Add new entity
   */
  async addEntity(entityData) {
    const transformed = this.transformEntity(entityData);
    
    if (this.config.useSQLite) {
      this.service.importEntity(transformed);
    } else {
      // PostgreSQL implementation would go here
      await this.service.importEntity(transformed);
    }
  }

  /**
   * Update existing entity
   */
  async updateEntity(entityData) {
    const transformed = this.transformEntity(entityData);
    
    if (this.config.useSQLite) {
      // Delete related data first
      this.service.db.prepare('DELETE FROM opensanctions_aliases WHERE entity_id = ?').run(transformed.id);
      this.service.db.prepare('DELETE FROM opensanctions_identifiers WHERE entity_id = ?').run(transformed.id);
      
      // Re-import entity (will update or insert)
      this.service.importEntity(transformed);
    } else {
      // PostgreSQL implementation
      await this.service.updateEntity(transformed);
    }
  }

  /**
   * Remove entity
   */
  async removeEntity(entityId) {
    if (this.config.useSQLite) {
      this.service.db.prepare('DELETE FROM opensanctions_entities WHERE id = ?').run(entityId);
    } else {
      // PostgreSQL implementation
      await this.service.removeEntity(entityId);
    }
  }

  /**
   * Load update history
   */
  loadUpdateHistory() {
    try {
      if (existsSync(this.config.updateHistoryFile)) {
        const data = readFileSync(this.config.updateHistoryFile, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('[OpenSanctions Updater] Failed to load update history:', error);
    }
    
    return [];
  }

  /**
   * Add update record to history
   */
  addUpdateHistory(record) {
    this.updateHistory.push(record);
    
    // Keep only last 100 updates
    if (this.updateHistory.length > 100) {
      this.updateHistory = this.updateHistory.slice(-100);
    }
    
    try {
      writeFileSync(
        this.config.updateHistoryFile, 
        JSON.stringify(this.updateHistory, null, 2)
      );
    } catch (error) {
      console.error('[OpenSanctions Updater] Failed to save update history:', error);
    }
  }

  /**
   * Get update history
   */
  getUpdateHistory(limit = 10) {
    return this.updateHistory.slice(-limit);
  }

  /**
   * Get last update info
   */
  getLastUpdate() {
    return this.updateHistory[this.updateHistory.length - 1] || null;
  }

  /**
   * Force immediate update
   */
  async forceUpdate() {
    console.log('[OpenSanctions Updater] Force update requested');
    return await this.checkAndUpdate();
  }

  /**
   * Stop scheduled updates
   */
  stop() {
    if (this.updateTask) {
      this.updateTask.stop();
      this.updateTask = null;
    }
    
    this.emit('stopped');
  }

  /**
   * Close connections
   */
  async close() {
    this.stop();
    
    if (this.service) {
      await this.service.close();
    }
  }
}

// Export singleton instance
export const openSanctionsUpdater = new OpenSanctionsUpdater();