import exress from "express";
import { getAllUsers, getRecomendedUsers } from "../controller/UserDashboarController.js";

const userDashboardRouter = exress.Router();

userDashboardRouter.get("/get/:id", getRecomendedUsers);
userDashboardRouter.get("/get", getAllUsers);

export default userDashboardRouter;