const express = require("express");
const socket = require("socket.io");
const cors = require("cors");

const PoweredMap = require("./poweredmap.js");

var mqtt = require("mqtt");
var clientMqtt = mqtt.connect("mqtt://broker-mosquitto");

const app = express();
app.use(cors());

const PORT = 5005;
const MATRICULA = "123456789";
const BASE_TOPIC = `fse2021/${MATRICULA}/dispositivos/`;

const BASE_TOPIC_REGEX = new RegExp(String.raw 
  `^fse2021/${MATRICULA}/dispositivos/([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$`
);

const TEMP_ESP_REGEX = new RegExp(
  String.raw
  `^fse2021/${MATRICULA}/([0-9a-zA-Z]+)/(temperatura|umidade)$`
);

const MEASURES = {
  "temperatura": "temperature",
  "umidade": "humidity",
}

let esps = new PoweredMap();
esps.setUpdateCallback(function () {
  io.emit("state", Array.from(esps.values()));
});

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
    clientMqtt.publish(
      BASE_TOPIC + data.id,
      JSON.stringify({ local: data.local })
    );
    const { input, output } = data;
    esps.set(data.id, {
      ...data,
      input: { name: input, value: 0 },
      output: { name: output, value: 0 },
      temperature: null,
      humidity: null,
    });
    clientMqtt.subscribe(`fse2021/${MATRICULA}/${data.local}/+`);
    console.log(`ESP32: ${data.id} registered!`);
  });

  socket.on("req state", function (socketId) {
    console.log(`Front: ${socketId} requested state`);
    socket.emit("state", Array.from(esps.values()));
  });

  socket.on("push output state", function (id, value) {
    const esp = esps.get(id);
    esp.output.value = value;
    clientMqtt.publish(
      `fse2021/${MATRICULA}/${esp.local}/estado`,
      JSON.stringify({ state: value })
    );
    esps.set(id, esp);
  });
});

clientMqtt.on("connect", function () {
  clientMqtt.subscribe(BASE_TOPIC + "+", function (err) {
    if (err) {
      console.log(err);
    }
  });
});

clientMqtt.on("message", function (topic, message) {
  let messageJson = JSON.parse(message.toString());
  if (BASE_TOPIC_REGEX.test(topic)) {
    if (Object(messageJson).hasOwnProperty("id")) {
      esps.set(messageJson.id, messageJson);
      io.emit("new esp", messageJson);
    }
  } else if (TEMP_ESP_REGEX.test(topic)) {
    const local = TEMP_ESP_REGEX.exec(topic)[1];
    const measure = TEMP_ESP_REGEX.exec(topic)[2];
    Array.from(esps.values()).forEach((esp) => {
      if (esp.local === local) {
        esp[MEASURES[measure]] = messageJson.value;
        esps.set(esp.id, esp);
        console.log(`ESP32: ${esp.id} updated!`);
      }
    });
  }

});
