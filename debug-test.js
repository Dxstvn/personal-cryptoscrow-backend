import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import request from 'supertest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load e2e environment variables
dotenv.config({ path: path.resolve(__dirname, '.env.test.e2e') });

console.log('Environment loaded:');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('PORT:', process.env.PORT);

async function testRoutes() {
  try {
    // Import the app
    const { default: app } = await import('./src/server.js');
    console.log('✅ App imported successfully');
    
    // Test health endpoint
    console.log('\n🔍 Testing /health endpoint...');
    const healthResponse = await request(app).get('/health');
    console.log('Health response:', {
      status: healthResponse.status,
      body: healthResponse.body,
      text: healthResponse.text
    });
    
    // Test auth signup endpoint
    console.log('\n🔍 Testing /auth/signup endpoint...');
    const signupResponse = await request(app)
      .post('/auth/signup')
      .send({
        email: 'test@example.com',
        password: 'testpass123',
        walletAddress: '0x1234567890123456789012345678901234567890'
      });
    console.log('Signup response:', {
      status: signupResponse.status,
      body: signupResponse.body,
      text: signupResponse.text
    });
    
    console.log('\n✅ Debug test complete');
  } catch (error) {
    console.error('❌ Error in debug test:', error);
  }
}

testRoutes(); 