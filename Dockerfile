FROM node:18-alpine

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install --production

COPY . .

# Create uploads directory and set permissions for the 'node' user
RUN mkdir uploads && chown -R node:node /usr/src/app

# Drop root privileges
USER node

EXPOSE 3000
CMD [ "npm", "start" ]
