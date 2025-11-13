import Support from "../models/supportModel.js";


export const createSupportTicket = async (req, res) => {
    try {
        const support = await Support.create(req.body);
        res.status(201).json({
            success: true,
            message: "Support ticket created successfully",
            support,
        })
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Failed to create support ticket",
            error: error.message,
        });
    }
}



export const getSupportTickets = async (req, res) => {
    try {
        const { userId, search, status } = req.query;
        
        // Build query
        const query = {};
        
        // Filter by user if provided
        if (userId) {
            query.userId = userId;
        }
        
        // Filter by status if provided
        if (status && status !== 'all') {
            query.status = status;
        }
        
        // Search functionality - search in subject, message, or user email/username
        let supportTickets = await Support.find(query)
            .populate('userId', 'username email')
            .sort({ createdAt: -1 });
        
        // If search query is provided, filter results
        if (search && search.trim()) {
            const searchLower = search.toLowerCase();
            supportTickets = supportTickets.filter(ticket => {
                const subjectMatch = ticket.subject?.toLowerCase().includes(searchLower);
                const messageMatch = ticket.message?.toLowerCase().includes(searchLower);
                const emailMatch = ticket.userId?.email?.toLowerCase().includes(searchLower);
                const usernameMatch = ticket.userId?.username?.toLowerCase().includes(searchLower);
                const statusMatch = ticket.status?.toLowerCase().includes(searchLower);
                
                return subjectMatch || messageMatch || emailMatch || usernameMatch || statusMatch;
            });
        }
        
        res.status(200).json({
            success: true,
            message: "Support tickets fetched successfully",
            supportTickets,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Failed to fetch support tickets",
            error: error.message,
        });
    }
}


export const getSupportTicketById = async (req, res) => {
    try {
        const supportTicket = await Support.findById(req.params.id).populate('userId', 'username email');
        if (!supportTicket) {
            return res.status(404).json({
                success: false,
                message: "Support ticket not found",
            });
        }
        res.status(200).json({
            success: true,
            message: "Support ticket fetched successfully",
            supportTicket,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Failed to fetch support ticket",
            error: error.message,
        });
    }
}


export const updateSupportTicket = async (req, res) => {
    try {
        const supportTicket = await Support.findByIdAndUpdate(
            req.params.id, 
            req.body, 
            { new: true }
        ).populate('userId', 'username email');
        
        if (!supportTicket) {
            return res.status(404).json({
                success: false,
                message: "Support ticket not found",
            });
        }
        
        res.status(200).json({
            success: true,
            message: "Support ticket updated successfully",
            supportTicket,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Failed to update support ticket",
            error: error.message,
        });
    }
}



export const deleteSupportTicket = async (req, res) => {
    try {
        const supportTicket = await Support.findByIdAndDelete(req.params.id);
        res.status(200).json({
            success: true,
            message: "Support ticket deleted successfully",
            supportTicket,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Failed to delete support ticket",
            error: error.message,
        });
    }
}