import User from "../models/user.js"


export const getRecomendedUsers = async(req, res) => {
    const { id } = req.params

    try {
        const users = await User.find({onboardingComlete: true})
        res.status(200).json(users)
    } catch (error) {
        res.status(500).json({ error: "Server error" });
    }
}


export const getAllUsers = async (req, res) => {
    try {
        const users = await User.find({onboardingComlete: true})
        res.status(200).json(users)
    } catch (error) {
        console.log(error.message)
        res.status(500).json({ error: "Server error" });
    }
}