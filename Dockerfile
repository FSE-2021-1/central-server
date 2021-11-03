FROM node:14.11

WORKDIR /app

COPY package.json /app

RUN npm install --silent
RUN npm install -g nodemon

COPY . /app

EXPOSE 5005
# CMD [ "node", "index.js" ]
CMD [ "nodemon", "index.js" ]