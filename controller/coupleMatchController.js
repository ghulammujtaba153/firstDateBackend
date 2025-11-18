import CoupleMatch from "../models/coupleMatchModel.js";
import User from "../models/user.js";


export const createMatch = async (req, res) => {
    try {
        const match = await CoupleMatch.create(req.body);
        res.status(201).json(match);
    } catch (error) {
        res.status(500).json({ message: "Server Error", error: error.message });
    }
}


export const getAllMatches = async (req, res) => {
    try {
        const matches = await CoupleMatch.find()
            .populate('couple');
        res.status(200).json(matches);
    } catch (error) {
        res.status(500).json({ message: "Server Error", error: error.message });
    }
}


export const getMatchById = async (req, res) => {
    try {
        const match = await CoupleMatch.findById(req.params.id)
            .populate('couple');
        res.status(200).json(match);    
    } catch (error) {
        res.status(500).json({ message: "Server Error", error: error.message });
    }
}


export const updateMatch = async (req, res) => {
    try {
        const match = await CoupleMatch.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.status(200).json(match);
    } catch (error) {
        res.status(500).json({ message: "Server Error", error: error.message });
    }
}


export const deleteMatch = async (req, res) => {
    try {
        const match = await CoupleMatch.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: "Match deleted successfully" });
    } catch (error) {
        res.status(500).json({ message: "Server Error", error: error.message });;
    }
}

export const getMatchesByUser = async (req, res) => {
  try {
    const userId = req.params.userId;
    if (!userId) return res.status(400).json({ message: "userId is required" });

    // Find matches that include user
    const matches = await CoupleMatch.find({ couple: userId }).populate("couple");
    return res.status(200).json(matches);
  } catch (error) {
    return res.status(500).json({ message: "Server Error", error: error.message });
  }
};