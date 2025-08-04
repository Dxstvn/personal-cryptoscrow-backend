import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const API_URL = 'http://localhost:3000';
const TEST_EMAIL = 'dustin.jasmin@jaspire.co';

async function testPasswordlessEmail() {
  try {
    console.log('🚀 Sending passwordless email to:', TEST_EMAIL);
    
    const response = await fetch(`${API_URL}/auth/passwordless/send-link`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: TEST_EMAIL
      })
    });

    const result = await response.json();
    
    if (response.ok) {
      console.log('✅ Email sent successfully!');
      console.log('📧 Check your inbox at:', TEST_EMAIL);
      console.log('Response:', result);
    } else {
      console.error('❌ Failed to send email:', result);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('\n⚠️  Make sure the backend server is running on port 3000');
    console.log('Run: npm run dev');
  }
}

testPasswordlessEmail();