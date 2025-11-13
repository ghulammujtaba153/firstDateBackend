import exress from "express";
import { getAllUsers, getRecomendedUsers, getTimerStatus, resetTimerAndGetNewMatches } from "../controller/UserDashboarController.js";

const userDashboardRouter = exress.Router();

userDashboardRouter.get("/get/:id", getRecomendedUsers);
userDashboardRouter.get("/get", getAllUsers);
userDashboardRouter.get("/timer/status", getTimerStatus);
userDashboardRouter.post("/timer/reset", resetTimerAndGetNewMatches);

export default userDashboardRouter;