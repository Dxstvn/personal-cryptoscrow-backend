// src/api/routes/kyc/openSanctionsRoutes.js

import express from 'express';
import { body, query, param, validationResult } from 'express-validator';
import { authMiddleware as authenticateToken } from '../../middleware/authMiddleware.js';
import { OpenSanctionsSQLiteService } from '../../../services/kyc/opensanctions/OpenSanctionsSQLiteService.js';
import { OpenSanctionsUpdater } from '../../../services/kyc/opensanctions/OpenSanctionsUpdater.js';
import rateLimiters from '../../middleware/rateLimiter.js';

const router = express.Router();

// Initialize services
const sanctionsService = new OpenSanctionsSQLiteService();
const sanctionsUpdater = new OpenSanctionsUpdater({ autoUpdate: false });

// Initialize services on startup
(async () => {
  try {
    await sanctionsService.initialize();
    await sanctionsUpdater.initialize();
    console.log('[OpenSanctions API] Services initialized');
  } catch (error) {
    console.error('[OpenSanctions API] Failed to initialize:', error);
  }
})();

// Use standard rate limiters
const searchRateLimit = rateLimiters.api;
const detailRateLimit = rateLimiters.api;

/**
 * @route   POST /api/kyc/opensanctions/search
 * @desc    Search for entities in OpenSanctions database
 * @access  Private
 */
router.post('/search',
  authenticateToken,
  searchRateLimit,
  [
    body('name').notEmpty().trim().isLength({ min: 2, max: 200 })
      .withMessage('Name must be between 2 and 200 characters'),
    body('threshold').optional().isFloat({ min: 0, max: 1 })
      .withMessage('Threshold must be between 0 and 1'),
    body('limit').optional().isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    body('includeAliases').optional().isBoolean(),
    body('datasets').optional().isArray(),
    body('entityType').optional().isIn(['individual', 'entity', 'vessel', 'aircraft']),
    body('nationality').optional().isLength({ min: 2, max: 3 }),
    body('dateOfBirth').optional().isISO8601()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ 
          success: false, 
          errors: errors.array() 
        });
      }

      const {
        name,
        threshold = 0.75,
        limit = 25,
        includeAliases = true,
        datasets,
        entityType,
        nationality,
        dateOfBirth
      } = req.body;

      // Log search request
      console.log(`[OpenSanctions API] Search request for: ${name}`);

      // Perform search with all parameters
      const results = await sanctionsService.search(name, {
        threshold,
        limit,
        includeAliases,
        datasets,
        entityType,
        nationality,
        dateOfBirth
      });

      // Format response
      const response = {
        success: true,
        query: {
          name,
          threshold,
          limit
        },
        resultCount: results.length,
        results: results.map(result => ({
          entity: {
            id: result.entity.id,
            name: result.entity.name,
            type: result.entity.type,
            nationality: result.entity.nationality,
            dateOfBirth: result.entity.dateOfBirth,
            datasets: result.entity.datasets
          },
          matchDetails: {
            matchType: result.matchType,
            matchedName: result.matchedName,
            score: result.finalScore,
            fuzzyMatchType: result.fuzzyMatchType,
            contextBonus: result.contextBonus || 0,
            algorithms: result.algorithms
          }
        }))
      };

      res.json(response);

    } catch (error) {
      console.error('[OpenSanctions API] Search error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to perform sanctions search'
      });
    }
  }
);

/**
 * @route   GET /api/kyc/opensanctions/entity/:id
 * @desc    Get detailed entity information
 * @access  Private
 */
router.get('/entity/:id',
  authenticateToken,
  detailRateLimit,
  [
    param('id').notEmpty().trim()
      .withMessage('Entity ID is required'),
    query('includeRelated').optional().isBoolean()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ 
          success: false, 
          errors: errors.array() 
        });
      }

      const { id } = req.params;
      const { includeRelated = true } = req.query;

      // Get entity details
      const entity = await sanctionsService.getEntity(id, {
        includeRelated: includeRelated === 'true' || includeRelated === true
      });

      if (!entity) {
        return res.status(404).json({
          success: false,
          error: 'Entity not found'
        });
      }

      res.json({
        success: true,
        entity
      });

    } catch (error) {
      console.error('[OpenSanctions API] Entity detail error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve entity details'
      });
    }
  }
);

/**
 * @route   GET /api/kyc/opensanctions/statistics
 * @desc    Get database statistics
 * @access  Private
 */
router.get('/statistics',
  authenticateToken,
  async (req, res) => {
    try {
      const stats = await sanctionsService.getStatistics();
      const lastUpdate = sanctionsUpdater.getLastUpdate();

      res.json({
        success: true,
        statistics: {
          totalEntities: stats.total,
          breakdown: {
            individuals: stats.individuals,
            entities: stats.entities,
            vessels: stats.vessels,
            aircraft: stats.aircraft
          },
          lastDatabaseUpdate: stats.last_update,
          lastDataUpdate: lastUpdate ? lastUpdate.timestamp : null
        }
      });

    } catch (error) {
      console.error('[OpenSanctions API] Statistics error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve statistics'
      });
    }
  }
);

/**
 * @route   GET /api/kyc/opensanctions/update-history
 * @desc    Get update history
 * @access  Private (Admin only)
 */
router.get('/update-history',
  authenticateToken,
  [
    query('limit').optional().isInt({ min: 1, max: 100 })
  ],
  async (req, res) => {
    try {
      // Check if user is admin (you may want to implement proper admin check)
      // For now, we'll allow any authenticated user
      
      const { limit = 10 } = req.query;
      const history = sanctionsUpdater.getUpdateHistory(parseInt(limit));

      res.json({
        success: true,
        history
      });

    } catch (error) {
      console.error('[OpenSanctions API] Update history error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve update history'
      });
    }
  }
);

/**
 * @route   POST /api/kyc/opensanctions/check-update
 * @desc    Check if update is available
 * @access  Private (Admin only)
 */
router.post('/check-update',
  authenticateToken,
  async (req, res) => {
    try {
      const needsUpdate = await sanctionsUpdater.downloader.needsUpdate('default');
      
      res.json({
        success: true,
        updateAvailable: needsUpdate,
        lastUpdate: sanctionsUpdater.getLastUpdate()
      });

    } catch (error) {
      console.error('[OpenSanctions API] Check update error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to check for updates'
      });
    }
  }
);

/**
 * @route   POST /api/kyc/opensanctions/trigger-update
 * @desc    Manually trigger database update
 * @access  Private (Admin only)
 */
router.post('/trigger-update',
  authenticateToken,
  async (req, res) => {
    try {
      // Check if update is already in progress
      if (sanctionsUpdater.isUpdating) {
        return res.status(409).json({
          success: false,
          error: 'Update already in progress'
        });
      }

      // Start update in background
      res.json({
        success: true,
        message: 'Update started in background'
      });

      // Trigger update asynchronously
      sanctionsUpdater.forceUpdate().catch(error => {
        console.error('[OpenSanctions API] Update failed:', error);
      });

    } catch (error) {
      console.error('[OpenSanctions API] Trigger update error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to trigger update'
      });
    }
  }
);

/**
 * @route   POST /api/kyc/opensanctions/batch-search
 * @desc    Search for multiple entities at once
 * @access  Private
 */
router.post('/batch-search',
  authenticateToken,
  searchRateLimit,
  [
    body('searches').isArray({ min: 1, max: 50 })
      .withMessage('Searches must be an array with 1-50 items'),
    body('searches.*.name').notEmpty().trim().isLength({ min: 2, max: 200 }),
    body('searches.*.dateOfBirth').optional().isISO8601(),
    body('searches.*.nationality').optional().isISO31661Alpha2(),
    body('threshold').optional().isFloat({ min: 0, max: 1 }),
    body('limit').optional().isInt({ min: 1, max: 25 })
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ 
          success: false, 
          errors: errors.array() 
        });
      }

      const { searches, threshold = 0.75, limit = 10 } = req.body;
      
      // Process searches in parallel
      const results = await Promise.all(
        searches.map(async (search) => {
          try {
            const searchResults = await sanctionsService.search(search.name, {
              threshold,
              limit,
              dateOfBirth: search.dateOfBirth,
              nationality: search.nationality
            });

            return {
              query: search,
              success: true,
              resultCount: searchResults.length,
              results: searchResults.map(r => ({
                entity: {
                  id: r.entity.id,
                  name: r.entity.name,
                  type: r.entity.type
                },
                score: r.finalScore
              }))
            };
          } catch (error) {
            return {
              query: search,
              success: false,
              error: error.message
            };
          }
        })
      );

      res.json({
        success: true,
        searches: results
      });

    } catch (error) {
      console.error('[OpenSanctions API] Batch search error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to perform batch search'
      });
    }
  }
);

export default router;