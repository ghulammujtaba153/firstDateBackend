import express from 'express';
import { getMe, getUser, loginUser, onboarding, registerUser, resetPassword, updateUser, inviteUser, resetPasswordofInvitedUser } from '../controller/authController.js';



const authRouter = express.Router();

authRouter.post('/register', registerUser);
authRouter.post('/login', loginUser);
authRouter.post('/invite', inviteUser);
authRouter.put('/onboarding/:id', onboarding);
authRouter.put("/reset-password", resetPassword);

authRouter.put("/:id", updateUser);
authRouter.get("/:id", getUser);
authRouter.put("/invite/reset-password/:token", resetPasswordofInvitedUser);
authRouter.post("/me", getMe);

export default authRouter;