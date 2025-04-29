import { initializeApp, cert } from 'firebase-admin/app';


export const adminApp = initializeApp({
  credential: cert(process.env.GOOGLE_APPLICATION_CREDENTIALS),
});
