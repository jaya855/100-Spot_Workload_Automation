FROM node:14

WORKDIR /usr/src/app


ENV PORT=3001 

RUN mkdir -p /home/app

COPY . .

EXPOSE 3001

CMD ["node", "index.js"]
