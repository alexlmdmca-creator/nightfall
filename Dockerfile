# Imagen del servidor de NIGHTFALL: sirve el juego y lleva las salas en línea.
# Vale para cualquier alojamiento de contenedores (Back4app Containers, entre otros).
FROM node:22-alpine

WORKDIR /app

# Sólo las dependencias de ejecución (three y ws).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.js rooms.js index.html ./
COPY css ./css
COPY src ./src

# Con PORT definido, el servidor acepta conexiones de fuera.
ENV PORT=8080
EXPOSE 8080

USER node
CMD ["node", "server.js"]
