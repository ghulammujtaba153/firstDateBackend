import Package from "../models/packageModel.js";


export const createPackage = async (req, res) => {
    try {
        const pack = new Package(req.body);
        await pack.save();
        res.status(201).json(pack)
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
}


export const getPackages = async (req, res) => {
    try {
        const packages = await Package.find({})

        res.status(200).json(packages)
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
}


export const updatePackage = async (req, res) => {
    try {
        const packages = await Package.findByIdAndUpdate(req.params.id, req.body, { new: true })

        if (!packages) {
            return res.status(404).json({ error: "Package not found" })
        }

        res.status(200).json(packages)
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
}

export const deletePackage = async (req, res) => {
    try {
        const packages = await Package.findByIdAndDelete(req.params.id);

        if (!packages) {
            return res.status(404).json({ error: "Package not found" })
        }

        res.status(200).json({ message: "Package deleted successfully", package: packages })
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
}
