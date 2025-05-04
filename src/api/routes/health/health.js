import express from "express";
import { getFirestore } from "firebase-admin/firestore";
import { adminApp } from "../auth/admin.js";

const router = express.Router();
console.log("Using adminApp:", adminApp.name); // Should log "adminApp"
const db = getFirestore(adminApp);

// Function to ensure the health/status document exists
async function ensureHealthDocument() {
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

router.get("/health", async (req, res) => {
  try {
    // Ensure the health document exists
    await ensureHealthDocument();

    // Check database connection by reading the health check document
    const healthDoc = await db.collection("health").doc("status").get();
    if (!healthDoc.exists) {
      throw new Error("Health check document not found");
    }
    res.status(200).json({ status: "OK" });
  } catch (error) {
    console.error("Health check failed:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;