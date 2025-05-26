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
    origin: ["http://localhost:3000", process.env.FRONTEND_URL],
    methods: ["GET", "POST", "PUT", "DELETE"],
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