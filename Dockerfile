# Portable single-image build for LoanDr. (works on Railway, Fly.io, Render-Docker,
# Google Cloud Run, or any container host). Builds the frontend and runs the API,
# which serves the built frontend from the same origin.

# ---- build stage ----
FROM node:20-alpine AS build
WORKDIR /app

# Install frontend deps and build dist/
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Install server production deps
RUN npm --prefix server install --omit=dev

# ---- runtime stage ----
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000

COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server

EXPOSE 4000
CMD ["node", "server/src/index.js"]
