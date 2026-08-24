FROM node:22-alpine
# 安装 tzdata 时区数据包：alpine 默认不含时区库，配合 docker-compose 的 TZ=Asia/Shanghai
# 才能让容器系统时间与 Node 进程时间都正确落到东八区，保证访问日志"凌晨归档"对齐北京时间
RUN apk add --no-cache tzdata
WORKDIR /app
COPY package.json ./
COPY server/package.json server/
RUN npm install && npm install --prefix server
COPY . .
RUN npm run build
EXPOSE 3001
CMD ["node", "server/index.js"]