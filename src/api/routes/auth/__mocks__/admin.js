// Mock admin.js for testing
let mockAuth = null;

export function setMockAuth(auth) {
  mockAuth = auth;
}

export async function getAdminApp() {
  return {
    auth: () => mockAuth || {
      verifyIdToken: async (token) => {
        // Simple mock - extract user ID from token
        const userId = token.replace('test-token-', '');
        return { uid: userId };
      }
    }
  };
}

export default { getAdminApp, setMockAuth };