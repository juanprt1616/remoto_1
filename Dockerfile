# Imagen ligera oficial de Node.js para desplegar el Hub / API Central en la Nube (Fly.io, Render, Railway)
FROM node:22-alpine

WORKDIR /app

COPY package.json ./
COPY configuracion.js ./
COPY servidor.js ./
COPY estaticos ./estaticos

ENV PORT=8080
ENV TUNEL_AUTO=false

EXPOSE 8080

CMD ["node", "servidor.js"]
