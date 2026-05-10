FROM node:20-alpine
WORKDIR /app
COPY package.json tsconfig.json ./
COPY src ./src
RUN npm i && npm run build
CMD ["node","dist/main.js"]
