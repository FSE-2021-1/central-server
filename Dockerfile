FROM node:14.11

WORKDIR /app

COPY package.json /app

RUN npm install --silent

COPY . /app

EXPOSE 5000
CMD [ "node", "index.js" ]