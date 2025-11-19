import express from 'express';
import {
  createMatch,
  deleteMatch,
  getAllMatches,
  getMatchById,
  updateMatch,
  getMatchesByUser,
  matchStats
} from '../controller/coupleMatchController.js';

const CoupleMatchRouter = express.Router();

CoupleMatchRouter.post('/match', createMatch);
CoupleMatchRouter.get('/matches', getAllMatches);
CoupleMatchRouter.get('/match/:id', getMatchById);
CoupleMatchRouter.put('/match/:id', updateMatch);
CoupleMatchRouter.delete('/match/:id', deleteMatch);

// New: get matches for a user
CoupleMatchRouter.get('/user/:userId', getMatchesByUser);

CoupleMatchRouter.get('/stats', matchStats)

export default CoupleMatchRouter;