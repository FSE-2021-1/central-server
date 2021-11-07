const express = require("express");
const socket = require("socket.io");
const cors = require("cors");

const PoweredMap = require("./poweredmap.js");

var mqtt = require("mqtt");

var clientMqtt = mqtt.connect(
  process.env.BROKER_URL ?? "mqtt://broker-mosquitto"
);

const CSV = require("winston-csv-format").default;
const { createLogger, transports } = require("winston");

const csvHeaders = {
  created: "Creation Date",
  origin: "Origin",
  destination: "Destination",
  topic: "Topic",
  description: "Description",
};

const logger = createLogger({
  level: "info",
  format: CSV(["created", "origin", "destination", "topic", "description"], {
    delimiter: ";",
  }),
  transports: [new transports.File({ filename: "log_" + Date.now() + ".csv" })],
});

const app = express();
app.use(cors());

const PORT = 5005;
const MATRICULA = process.env.MATRICULA ?? "123456789";
const BASE_TOPIC = `fse2021/${MATRICULA}/dispositivos/`;

const BASE_TOPIC_REGEX = new RegExp(
  String.raw`^fse2021/${MATRICULA}/dispositivos/([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$`
);

const TEMP_ESP_REGEX = new RegExp(
  String.raw`^fse2021/${MATRICULA}/([0-9a-zA-Z]+)/(temperatura|umidade|estado)$`
);

const MEASURES = {
  temperatura: "temperature",
  umidade: "humidity",
};

let esps = new PoweredMap();

const processESP = () => {
  const data = [];
  const pending = [];
  Array.from(esps.values()).forEach((esp) => {
    if (esp.isPending) {
      pending.push(esp);
    } else {
      data.push(esp);
    }
  });
  return { data, pending };
};

esps.setUpdateCallback(function () {
  const { data, pending } = processESP();
  io.emit("state", data, pending);
  logger.log("info", {
    created: new Date(),
    origin: "central-server",
    destination: "client",
    topic: "state",
    description: "Sending state of the ESPs",
  });
});

const server = app.listen(PORT, function () {
  console.log(`Listening on port ${PORT}`);
  console.log(`http://localhost:${PORT}`);
  logger.log("info", csvHeaders);
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
    logger.log("info", {
      created: new Date(),
      origin: "client",
      destination: "central-server",
      topic: "register",
      description: "Registering ESP@" + data.id,
    });
    io.emit("register", data);
    clientMqtt.publish(
      BASE_TOPIC + data.id,
      JSON.stringify({ local: data.local })
    );
    logger.log("info", {
      created: new Date(),
      origin: "central-server",
      destination: "esp",
      topic: "register",
      description: "Sending register message to ESP@" + data.id,
    });
    const { input, output } = data;
    esps.set(data.id, {
      ...data,
      input: { name: input, value: 0 },
      output: { name: output, value: 0 },
      temperature: null,
      humidity: null,
    });
    clientMqtt.subscribe(`fse2021/${MATRICULA}/${data.local}/+`);
  });

  socket.on("req state", function (socketId) {
    logger.log("info", {
      created: new Date(),
      origin: "client",
      destination: "central-server",
      topic: "req state",
      description: "Requesting state of all ESPs",
    });
    const { data, pending } = processESP();
    socket.emit("state", data, pending);
    logger.log("info", {
      created: new Date(),
      origin: "central-server",
      destination: "client",
      topic: "state",
      description: "Sending state of the ESPs",
    });
  });

  socket.on("push output state", function (id, value) {
    logger.log("info", {
      created: new Date(),
      origin: "client",
      destination: "central-server",
      topic: "push output state",
      description: "Pushing output state of ESP@" + id,
    });
    const esp = esps.get(id);
    esp.output.value = value;
    clientMqtt.publish(
      `fse2021/${MATRICULA}/${esp.local}/estado`,
      JSON.stringify({ out: value })
    );
    logger.log("info", {
      created: new Date(),
      origin: "central-server",
      destination: "esp",
      topic: "push output state",
      description: "Sending push output state message to ESP@" + id,
    });
    esps.set(id, esp);
  });

  socket.on("delete esp", function (id) {
    logger.log("info", {
      created: new Date(),
      origin: "client",
      destination: "central-server",
      topic: "delete esp",
      description: "Deleting ESP@" + id,
    });
    const esp = esps.get(id);
    clientMqtt.unsubscribe(`fse2021/${MATRICULA}/${esp.local}/+`);
    clientMqtt.publish(BASE_TOPIC + id, JSON.stringify({ unregister: true }));
    logger.log("info", {
      created: new Date(),
      origin: "central-server",
      destination: "esp",
      topic: "delete esp",
      description: "Sending unregister message to ESP@" + id,
    });
    esp.isPending = true;
    esps.set(id, esp);
  });
});

clientMqtt.on("connect", function () {
  logger.log("info", {
    created: new Date(),
    origin: "central-server",
    destination: "-",
    topic: "connect",
    description: "Connected to MQTT broker",
  });
  clientMqtt.subscribe(BASE_TOPIC + "+", function (err) {
    if (err) {
      console.log(err);
    }
  });
});

setInterval(() => {
  logger.log("info", {
    created: new Date(),
    origin: "central-server",
    destination: "-",
    topic: "-",
    description: "Checking ESPs Health",
  });
  // check if espTimestamp is older than 1min
  const shouldDelete = Array.from(esps.values).filter(
    (esp) => esp.espTimestamp && Date.now() - esp.espTimestamp > 60000
  );
  // TODO delete power ESPs specially
  shouldDelete.forEach((esp) => {
    if (!esp.isPending) {
      clientMqtt.unsubscribe(`fse2021/${MATRICULA}/${esp.local}/+`);
      clientMqtt.publish(
        BASE_TOPIC + esp.id,
        JSON.stringify({ unregister: true })
      );
    }
    esps.delete(esp.id);
  });
  if (shouldDelete.length > 0) {
    logger.log("info", {
      created: new Date(),
      origin: "central-server",
      destination: "-",
      topic: "-",
      description:
        "Removing ESPs: " + shouldDelete.map((esp) => esp.id).join(", "),
    });
  }
}, 5000);

clientMqtt.on("message", function (topic, message) {
  logger.log("info", {
    created: new Date(),
    origin: "esp",
    destination: "central-server",
    topic: topic,
    description: "Received message on mqtt's topic",
  });
  let messageJson = JSON.parse(message.toString());
  if (BASE_TOPIC_REGEX.test(topic)) {
    if (Object(messageJson).hasOwnProperty("id")) {
      logger.log("info", {
        created: new Date(),
        origin: "central-server",
        destination: "-",
        topic: "register",
        description: `Added ESP@${messageJson.id} as pending register`,
      });
      esps.set(messageJson.id, {
        ...messageJson,
        isPending: true,
        espTimestamp: Date.now(),
      });
    }
  } else if (TEMP_ESP_REGEX.test(topic)) {
    const local = TEMP_ESP_REGEX.exec(topic)[1];
    const measure = TEMP_ESP_REGEX.exec(topic)[2];
    logger.log("info", {
      created: new Date(),
      origin: "esp",
      destination: "central-server",
      topic: measure,
      description: `Received ${measure} from ESP in ${local}`,
    });
    Array.from(esps.values()).forEach((esp) => {
      if (esp.local === local) {
        if (measure === "estado") {
          if (messageJson.hasOwnProperty("in")) {
            esp.input.value = messageJson.in;
          }
        } else {
          esp[MEASURES[measure]] = messageJson.value;
        }
        esp.espTimestamp = Date.now();
        esps.set(esp.id, esp);
      }
    });
  }
});
