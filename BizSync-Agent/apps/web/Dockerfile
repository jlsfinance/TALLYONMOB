FROM node:20-alpine
WORKDIR /app
COPY package.json next.config.mjs ./
COPY app ./app
RUN npm i && npm run build
CMD ["npm","run","start"]
