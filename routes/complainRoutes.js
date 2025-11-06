import express from 'express';
import { createComplain, deleteComplain, getComplain, getComplains, updateComplain } from '../controller/complainController.js';


const complainRouter = express.Router();

complainRouter.post('/create', createComplain)
complainRouter.get('/get', getComplains)
complainRouter.get('/get/:id', getComplain)
complainRouter.put('/update/:id', updateComplain)
complainRouter.delete('/delete/:id', deleteComplain)

export default complainRouter