import express from "express";
import { getFirestore } from "firebase-admin/firestore";
import { getAdminApp } from "../auth/admin.js";

const router = express.Router();

// Simple health check without Firebase (for basic connectivity test)
router.get("/simple", (req, res) => {
  res.status(200).json({ 
    status: "OK", 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    port: process.env.PORT || 'unknown'
  });
});

// Helper function to get database
async function getDb() {
  const adminApp = await getAdminApp();
  console.log("Using adminApp:", adminApp.name); // Should log "adminApp"
  return getFirestore(adminApp);
}

// Function to ensure the health/status document exists
async function ensureHealthDocument() {
  const db = await getDb();
  const healthDocRef = db.collection("health").doc("status");
  const healthDoc = await healthDocRef.get();

  if (!healthDoc.exists) {
    // Create the document if it doesn't exist
    await healthDocRef.set({
      healthy: true,
      createdAt: new Date().toISOString(), // Add a timestamp for reference
    });
  }
}

// Full health check with Firebase
router.get("/", async (req, res) => {
  try {
    // Ensure the health document exists
    await ensureHealthDocument();

    // Check database connection by reading the health check document
    const db = await getDb();
    const healthDoc = await db.collection("health").doc("status").get();
    if (!healthDoc.exists) {
      throw new Error("Health check document not found");
    }
    res.status(200).json({ 
      status: "OK", 
      firebase: "connected",
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development'
    });
  } catch (error) {
    console.error("Health check failed:", error);
    res.status(500).json({ 
      error: "Internal Server Error", 
      details: error.message,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development'
    });
  }
});

export default router;