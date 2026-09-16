# Production Dockerfile for AutomAIO (Playwright + Node.js + WebSockets)
FROM mcr.microsoft.com/playwright:v1.50.1-noble

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm ci

# Copy application source
COPY . .

# Build TypeScript
RUN npm run build

# Expose port (default 3000 or 7860 for Hugging Face Spaces)
ENV PORT=3000
ENV HOST=0.0.0.0
EXPOSE 3000 7860

# Start server
CMD ["node", "dist/cli/index.js", "serve"]
