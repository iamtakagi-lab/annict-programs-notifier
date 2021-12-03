FROM node:16

WORKDIR /app
COPY package.json yarn.lock /app/
RUN yarn
COPY . /app/
RUN [ "yarn", "cross-env", "NODE_ENV=production", "webpack", "--mode", "production" ]

# 毎日 16時 に通知する
RUN echo '0 16 * * * * cd /app; node dist/main.js' > /var/spool/cron/crontabs/root