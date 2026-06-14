FROM node:20-alpine

WORKDIR /app

COPY backend/package.json backend/package-lock.json* ./backend/
RUN cd backend && npm install --omit=dev

COPY backend/src ./backend/src
COPY backend/scripts ./backend/scripts
COPY copa-2026-dashboard.html auth.html boloes.html styles.css ./
COPY js ./js
COPY data ./data

WORKDIR /app/backend

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["node", "src/index.js"]
