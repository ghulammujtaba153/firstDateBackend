import express from 'express';
import { getMe, getUser, loginUser, onboarding, registerUser, resetPassword, updateUser, inviteUser } from '../controller/authController.js';



const authRouter = express.Router();

authRouter.post('/register', registerUser);
authRouter.post('/login', loginUser);
authRouter.post('/invite', inviteUser);
authRouter.put('/onboarding/:id', onboarding);
authRouter.put("/reset-password", resetPassword);

authRouter.put("/:id", updateUser);
authRouter.get("/:id", getUser);
authRouter.post("/me", getMe);

export default authRouter;