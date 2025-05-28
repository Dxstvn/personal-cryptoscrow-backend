import '../../../config/env.js';
import express from "express";
import loginRouter from "./loginSignUp.js";
import fileUploadRouter from "../database/fileUploadDownload.js";
import healthCheckRouter from "../health/health.js";
import contactRouter from "../contact/contactRoutes.js";
import transactionRouter from "../transaction/transactionRoutes.js";
import cors from "cors";

const app = express();

const corsOptions = {
    origin: [
        "http://localhost:3000", 
        "http://localhost:3001",
        "http://44.202.141.56:3000",
        "https://44.202.141.56:3000",
        process.env.FRONTEND_URL
    ].filter(Boolean),
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
    optionsSuccessStatus: 200
}

app.use(cors(corsOptions));
app.use(express.json());
app.use("/auth", loginRouter);
app.use("/files", fileUploadRouter);
app.use("/health", healthCheckRouter);
app.use("/contact", contactRouter);
app.use("/transaction", transactionRouter);


const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

export default app;