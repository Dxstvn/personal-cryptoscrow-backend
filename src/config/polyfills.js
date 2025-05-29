// src/config/polyfills.js
// Polyfills for Node.js environments - MUST run before any Firebase imports

console.log('🔧 Loading polyfills...');

// Check Node.js version
const nodeVersion = process.version;
const nodeMajorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);

console.log(`Node.js version: ${nodeVersion} (major: ${nodeMajorVersion})`);

// Node.js 18+ has native fetch, so we only need polyfills for older versions
if (nodeMajorVersion >= 18) {
  console.log('✅ Node.js 18+ detected - using native fetch');
  
  // Ensure AbortController is available (should be native in Node.js 18+)
  if (typeof globalThis.AbortController === 'undefined') {
    console.warn('⚠️  AbortController not available, trying to load polyfill...');
    try {
      const { AbortController } = await import('node-abort-controller');
      globalThis.AbortController = AbortController;
      console.log('📦 AbortController polyfill loaded');
    } catch (error) {
      console.warn('⚠️  AbortController polyfill failed:', error.message);
    }
  }
} else {
  // Node.js < 18 needs fetch polyfill
  console.log('⚠️  Node.js < 18 detected - loading fetch polyfill...');
  
  if (typeof globalThis.fetch === 'undefined') {
    try {
      const nodeFetch = await import('node-fetch');
      globalThis.fetch = nodeFetch.default;
      globalThis.Headers = nodeFetch.Headers;
      globalThis.Request = nodeFetch.Request;
      globalThis.Response = nodeFetch.Response;
      console.log('📦 Fetch polyfill loaded for Node.js compatibility');
    } catch (error) {
      console.error('❌ Failed to load fetch polyfill:', error.message);
      console.error('❌ Firebase will not work properly without fetch!');
      throw error;
    }
  }

  // Load AbortController polyfill for older Node.js
  if (typeof globalThis.AbortController === 'undefined') {
    try {
      const { AbortController } = await import('node-abort-controller');
      globalThis.AbortController = AbortController;
      console.log('📦 AbortController polyfill loaded');
    } catch (error) {
      console.warn('⚠️  AbortController polyfill not available:', error.message);
    }
  }
}

// Ensure FormData is available (usually native in Node.js 18+)
if (typeof globalThis.FormData === 'undefined') {
  try {
    const formDataPolyfill = await import('formdata-node');
    globalThis.FormData = formDataPolyfill.FormData;
    console.log('📦 FormData polyfill loaded');
  } catch (error) {
    console.warn('⚠️  FormData polyfill not available:', error.message);
  }
}

console.log('✅ Polyfills setup completed successfully');

export default {}; 