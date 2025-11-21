import express from "express"
import { createPackage, deletePackage, getPackages, updatePackage } from "../controller/packageController.js"


const packageRouter = express.Router()

packageRouter.post("/create", createPackage)
packageRouter.get("/get", getPackages);
packageRouter.put("/update/:id", updatePackage);
packageRouter.delete("/delete/:id", deletePackage)


export default packageRouter;