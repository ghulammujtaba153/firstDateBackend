import Subscription from "../models/subscriptionModel.js";
import Payment from "../models/paymentModel.js";
import CoupleMatch from "../models/coupleMatchModel.js";
import User from "../models/user.js";
import Event from "../models/eventModel.js";

export const getReportAnalytics = async (req, res) => {
    try {
        // Get date range from query params (optional)
        const { startDate, endDate } = req.query;

        const dateFilter = {};
        if (startDate && endDate) {
            dateFilter.createdAt = {
                $gte: new Date(startDate),
                $lte: new Date(endDate),
            };
        }

        // 1. TOTAL REVENUE (Subscriptions + Successful Payments)

        // Revenue from subscriptions
        const subscriptions = await Subscription.find({
            status: { $in: ['active', 'trialing'] },
            ...dateFilter,
        });
        const subscriptionRevenue = subscriptions.reduce((total, sub) => {
            return total + (sub.price || 0);
        }, 0);

        // Revenue from event payments (successful only) - FIXED: using paymentStatus instead of status
        const payments = await Payment.find({
            paymentStatus: 'succeeded',
            ...dateFilter,
        });
        const eventRevenue = payments.reduce((total, payment) => {
            return total + (payment.amount || 0);
        }, 0);

        const totalRevenue = subscriptionRevenue + eventRevenue;

        // 2. TOTAL USERS
        const totalUsers = await User.countDocuments();
        const activeUsers = await User.countDocuments({ isActive: true });
        const premiumUsers = await User.countDocuments({ isPremium: true });

        // 3. TOTAL COUPLE MATCHES
        const totalCoupleMatches = await CoupleMatch.countDocuments();
        const activeCoupleMatches = await CoupleMatch.countDocuments({
            status: 'active'
        });

        // 4. TOTAL EVENTS
        const totalEvents = await Event.countDocuments();
        const upcomingEvents = await Event.countDocuments({
            date: { $gte: new Date() },
        });
        const pastEvents = await Event.countDocuments({
            date: { $lt: new Date() },
        });

        // 5. REVENUE BY EVENTS (Top revenue-generating events) - FIXED: using paymentStatus
        const eventRevenueBreakdown = await Payment.aggregate([
            {
                $match: {
                    paymentStatus: 'succeeded',
                    ...dateFilter,
                },
            },
            {
                $group: {
                    _id: '$eventId',
                    totalRevenue: { $sum: '$amount' },
                    totalBookings: { $count: {} },
                },
            },
            {
                $lookup: {
                    from: 'events',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'eventDetails',
                },
            },
            {
                $unwind: {
                    path: '$eventDetails',
                    preserveNullAndEmptyArrays: true,
                },
            },
            {
                $project: {
                    eventId: '$_id',
                    eventTitle: '$eventDetails.title',
                    eventDate: '$eventDetails.date',
                    totalRevenue: 1,
                    totalBookings: 1,
                },
            },
            {
                $sort: { totalRevenue: -1 },
            },
            {
                $limit: 10,
            },
        ]);

        // 6. REVENUE BY SUBSCRIPTIONS (Breakdown by plan)
        const subscriptionRevenueBreakdown = await Subscription.aggregate([
            {
                $match: {
                    status: { $in: ['active', 'trialing'] },
                    ...dateFilter,
                },
            },
            {
                $group: {
                    _id: '$planName',
                    totalRevenue: { $sum: '$price' },
                    totalSubscribers: { $count: {} },
                },
            },
            {
                $project: {
                    planName: '$_id',
                    totalRevenue: 1,
                    totalSubscribers: 1,
                },
            },
            {
                $sort: { totalRevenue: -1 },
            },
        ]);

        // 7. USER GROWTH (Monthly growth over last 12 months)
        const twelveMonthsAgo = new Date();
        twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

        const userGrowth = await User.aggregate([
            {
                $match: {
                    createdAt: { $gte: twelveMonthsAgo },
                },
            },
            {
                $group: {
                    _id: {
                        year: { $year: '$createdAt' },
                        month: { $month: '$createdAt' },
                    },
                    newUsers: { $count: {} },
                },
            },
            {
                $sort: {
                    '_id.year': 1,
                    '_id.month': 1,
                },
            },
            {
                $project: {
                    _id: 0,
                    year: '$_id.year',
                    month: '$_id.month',
                    newUsers: 1,
                    monthName: {
                        $let: {
                            vars: {
                                monthsInString: [
                                    '', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                                    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
                                ],
                            },
                            in: {
                                $arrayElemAt: ['$$monthsInString', '$_id.month'],
                            },
                        },
                    },
                },
            },
        ]);

        // 8. TOP EVENTS (By attendance/bookings) - FIXED: using paymentStatus
        const topEvents = await Payment.aggregate([
            {
                $match: {
                    paymentStatus: 'succeeded',
                },
            },
            {
                $group: {
                    _id: '$eventId',
                    totalAttendees: { $count: {} },
                    totalRevenue: { $sum: '$amount' },
                },
            },
            {
                $lookup: {
                    from: 'events',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'eventDetails',
                },
            },
            {
                $unwind: {
                    path: '$eventDetails',
                    preserveNullAndEmptyArrays: true,
                },
            },
            {
                $project: {
                    eventId: '$_id',
                    eventTitle: '$eventDetails.title',
                    eventDate: '$eventDetails.date',
                    eventLocation: '$eventDetails.location',
                    eventImage: '$eventDetails.image',
                    totalAttendees: 1,
                    totalRevenue: 1,
                },
            },
            {
                $sort: { totalAttendees: -1 },
            },
            {
                $limit: 10,
            },
        ]);

        // 9. RECENT ACTIVITY SUMMARY - FIXED: using paymentStatus
        const recentSubscriptions = await Subscription.countDocuments({
            createdAt: {
                $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
            },
        });

        const recentPayments = await Payment.countDocuments({
            paymentStatus: 'succeeded',
            createdAt: {
                $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
            },
        });

        const recentMatches = await CoupleMatch.countDocuments({
            createdAt: {
                $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
            },
        });

        // 10. CONVERSION RATE
        const conversionRate = totalUsers > 0
            ? ((premiumUsers / totalUsers) * 100).toFixed(2)
            : 0;

        // Send comprehensive analytics response
        res.status(200).json({
            success: true,
            data: {
                // Overview
                overview: {
                    totalRevenue: Math.round(totalRevenue * 100) / 100,
                    subscriptionRevenue: Math.round(subscriptionRevenue * 100) / 100,
                    eventRevenue: Math.round(eventRevenue * 100) / 100,
                    totalUsers,
                    activeUsers,
                    premiumUsers,
                    totalCoupleMatches,
                    activeCoupleMatches,
                    totalEvents,
                    upcomingEvents,
                    pastEvents,
                    conversionRate: parseFloat(conversionRate),
                },

                // Revenue breakdown
                revenueBreakdown: {
                    byEvents: eventRevenueBreakdown,
                    bySubscriptions: subscriptionRevenueBreakdown,
                },

                // Growth metrics
                userGrowth,

                // Top performers
                topEvents,

                // Recent activity (last 30 days)
                recentActivity: {
                    newSubscriptions: recentSubscriptions,
                    completedPayments: recentPayments,
                    newMatches: recentMatches,
                },
            },
        });
    } catch (error) {
        console.error('Error fetching analytics:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch analytics data',
            message: error.message,
        });
    }
};