FROM node:20-bookworm-slim

RUN npm install -g opencode

EXPOSE 4096

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD node -e "fetch('http://localhost:4096/global/health').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"

CMD ["opencode", "serve", "--port", "4096", "--hostname", "0.0.0.0"]
