import Complain from "../models/complainsModel.js";


export const createComplain = async (req, res) => {
    try {
        const complain = await Complain.create(req.body);
        res.status(201).json(complain);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
}


export const getComplains = async (req, res) => {
    try {
        const complains = await Complain.find().populate('userId', 'name email');
        res.status(200).json(complains);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
}

export const getComplain = async (req, res) => {
    try {
        const complain = await Complain.findById(req.params.id).populate('userId', 'name email');
        res.status(200).json(complain);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
}


export const updateComplain = async (req, res) => {
    try {
        const complain = await Complain.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.status(200).json(complain);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
}


export const deleteComplain = async (req, res) => {
    try {
        const complain = await Complain.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: 'Complain deleted successfully' });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
}