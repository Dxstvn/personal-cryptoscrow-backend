import express from "express";
import loginRouter from "./loginSignUp.js";
import fileUploadRouter from "../database/fileUpload.js";
import healthCheckRouter from "../health/health.js";
import contactRouter from "../contact/contactRoutes.js";

import cors from "cors";

const app = express();
const port = 3000;

const corsOptions = {
    origin: ["http://localhost:3000", process.env.FRONTEND_URL],
    methods: ["GET", "POST", "PUT", "DELETE"],
}

app.use(cors(corsOptions));
app.use(express.json());
app.use("/auth", loginRouter);
app.use("/files", fileUploadRouter);
app.use("/health", healthCheckRouter);
app.use("/api/contact", contactRouter);


app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

