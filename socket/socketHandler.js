/**
 * Socket.io handler for real-time chat and presence
 */

// Store online users and their socket IDs
const onlineUsers = new Map(); // userId -> Set of socketIds
const userSockets = new Map(); // socketId -> userId

/**
 * Initialize socket.io handlers
 */
export const initializeSocket = (io) => {
  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // Handle user login/connection
    socket.on('user:connect', (data) => {
      const { userId } = data;
      if (!userId) {
        socket.emit('error', { message: 'User ID is required' });
        return;
      }

      // Store user connection
      if (!onlineUsers.has(userId)) {
        onlineUsers.set(userId, new Set());
      }
      onlineUsers.get(userId).add(socket.id);
      userSockets.set(socket.id, userId);

      // Join user's personal room
      socket.join(`user:${userId}`);

      // Notify others that this user is online
      socket.broadcast.emit('user:online', { userId });

      console.log(`User ${userId} connected (socket: ${socket.id})`);
      console.log(`Total online users: ${onlineUsers.size}`);
    });

    // Handle joining a chat room
    socket.on('chat:join', (data) => {
      const { chatId } = data;
      if (!chatId) {
        socket.emit('error', { message: 'Chat ID is required' });
        return;
      }

      socket.join(`chat:${chatId}`);
      console.log(`Socket ${socket.id} joined chat: ${chatId}`);
    });

    // Handle leaving a chat room
    socket.on('chat:leave', (data) => {
      const { chatId } = data;
      if (chatId) {
        socket.leave(`chat:${chatId}`);
        console.log(`Socket ${socket.id} left chat: ${chatId}`);
      }
    });

    // Handle new message notification (message is already saved via HTTP API)
    // This is just for real-time broadcasting - the HTTP endpoint handles DB saving
    socket.on('message:send', async (data) => {
      try {
        const { chatId, message } = data;
        
        if (!chatId || !message) {
          socket.emit('error', { message: 'Chat ID and message are required' });
          return;
        }

        // Broadcast message to all users in the chat room (including sender for confirmation)
        io.to(`chat:${chatId}`).emit('message:new', {
          chatId,
          message
        });

        console.log(`Message broadcasted in chat ${chatId} by socket ${socket.id}`);
      } catch (error) {
        console.error('Error handling message:send:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Handle typing indicator
    socket.on('typing:start', (data) => {
      const { chatId, userId } = data;
      if (chatId && userId) {
        socket.to(`chat:${chatId}`).emit('typing:start', { userId, chatId });
      }
    });

    socket.on('typing:stop', (data) => {
      const { chatId, userId } = data;
      if (chatId && userId) {
        socket.to(`chat:${chatId}`).emit('typing:stop', { userId, chatId });
      }
    });

    // Handle call invitation
    socket.on('call:invite', (data) => {
      const { toUserId, callData } = data;
      if (toUserId && callData) {
        // Send to specific user
        io.to(`user:${toUserId}`).emit('call:invite', {
          from: userSockets.get(socket.id),
          ...callData
        });
        console.log(`Call invitation sent from ${userSockets.get(socket.id)} to ${toUserId}`);
      }
    });

    // Handle call response
    socket.on('call:response', (data) => {
      const { toUserId, responseType, callData } = data;
      if (toUserId && responseType) {
        io.to(`user:${toUserId}`).emit('call:response', {
          from: userSockets.get(socket.id),
          responseType,
          ...callData
        });
        console.log(`Call response (${responseType}) sent from ${userSockets.get(socket.id)} to ${toUserId}`);
      }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      const userId = userSockets.get(socket.id);
      
      if (userId) {
        // Remove socket from user's socket set
        const userSocketsSet = onlineUsers.get(userId);
        if (userSocketsSet) {
          userSocketsSet.delete(socket.id);
          
          // If user has no more sockets, remove from online users and notify
          if (userSocketsSet.size === 0) {
            onlineUsers.delete(userId);
            socket.broadcast.emit('user:offline', { userId });
            console.log(`User ${userId} went offline`);
          }
        }
        
        userSockets.delete(socket.id);
      }

      console.log(`Client disconnected: ${socket.id}`);
      console.log(`Total online users: ${onlineUsers.size}`);
    });
  });

  return io;
};

/**
 * Get online users count
 */
export const getOnlineUsers = () => {
  return Array.from(onlineUsers.keys());
};

/**
 * Check if user is online
 */
export const isUserOnline = (userId) => {
  return onlineUsers.has(userId) && onlineUsers.get(userId).size > 0;
};

