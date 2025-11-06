import express from "express";
import { likeUser, checkLike, unlikeUser, getLikesCount } from "../controller/likeController.js";

const likeRouter = express.Router();

likeRouter.post("/", likeUser);
likeRouter.get("/check/:likedUserId", checkLike);
likeRouter.delete("/", unlikeUser);
likeRouter.get("/count/:userId", getLikesCount);

export default likeRouter;

