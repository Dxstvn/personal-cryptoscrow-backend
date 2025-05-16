export default {
  presets: [
    [
      '@babel/preset-env',
      {
        targets: {
          node: 'current', // Target the current version of Node.js
        },
        modules: false, // Preserve ES modules (do not transform to CommonJS)
      },
    ],
  ],
  // Add any other plugins or presets your project might need here
  // For example, if you were using React:
  // presets: [['@babel/preset-env', {targets: {node: 'current'}, modules: false}], '@babel/preset-react'],
}; 