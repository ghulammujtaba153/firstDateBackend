import express from "express";
import { 
  verifyFace, 
  uploadFields, 
  startDiditWorkflow, 
  uploadWorkflowFields,
  getWorkflowStatus,
  diditWebhookCallback,
  diditBrowserCallback
} from "../controller/diditController.js";

const diditRouter = express.Router();

// Start DIDIT workflow - returns URL to redirect user to DIDIT's hosted UI
diditRouter.post("/workflow/start", startDiditWorkflow);
diditRouter.get("/workflow/status/:sessionId", getWorkflowStatus);

// DIDIT Browser callback (GET) - handles browser redirects after verification
diditRouter.get("/callback", diditBrowserCallback);

// DIDIT Webhook callback (POST) - receives verification status updates
diditRouter.post("/callback", express.json(), diditWebhookCallback);

// Legacy face verification endpoint (for backward compatibility - uses file upload)
diditRouter.post("/verify-face", uploadFields, verifyFace);

export default diditRouter;
