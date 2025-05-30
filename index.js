const { Server } = require("socket.io");
// const express = require('express')

// const app = express()


// app.get('/health', (req, res) => {
//   return res.status(200).send('healthy...');
// });

const io = new Server(9000, {
  cors: true,
});

// Store user information
const rooms = {};
const userDetails = new Map(); 

io.on("connection", (socket) => {
  console.log(`Socket Connected`, socket.id);

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
  });
});


// app.listen(8888,()=>{
//   console.log('server running');
  
// })