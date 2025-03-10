FROM node:18-slim

# Install required tools
RUN apt-get update && apt-get install -y curl unzip git python3 make g++ tini && \
    curl -fsSL https://bun.sh/install | bash && \
    npm install -g typescript tsx ws

ENV PATH="/root/.bun/bin:${PATH}"
ENV NODE_ENV=development

WORKDIR /app

# Use tini as an init system to handle signals properly
ENTRYPOINT ["/usr/bin/tini", "--"]

CMD ["echo", "Ready to run services"]