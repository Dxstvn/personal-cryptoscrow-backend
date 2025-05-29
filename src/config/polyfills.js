// src/config/polyfills.js
// Polyfills for Node.js environments - MUST run synchronously before any Firebase imports

import fetch, { Headers, Request, Response } from 'node-fetch';

// Setup fetch polyfill for Node.js < 18 (required by Firebase Auth)
if (typeof globalThis.fetch === 'undefined') {
  globalThis.fetch = fetch;
  globalThis.Headers = Headers;
  globalThis.Request = Request;
  globalThis.Response = Response;
  console.log('📦 Fetch polyfill loaded for Node.js compatibility');
}

// Additional polyfills for Firebase compatibility
if (typeof globalThis.AbortController === 'undefined') {
  try {
    const { AbortController } = await import('node-abort-controller');
    globalThis.AbortController = AbortController;
  } catch (error) {
    console.warn('⚠️  AbortController polyfill not available:', error.message);
  }
}

export default {}; 