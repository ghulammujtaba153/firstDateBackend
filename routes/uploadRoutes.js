import express from "express";
import { upload, uploadFile } from "../controller/uploadController.js";

const uploadRouter = express.Router();

// Single file upload
uploadRouter.post("/file", upload.single('file'), uploadFile);

export default uploadRouter;

