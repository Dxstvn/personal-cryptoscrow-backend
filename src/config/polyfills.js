// src/config/polyfills.js
// Polyfills for Node.js environments

// Add fetch polyfill if not available (for Node.js < 18)
if (typeof globalThis.fetch === 'undefined') {
  try {
    // Try to import node-fetch
    const fetch = (await import('node-fetch')).default;
    globalThis.fetch = fetch;
    globalThis.Headers = (await import('node-fetch')).Headers;
    globalThis.Request = (await import('node-fetch')).Request;
    globalThis.Response = (await import('node-fetch')).Response;
    console.log('📦 Fetch polyfill loaded for Node.js compatibility');
  } catch (error) {
    console.warn('⚠️  Could not load fetch polyfill:', error.message);
  }
}

export default {}; 