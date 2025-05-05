const { Server } = require("socket.io");

const io = new Server(9000, {
  cors: true,
});

// Store user information
const rooms = {}; 
const userDetails = new Map();

// Stranger chat queue and connections
const strangerQueue = [];
const strangerConnections = new Map();

io.on("connection", (socket) => {
  console.log(`Socket Connected`, socket.id);

  // ROOM-BASED CHAT FUNCTIONALITY (EXISTING)
  // =======================================

  // Handle user joining a room
  socket.on("room:join", (data) => {
    const { email, room } = data;
    
    // Store user details
    userDetails.set(socket.id, { email, roomId: room });
    
    // Add user to room
    if (!rooms[room]) {
      rooms[room] = new Set();
    }
    rooms[room].add(socket.id);
    
    // Join socket room
    socket.join(room);
    
    // Notify everyone in the room that a new user has joined
    socket.to(room).emit("user:joined", { email, id: socket.id });
    
    // Send existing users in the room to the new user
    const existingUsers = [];
    
    rooms[room].forEach(userId => {
      if (userId !== socket.id) {
        const user = userDetails.get(userId);
        if (user) {
          existingUsers.push({ email: user.email, id: userId });
        }
      }
    });
    
    console.log(`User ${email} joined room ${room}. Current users: ${rooms[room].size}`);
    console.log(`Sending ${existingUsers.length} existing users to new user`);
    
    // Send existing users list to the new user
    io.to(socket.id).emit("room:users", existingUsers);
    io.to(socket.id).emit("room:join", data);
  });

  // STRANGER CHAT FUNCTIONALITY (NEW)
  // ================================

  // Find a stranger to chat with
  socket.on("stranger:find", () => {
    console.log(`User ${socket.id} is looking for a stranger`);
    
    // First, check if user is already in a stranger chat
    if (strangerConnections.has(socket.id)) {
      const currentStrangerId = strangerConnections.get(socket.id);
      
      // If yes, disconnect from current stranger first
      disconnectStrangers(socket.id, currentStrangerId);
    }
    
    // Then, check if there's someone in the queue
    if (strangerQueue.length > 0) {
      // Remove first user from queue
      const strangerId = strangerQueue.shift();
      
      // Make sure the stranger is still connected
      if (io.sockets.sockets.has(strangerId)) {
        // Connect the two users
        connectStrangers(socket.id, strangerId);
      } else {
        // If the stranger is no longer connected, add this user to queue
        strangerQueue.push(socket.id);
      }
    } else {
      // If no one is waiting, add this user to queue
      strangerQueue.push(socket.id);
    }
  });

  // Skip current stranger and find a new one
  socket.on("stranger:skip", ({ strangerId }) => {
    console.log(`User ${socket.id} wants to skip stranger ${strangerId}`);
    
    if (strangerConnections.has(socket.id) && strangerConnections.get(socket.id) === strangerId) {
      // Disconnect the two users
      disconnectStrangers(socket.id, strangerId);
      
      // Put the skipping user back in queue
      strangerQueue.push(socket.id);
    }
  });

  // Send message to stranger
  socket.on("stranger:message", ({ to, message }) => {
    console.log(`User ${socket.id} sent message to stranger ${to}`);
    io.to(to).emit("stranger:message", { from: socket.id, message });
  });

  // Disconnect from stranger
  socket.on("stranger:disconnect", ({ strangerId }) => {
    console.log(`User ${socket.id} is disconnecting from stranger ${strangerId}`);
    
    if (strangerConnections.has(socket.id) && strangerConnections.get(socket.id) === strangerId) {
      disconnectStrangers(socket.id, strangerId);
    }
  });

  // COMMON WEBRTC SIGNALING (EXISTING)
  // ================================

  // Handle user calling another user
  socket.on("user:call", ({ to, offer }) => {
    console.log(`User ${socket.id} is calling user ${to}`);
    io.to(to).emit("incoming:call", { from: socket.id, offer });
  });

  // Handle call acceptance
  socket.on("call:accepted", ({ to, ans }) => {
    console.log(`User ${socket.id} accepted call from ${to}`);
    io.to(to).emit("call:accepted", { from: socket.id, ans });
  });

  // Handle negotiation needed
  socket.on("peer:nego:needed", ({ to, offer }) => {
    io.to(to).emit("peer:nego:needed", { from: socket.id, offer });
  });

  // Handle negotiation completion
  socket.on("peer:nego:done", ({ to, ans }) => {
    io.to(to).emit("peer:nego:final", { from: socket.id, ans });
  });

  // Handle user disconnection
  socket.on("disconnect", () => {
    // Handle room-based disconnection
    const userInfo = userDetails.get(socket.id);
    
    if (userInfo) {
      const { roomId, email } = userInfo;
      
      // Remove user from room
      if (rooms[roomId]) {
        rooms[roomId].delete(socket.id);
        console.log(`User ${email} (${socket.id}) left room ${roomId}. Remaining users: ${rooms[roomId].size}`);
        
        // If room is empty, delete it
        if (rooms[roomId].size === 0) {
          delete rooms[roomId];
          console.log(`Room ${roomId} deleted because it's empty`);
        } else {
          // Notify others in the room that the user has left
          socket.to(roomId).emit("user:left", { id: socket.id });
        }
      }
      
      // Remove user details
      userDetails.delete(socket.id);
    }

    // Handle stranger-based disconnection
    if (strangerConnections.has(socket.id)) {
      const strangerId = strangerConnections.get(socket.id);
      disconnectStrangers(socket.id, strangerId);
    }
    
    // Remove from stranger queue if present
    const queueIndex = strangerQueue.indexOf(socket.id);
    if (queueIndex !== -1) {
      strangerQueue.splice(queueIndex, 1);
    }
  });
});

// Helper function to connect two strangers
function connectStrangers(user1Id, user2Id) {
  console.log(`Connecting strangers: ${user1Id} and ${user2Id}`);
  
  // Store connections
  strangerConnections.set(user1Id, user2Id);
  strangerConnections.set(user2Id, user1Id);
  
  // Notify both users
  io.to(user1Id).emit("stranger:connected", { strangerId: user2Id });
  io.to(user2Id).emit("stranger:connected", { strangerId: user1Id });
}

// Helper function to disconnect two strangers
function disconnectStrangers(user1Id, user2Id) {
  console.log(`Disconnecting strangers: ${user1Id} and ${user2Id}`);
  
  // Remove connections
  strangerConnections.delete(user1Id);
  strangerConnections.delete(user2Id);
  
  // Notify both users
  io.to(user1Id).emit("stranger:disconnected");
  io.to(user2Id).emit("stranger:disconnected");
}