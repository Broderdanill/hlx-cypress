# 1. Starta från Node 20
FROM node:20-bullseye-slim

# 2. Arbetkatalog
WORKDIR /app

# 3. Installera nödvändiga paket + Microsoft Edge + Xvfb och alla beroenden för Cypress GUI/headless
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    gnupg \
    apt-transport-https \
    software-properties-common \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libgdk-pixbuf2.0-0 \
    libnspr4 \
    libnss3 \
    libxss1 \
    libx11-xcb1 \
    libgbm-dev \
    libgtk-3-0 \
    lsb-release \
    xdg-utils \
    xvfb \
    && curl https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor > microsoft.gpg \
    && install -o root -g root -m 644 microsoft.gpg /etc/apt/trusted.gpg.d/ \
    && sh -c 'echo "deb [arch=amd64] https://packages.microsoft.com/repos/edge stable main" > /etc/apt/sources.list.d/microsoft-edge-dev.list' \
    && apt-get update \
    && apt-get install -y microsoft-edge-stable \
    && rm microsoft.gpg \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# 4. Kopiera in hela ditt projekt
COPY . .

# 5. Installera Node.js dependencies
RUN npm install

# 6. Installera Cypress binärfiler
RUN npx cypress install

# 5. Sätt default miljövariabler
ENV NODE_ENV=production
ENV HELIX_URL=http://localhost:8008
ENV HELIX_USER=User
ENV HELIX_PASS=Password
ENV HELIX_RECORDING_FORM=hlx.cypress:Recordings
ENV HELIX_FORM=hlx.cypress:TestResults

# 6. Se till att alla scripts är körbara
RUN chmod +x scripts/*.js
RUN chmod +x *.js

# 7. Standardkommando när containern startar:
CMD ["sh", "-c", "node scripts/fetch-recordings.js && npm run test:db"]
