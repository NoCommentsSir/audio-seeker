FROM node:alpine as build

WORKDIR /app
COPY package.json /app/package.json
COPY package-lock.json /app/package-lock.json
RUN npm ci

COPY index.html /app/index.html
COPY vite.config.js /app/vite.config.js
COPY public /app/public
COPY src /app/src
COPY .env /app/.env
RUN npm run build

FROM nginx:stable-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
