import express from 'express';
import { getDashboardStats } from '../controller/dashboardStatsController.js';

const dashboardStatsRouter = express.Router();

dashboardStatsRouter.get('/stats', getDashboardStats);

export default dashboardStatsRouter;

