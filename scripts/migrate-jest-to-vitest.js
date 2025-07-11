#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function migrateTestFile(filePath) {
  try {
    let content = await fs.readFile(filePath, 'utf8');
    
    // Skip if already migrated
    if (content.includes('import { vi') || content.includes('from \'vitest\'')) {
      console.log(`✓ Already migrated: ${filePath}`);
      return;
    }
    
    // Replace Jest imports with Vitest
    content = content.replace(
      /import\s*{\s*jest\s*}\s*from\s*['"]@jest\/globals['"];?/g,
      'import { vi, describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from \'vitest\';'
    );
    
    // Add Vitest imports if not present
    if (!content.includes('from \'vitest\'') && content.includes('describe(')) {
      content = 'import { vi, describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from \'vitest\';\n' + content;
    }
    
    // Replace jest.fn() with vi.fn()
    content = content.replace(/jest\.fn\(/g, 'vi.fn(');
    
    // Replace jest.spyOn() with vi.spyOn()
    content = content.replace(/jest\.spyOn\(/g, 'vi.spyOn(');
    
    // Replace jest.mock() with vi.mock()
    content = content.replace(/jest\.mock\(/g, 'vi.mock(');
    
    // Replace jest.unmock() with vi.unmock()
    content = content.replace(/jest\.unmock\(/g, 'vi.unmock(');
    
    // Replace jest.clearAllMocks() with vi.clearAllMocks()
    content = content.replace(/jest\.clearAllMocks\(/g, 'vi.clearAllMocks(');
    
    // Replace jest.resetAllMocks() with vi.resetAllMocks()
    content = content.replace(/jest\.resetAllMocks\(/g, 'vi.resetAllMocks(');
    
    // Replace jest.restoreAllMocks() with vi.restoreAllMocks()
    content = content.replace(/jest\.restoreAllMocks\(/g, 'vi.restoreAllMocks(');
    
    // Replace jest.useFakeTimers() with vi.useFakeTimers()
    content = content.replace(/jest\.useFakeTimers\(/g, 'vi.useFakeTimers(');
    
    // Replace jest.useRealTimers() with vi.useRealTimers()
    content = content.replace(/jest\.useRealTimers\(/g, 'vi.useRealTimers(');
    
    // Replace jest.unstable_mockModule with vi.mock
    content = content.replace(/jest\.unstable_mockModule\(/g, 'vi.mock(');
    
    // Replace expect().toHaveBeenCalledTimes with expect().toHaveBeenCalledTimes
    // (This is already compatible, no change needed)
    
    // Write the updated content
    await fs.writeFile(filePath, content, 'utf8');
    console.log(`✅ Migrated: ${filePath}`);
    
  } catch (error) {
    console.error(`❌ Error migrating ${filePath}:`, error.message);
  }
}

async function findTestFiles(dir) {
  const testFiles = [];
  
  async function walk(currentDir) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      
      // Skip node_modules and contract directories
      if (entry.name === 'node_modules' || 
          entry.name === 'contract' || 
          entry.name === '.git') {
        continue;
      }
      
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.name.endsWith('.test.js') || entry.name.endsWith('.spec.js')) {
        testFiles.push(fullPath);
      }
    }
  }
  
  await walk(dir);
  return testFiles;
}

async function main() {
  console.log('🔄 Migrating test files from Jest to Vitest...\n');
  
  const projectRoot = path.join(__dirname, '..');
  const srcDir = path.join(projectRoot, 'src');
  
  // Find all test files
  const testFiles = await findTestFiles(srcDir);
  
  console.log(`Found ${testFiles.length} test files to migrate:\n`);
  
  // Migrate each file
  for (const file of testFiles) {
    await migrateTestFile(file);
  }
  
  console.log('\n✅ Migration complete!');
  console.log('\nNote: You may need to manually update:');
  console.log('- Complex mocking patterns');
  console.log('- Timer-related tests');
  console.log('- Module resolution issues');
}

main().catch(console.error);