import express from 'express';
import { getUser, loginUser, registerUser, updateUser } from '../controller/authController.js';



const authRouter = express.Router();

authRouter.post('/register', registerUser);
authRouter.post('/login', loginUser);
authRouter.put("/:id", updateUser);
authRouter.get("/:id", getUser);

export default authRouter;