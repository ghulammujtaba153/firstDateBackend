import express from "express";
import { getReportAnalytics } from "../controller/reportsAnalyticsController.js";

const reportRouter = express.Router();

// GET /api/report/analytics - Get comprehensive analytics data
reportRouter.get("/analytics", getReportAnalytics);

export default reportRouter;