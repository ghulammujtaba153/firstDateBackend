import express from "express";
import { verifyFace, uploadFields } from "../controller/diditController.js";

const diditRouter = express.Router();

// Face verification endpoint
diditRouter.post("/verify-face", uploadFields, verifyFace);

export default diditRouter;

