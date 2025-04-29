# Starta från Node 20 baserad på Debian
FROM node:20-slim

# Arbetkatalog
WORKDIR /app

# Installera nödvändiga paket
RUN apt-get update && apt-get install -y \
    wget \
    curl \
    gnupg2 \
    fontconfig \
    xdg-utils \
    alsa-utils \
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
    libxcomposite1 \
    libxdamage1 \
    libxi6 \
    libxtst6 \
    pango1.0-tools \
    libcairo2 \
    xvfb \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Installera Microsoft Edge
RUN curl https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor > microsoft.gpg \
    && install -o root -g root -m 644 microsoft.gpg /etc/apt/trusted.gpg.d/ \
    && echo "deb [arch=amd64] https://packages.microsoft.com/repos/edge stable main" > /etc/apt/sources.list.d/microsoft-edge.list \
    && apt-get update \
    && apt-get install -y microsoft-edge-stable \
    && rm microsoft.gpg \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Kopiera hela projektet
COPY . .

# Installera Node-moduler
RUN npm install

# Installera Cypress
RUN npx cypress install

# Sätt miljövariabler
ENV NODE_ENV=production
ENV HELIX_URL=http://localhost:8008
ENV HELIX_USER=User
ENV HELIX_PASS=Password
ENV HELIX_RECORDING_FORM=hlx.cypress:Recordings
ENV HELIX_FORM=hlx.cypress:TestResults

# Ge exekveringsrättigheter till scripts
RUN chmod +x scripts/*.js
RUN chmod +x *.js

# Öppna API-port
EXPOSE 3000

# Starta API-server
CMD ["npm", "run", "api"]
