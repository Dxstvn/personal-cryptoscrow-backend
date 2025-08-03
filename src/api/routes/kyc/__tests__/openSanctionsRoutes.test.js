// src/api/routes/kyc/__tests__/openSanctionsRoutes.test.js

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import openSanctionsRoutes from '../openSanctionsRoutes.js';

// Mock authentication middleware to match the actual import
vi.mock('../../middleware/authMiddleware.js', () => {
  const mockMiddleware = (req, res, next) => {
    req.user = { uid: 'test-user-123' };
    req.userId = 'test-user-123';
    next();
  };
  
  return {
    authMiddleware: mockMiddleware,
    default: mockMiddleware
  };
});

// Mock rate limiter
vi.mock('../../middleware/rateLimiter.js', () => ({
  default: {
    api: (req, res, next) => next(),
    auth: (req, res, next) => next(),
    dispute: (req, res, next) => next(),
    highValue: (req, res, next) => next(),
    monitor: (req, res, next) => next()
  }
}));

describe('OpenSanctions API Routes', () => {
  let app;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/kyc/opensanctions', openSanctionsRoutes);
    
    // Wait for services to initialize
    await new Promise(resolve => setTimeout(resolve, 2000));
  });

  describe('POST /api/kyc/opensanctions/search', () => {
    it('should search for sanctioned individuals', async () => {
      const response = await request(app)
        .post('/api/kyc/opensanctions/search')
        .set('Authorization', 'Bearer test-token-user-123')
        .send({
          name: 'Vladimir Putin',
          threshold: 0.7,
          limit: 5
        });

      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.resultCount).toBeGreaterThan(0);
      expect(response.body.results).toBeInstanceOf(Array);
      expect(response.body.results[0]).toHaveProperty('entity');
      expect(response.body.results[0]).toHaveProperty('matchDetails');
    });

    it('should validate search parameters', async () => {
      const response = await request(app)
        .post('/api/kyc/opensanctions/search')
        .set('Authorization', 'Bearer test-token-user-123')
        .send({
          name: 'A', // Too short
          threshold: 2, // Out of range
          limit: 1000 // Too high
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.errors).toBeInstanceOf(Array);
    });

    it('should support contextual search with date of birth', async () => {
      const response = await request(app)
        .post('/api/kyc/opensanctions/search')
        .set('Authorization', 'Bearer test-token-user-123')
        .send({
          name: 'Vladimir Putin',
          dateOfBirth: '1952-10-07'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      
      if (response.body.resultCount > 0) {
        const firstResult = response.body.results[0];
        expect(firstResult.matchDetails.contextBonus).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('GET /api/kyc/opensanctions/entity/:id', () => {
    it('should get entity details', async () => {
      // First search for an entity
      const searchResponse = await request(app)
        .post('/api/kyc/opensanctions/search')
        .set('Authorization', 'Bearer test-token-user-123')
        .send({ name: 'Vladimir Putin' });

      if (searchResponse.body.resultCount > 0) {
        const entityId = searchResponse.body.results[0].entity.id;

        const response = await request(app)
          .get(`/api/kyc/opensanctions/entity/${entityId}`)
          .set('Authorization', 'Bearer test-token-user-123');

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.entity).toHaveProperty('id', entityId);
        expect(response.body.entity).toHaveProperty('name');
        expect(response.body.entity).toHaveProperty('aliases');
      }
    });

    it('should return 404 for non-existent entity', async () => {
      const response = await request(app)
        .get('/api/kyc/opensanctions/entity/non-existent-id')
        .set('Authorization', 'Bearer test-token-user-123');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/kyc/opensanctions/statistics', () => {
    it('should return database statistics', async () => {
      const response = await request(app)
        .get('/api/kyc/opensanctions/statistics')
        .set('Authorization', 'Bearer test-token-user-123');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.statistics).toHaveProperty('totalEntities');
      expect(response.body.statistics.breakdown).toHaveProperty('individuals');
      expect(response.body.statistics.breakdown).toHaveProperty('entities');
    });
  });

  describe('POST /api/kyc/opensanctions/batch-search', () => {
    it('should perform batch searches', async () => {
      const response = await request(app)
        .post('/api/kyc/opensanctions/batch-search')
        .set('Authorization', 'Bearer test-token-user-123')
        .send({
          searches: [
            { name: 'Vladimir Putin' },
            { name: 'Kim Jong Un' },
            { name: 'John Smith', dateOfBirth: '1990-01-01' }
          ],
          threshold: 0.75,
          limit: 3
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.searches).toHaveLength(3);
      
      response.body.searches.forEach(search => {
        expect(search).toHaveProperty('query');
        expect(search).toHaveProperty('success');
        expect(search).toHaveProperty('resultCount');
      });
    });

    it('should validate batch size limits', async () => {
      const searches = Array(51).fill({ name: 'Test Name' });
      
      const response = await request(app)
        .post('/api/kyc/opensanctions/batch-search')
        .set('Authorization', 'Bearer test-token-user-123')
        .send({ searches });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/kyc/opensanctions/update-history', () => {
    it('should return update history', async () => {
      const response = await request(app)
        .get('/api/kyc/opensanctions/update-history')
        .set('Authorization', 'Bearer test-token-user-123')
        .query({ limit: 5 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.history).toBeInstanceOf(Array);
    });
  });

  describe('POST /api/kyc/opensanctions/check-update', () => {
    it('should check for available updates', async () => {
      const response = await request(app)
        .post('/api/kyc/opensanctions/check-update')
        .set('Authorization', 'Bearer test-token-user-123');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body).toHaveProperty('updateAvailable');
      expect(typeof response.body.updateAvailable).toBe('boolean');
    });
  });
});