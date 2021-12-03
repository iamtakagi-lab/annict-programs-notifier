FROM node:17

RUN apt-get update && apt-get -y install cron

WORKDIR /app
COPY package.json yarn.lock /app/
RUN yarn
COPY . /app/
RUN [ "yarn", "cross-env", "NODE_ENV=production", "webpack", "--mode", "production" ]

# 毎日 午前0時 に通知する
RUN echo '0 0 * * * * cd /app; node dist/main.js' > /var/spool/cron/crontabs/root