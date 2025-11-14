import User from "../models/user.js";
import Event from "../models/eventModel.js";
import Message from "../models/messageModel.js";
import Support from "../models/supportModel.js";
import Subscription from "../models/subscriptionModel.js";
import Payment from "../models/paymentModel.js";

export const getDashboardStats = async (req, res) => {
    try {
        // Total users
        const totalUsers = await User.countDocuments();

        // Total events
        const totalEvents = await Event.countDocuments();

        // Total messages
        const totalMessages = await Message.countDocuments();

        // Total calls (messages with videoCall or audioCall type)
        const totalCalls = await Message.countDocuments({
            messageType: { $in: ['videoCall', 'audioCall'] }
        });

        // Support requests
        const pendingSupportRequests = await Support.countDocuments({ status: 'pending' });
        const resolvedSupportRequests = await Support.countDocuments({ status: 'resolved' });

        // Revenue from app subscriptions (active subscriptions)
        const activeSubscriptions = await Subscription.find({ 
            status: 'active',
            currentPeriodStart: { $lte: new Date() },
            currentPeriodEnd: { $gte: new Date() }
        });
        const revenueFromSubscriptions = activeSubscriptions.reduce((sum, sub) => sum + (sub.price || 0), 0);

        // Revenue from events (successful payments)
        const successfulPayments = await Payment.find({ 
            paymentStatus: 'succeeded' 
        });
        const revenueFromEvents = successfulPayments.reduce((sum, payment) => sum + (payment.amount || 0), 0);

        // Recent activity - Support requests (last 10)
        const recentSupportRequests = await Support.find()
            .populate('userId', 'username email')
            .sort({ createdAt: -1 })
            .limit(10)
            .select('userId subject message status createdAt')
            .lean();

        // Recent activity - App subscriptions (last 10)
        const recentAppSubscriptions = await Subscription.find()
            .populate('userId', 'username email')
            .sort({ createdAt: -1 })
            .limit(10)
            .select('userId planName price status createdAt')
            .lean();

        // Recent activity - Event payments (last 10)
        const recentEventPayments = await Payment.find()
            .populate('userId', 'username email')
            .populate('eventId', 'title')
            .sort({ createdAt: -1 })
            .limit(10)
            .select('userId eventId amount paymentStatus createdAt')
            .lean();

        // Combine and format recent activity
        const recentActivity = [
            ...recentSupportRequests.map(item => ({
                id: item._id.toString(),
                type: 'support',
                title: item.status === 'pending' ? 'New support request' : 'Support request resolved',
                description: item.subject,
                time: item.createdAt,
                status: item.status === 'pending' ? 'urgent' : item.status === 'resolved' ? 'success' : 'info',
                user: item.userId?.username || item.userId?.email || 'Unknown User'
            })),
            ...recentAppSubscriptions.map(item => ({
                id: item._id.toString(),
                type: 'subscription',
                title: `${item.planName} subscription`,
                description: `$${item.price} - ${item.status}`,
                time: item.createdAt,
                status: item.status === 'active' ? 'success' : 'info',
                user: item.userId?.username || item.userId?.email || 'Unknown User'
            })),
            ...recentEventPayments.map(item => ({
                id: item._id.toString(),
                type: 'event',
                title: 'Event payment',
                description: `${item.eventId?.title || 'Event'} - $${item.amount}`,
                time: item.createdAt,
                status: item.paymentStatus === 'succeeded' ? 'success' : item.paymentStatus === 'pending' ? 'info' : 'urgent',
                user: item.userId?.username || item.userId?.email || 'Unknown User'
            }))
        ]
        .sort((a, b) => new Date(b.time) - new Date(a.time))
        .slice(0, 10)
        .map(item => ({
            ...item,
            time: formatTimeAgo(item.time)
        }));

        // Upcoming top 5 events
        const upcomingEvents = await Event.find({
            date: { $gte: new Date() },
            status: { $in: ['open', 'closed'] }
        })
        .populate('participants', 'username')
        .sort({ date: 1 })
        .limit(5)
        .select('title date time maxSlots participants price status')
        .lean();

        const formattedUpcomingEvents = upcomingEvents.map(event => {
            const eventDate = new Date(event.date);
            const now = new Date();
            const isToday = eventDate.toDateString() === now.toDateString();
            const isTomorrow = eventDate.toDateString() === new Date(now.getTime() + 24 * 60 * 60 * 1000).toDateString();
            
            let timeString = '';
            if (isToday) {
                timeString = `Today, ${event.time}`;
            } else if (isTomorrow) {
                timeString = `Tomorrow, ${event.time}`;
            } else {
                timeString = eventDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) + `, ${event.time}`;
            }

            const participantCount = event.participants?.length || 0;
            const fillPercentage = (participantCount / event.maxSlots) * 100;
            
            let status = 'open';
            if (event.status === 'closed') {
                status = 'upcoming';
            } else if (fillPercentage >= 90) {
                status = 'filling-up';
            } else {
                status = 'open';
            }

            return {
                id: event._id.toString(),
                title: event.title,
                participants: participantCount,
                maxParticipants: event.maxSlots,
                time: timeString,
                status: status,
                price: event.price
            };
        });

        // Calculate percentage changes (mock data for now - can be enhanced with historical data)
        const stats = {
            totalUsers: {
                value: totalUsers,
                change: "+12.5%", // This would be calculated from historical data
                changeType: "positive"
            },
            totalEvents: {
                value: totalEvents,
                change: "+8.2%",
                changeType: "positive"
            },
            totalMessages: {
                value: totalMessages,
                change: "+15.3%",
                changeType: "positive"
            },
            totalCalls: {
                value: totalCalls,
                change: "+23.1%",
                changeType: "positive"
            },
            pendingSupportRequests: {
                value: pendingSupportRequests,
                change: "-15.3%",
                changeType: "positive"
            },
            resolvedSupportRequests: {
                value: resolvedSupportRequests,
                change: "+10.5%",
                changeType: "positive"
            },
            revenueFromSubscriptions: {
                value: revenueFromSubscriptions,
                change: "+18.7%",
                changeType: "positive"
            },
            revenueFromEvents: {
                value: revenueFromEvents,
                change: "+25.4%",
                changeType: "positive"
            },
            totalRevenue: {
                value: revenueFromSubscriptions + revenueFromEvents,
                change: "+23.1%",
                changeType: "positive"
            },
            recentActivity,
            upcomingEvents: formattedUpcomingEvents
        };

        res.status(200).json(stats);
    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
    }
};

// Helper function to format time ago
function formatTimeAgo(date) {
    const now = new Date();
    const past = new Date(date);
    const diffInSeconds = Math.floor((now - past) / 1000);

    if (diffInSeconds < 60) {
        return `${diffInSeconds} seconds ago`;
    } else if (diffInSeconds < 3600) {
        const minutes = Math.floor(diffInSeconds / 60);
        return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
    } else if (diffInSeconds < 86400) {
        const hours = Math.floor(diffInSeconds / 3600);
        return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
    } else {
        const days = Math.floor(diffInSeconds / 86400);
        return `${days} ${days === 1 ? 'day' : 'days'} ago`;
    }
}
