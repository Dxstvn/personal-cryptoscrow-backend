import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { ethEscrowApp } from "./authIndex.js";
import { adminApp } from "./admin.js"; // Import the admin app
import express from "express";

const router = express.Router();

// Email/Password Sign-Up Route
router.post("/signUpEmailPass", async (req, res) => {
  // Validate inputs before Firebase call
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  try {
    const auth = getAuth(ethEscrowApp);
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    console.log('User created via email and password');
    res.status(201).json({ message: "User created", uid: user.uid });
  } catch (error) {
    console.log(error.code, error.message);
    res.status(401).json({ error: error.message });
  }
});

// Email/Password Sign-In Route
router.post("/signInEmailPass", async (req, res) => {
  // Validate inputs before Firebase call
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  try {
    const auth = getAuth(ethEscrowApp);
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    console.log("User signed in via email and password");
    res.status(200).json({ message: "User signed in", uid: user.uid });
    // Perform UID check before sending response
    if (user.uid !== "qmKQsr8ZKJb6p7HKeLRGzcB1dsA2" || decodedToken.email !== "andyrowe00@gmail.com") {
      throw new Error("Unauthorized user");
    }
  } catch (error) {
    console.log(error.code, error.message);
    res.status(401).json({ error: error.message });
  }
});

// Google Sign-In Route
router.post("/signInGoogle", async (req, res) => {
  // Validate idToken
  const { idToken } = req.body;
  if (!idToken) {
    return res.status(400).json({ error: "Missing ID token" });
  }

  try {
    const auth = getAdminAuth(adminApp); // No app argument needed for default Admin app
    const decodedToken = await auth.verifyIdToken(idToken);
    const uid = decodedToken.uid;
    // Perform UID check before sending response
    if (uid !== "qmKQsr8ZKJb6p7HKeLRGzcB1dsA2" || decodedToken.email !== "andyrowe00@gmail.com") {
      throw new Error("Unauthorized user");
    }

    // Send response with isAdmin for frontend
    res.status(200).json({
      message: "User authenticated",
      uid,
      isAdmin: uid === "qmKQsr8ZKJb6p7HKeLRGzcB1dsA2"
    });
  } catch (error) {
    console.error("Google Sign-In error:", error.message);
    res.status(401).json({ error: error.message });
  }
});

export default router;