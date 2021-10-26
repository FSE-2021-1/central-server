const express = require("express");
const socket = require("socket.io");
const cors = require('cors')

const PORT = 5000;
const app = express();

app.use(cors())

const server = app.listen(PORT, function () {
  console.log(`Listening on port ${PORT}`);
  console.log(`http://localhost:${PORT}`);
});

const io = socket(server);

io.on("connection", function (socket) {
  console.log("Made socket connection");

  socket.on("message", function (data) {
    io.emit("message", data);
    console.log(message);
  });
  
});