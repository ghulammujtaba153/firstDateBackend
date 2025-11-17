import express from "express";
import {  
  startDiditWorkflow, 
  diditWebhookCallback,
} from "../controller/diditController.js";

const diditRouter = express.Router();


diditRouter.post("/workflow/start", startDiditWorkflow);


diditRouter.post("/callback", express.json(), diditWebhookCallback);



export default diditRouter;
