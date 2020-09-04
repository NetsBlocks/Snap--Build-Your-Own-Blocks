FROM node:lts

ENV ENV production
ENV DEBUG netsblox*
ENV NETSBLOX_BLOB_DIR /blob-data

RUN echo Installing dependencies..

RUN apt update
RUN apt install build-essential cmake libgd-dev libgd2-dev libcairo2-dev libpango1.0-dev gnuplot -y

RUN echo Finished installing dependencies

WORKDIR /netsblox/

COPY ./package*.json ./

RUN npm install

COPY . .

RUN npm run postinstall

EXPOSE 8080
EXPOSE 8081

CMD ["npm", "start"]
