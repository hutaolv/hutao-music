FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY server/package.json server/
RUN npm install && npm install --prefix server
COPY . .
RUN npm run build
EXPOSE 3001
CMD ["node", "server/index.js"]