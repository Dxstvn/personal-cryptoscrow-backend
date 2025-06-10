export default {
  presets: [
    [
      '@babel/preset-env',
      {
        targets: {
          node: 'current'
        },
        modules: false // Keep ES modules for modern Node.js
      }
    ]
  ],
  plugins: [
    'babel-plugin-transform-import-meta'
  ],
  env: {
    test: {
      presets: [
        [
          '@babel/preset-env',
          {
            targets: {
              node: 'current'
            },
            modules: 'auto' // Transform to CommonJS for Jest in test environment
          }
        ]
      ]
    }
  }
}; 