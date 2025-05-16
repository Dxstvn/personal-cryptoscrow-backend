// babel.config.js

/**
 * Configures Babel for the project.
 *
 * @param {object} api - Babel's API object, providing access to environment information.
 * @returns {object} Babel configuration object.
 */
export default function(api) {
    // Cache the configuration based on the api.env() value.
    // This helps Babel avoid re-executing this function unnecessarily.
    api.cache.using(() => process.env.NODE_ENV);
  
    const isTest = api.env('test');
    
    // Log when this config is loaded and what environment it sees
    console.log(`[babel.config.js] Loaded for NODE_ENV: '${process.env.NODE_ENV}'. isTest: ${isTest}`);
  
    const presets = [
      [
        '@babel/preset-env',
        {
          // Target the current version of Node.js being used for transpilation.
          targets: {
            node: 'current',
          },
          // Configure module transformation:
          // - For test environment: transform ES modules to CommonJS.
          // - For other environments: preserve ES modules (Node.js handles ESM natively 
          //   due to "type": "module" in package.json).
          modules: isTest ? 'commonjs' : false,
        },
      ],
    ];
  
    const plugins = [];
  
    // Conditionally add plugins for the test environment if needed.
    if (isTest) {
      // This plugin helps transform import.meta syntax (like import.meta.url)
      // into a CommonJS-compatible form.
      plugins.push('@babel/plugin-transform-import-meta');
    }
  
    return {
      presets,
      plugins,
      // Set sourceMaps to 'inline' if you need better debugging for transformed code,
      // though it can slightly increase bundle size/transpilation time.
      // sourceMaps: 'inline', 
    };
  }
  