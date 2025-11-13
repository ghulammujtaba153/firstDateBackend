import exress from "express";
import { getAllUsers, getRecomendedUsers, getTimerStatus, resetTimerAndGetNewMatches, getUserStats, getAllUsersForAdmin } from "../controller/UserDashboarController.js";

const userDashboardRouter = exress.Router();

userDashboardRouter.get("/get/:id", getRecomendedUsers);
userDashboardRouter.get("/get", getAllUsers);
userDashboardRouter.get("/timer/status", getTimerStatus);
userDashboardRouter.post("/timer/reset", resetTimerAndGetNewMatches);
userDashboardRouter.get("/admin/stats", getUserStats);
userDashboardRouter.get("/admin/users", getAllUsersForAdmin);

export default userDashboardRouter;