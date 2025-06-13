import TestSequencer from '@jest/test-sequencer';

class E2ETestSequencer extends TestSequencer {
  sort(tests) {
    // Sort tests to run API tests first, then service tests
    // This helps manage resource cleanup better
    const apiTests = tests.filter(test => test.path.includes('/api/'));
    const serviceTests = tests.filter(test => test.path.includes('/services/'));
    const otherTests = tests.filter(test => !test.path.includes('/api/') && !test.path.includes('/services/'));
    
    // Run in order: API tests, service tests, then others
    return [...apiTests, ...serviceTests, ...otherTests];
  }

  // Optional: Can be used for custom sharding if needed
  // async shard(tests, options) {
  //   return await super.shard(tests, options);
  // }
}

export default E2ETestSequencer; 