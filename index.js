const express = require("express");
const socket = require("socket.io");
const cors = require('cors');

var mqtt = require('mqtt');
var clientMqtt = mqtt.connect('mqtt://localhost');

const app = express();
app.use(cors());

const PORT = 5005;
const MATRICULA = "123456789";
const BASE_TOPIC = `fse2021/${MATRICULA}/dispositivos/`;

const BASE_TOPIC_REGEX = new RegExp(`^fse2021/123456789/dispositivos/([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$`);
let esps = new Map();

const server = app.listen(PORT, function () {
  console.log(`Listening on port ${PORT}`);
  console.log(`http://localhost:${PORT}`);
});

const io = socket(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

io.on("connection", function (socket) {
  console.log("Made socket connection");

  socket.on("register", function (data) {
    io.emit("register", data);
    console.log(data);
    clientMqtt.publish(BASE_TOPIC + data.id, JSON.stringify({"local": data.local}));
    esps.set(data.id, data);
    console.log(esps);
  });
  
});


clientMqtt.on('connect', function () {
  clientMqtt.subscribe(BASE_TOPIC + "+", function (err) {
    if (err) {
      console.log(err);
    }
  })
});

clientMqtt.on('message', function (topic, message) {
  if (BASE_TOPIC_REGEX.test(topic)) {
    let messageJson = JSON.parse(message.toString());
    if (Object(messageJson).hasOwnProperty("id")) {
      esps.set(messageJson.id, messageJson);
      console.log(esps);
      io.emit("new esp", messageJson);
    }
  }
  console.log(topic);
  console.log(message.toString());
  // clientMqtt.end();
});