import axios from 'axios';

async function testPasswordlessAuth() {
  const API_URL = 'http://localhost:3000';
  const testEmail = 'dustin.jasmin@jaspire.co'; // Use your allowed email

  try {
    console.log('Testing passwordless authentication flow...\n');

    // Step 1: Send passwordless link
    console.log('1. Sending passwordless link to:', testEmail);
    const sendResponse = await axios.post(`${API_URL}/auth/passwordless/send-link`, {
      email: testEmail
    });

    console.log('Response:', sendResponse.data);
    console.log('\nSuccess! Check your email for the magic link.');
    console.log('The email should arrive from: noreply@clearhold.app');
    console.log('Subject: Sign in to ClearHold');
    
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

testPasswordlessAuth();