FROM node:20-alpine
WORKDIR /app

# Copy server deps
COPY server/package*.json ./server/
RUN cd server && npm ci --production

# Copy source files
COPY server/src/ ./server/src/
COPY shared/ ./shared/
COPY client/ ./client/

WORKDIR /app/server
EXPOSE 3080
CMD ["node", "src/index.js"]
