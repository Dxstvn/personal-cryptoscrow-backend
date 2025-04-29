import express from "express";

const router = express.Router();

router.get("/health", async (req, res) => {
  try {
    // Check if the server is running
    res.status(200).json({ status: "OK" });
  } catch (error) {
    console.error("Health check failed:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;