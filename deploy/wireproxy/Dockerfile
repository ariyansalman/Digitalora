FROM golang:alpine AS build

RUN apk add --no-cache git ca-certificates
RUN go install github.com/windtf/wireproxy/cmd/wireproxy@v1.1.2

FROM alpine:3.22

RUN apk add --no-cache ca-certificates curl
COPY --from=build /go/bin/wireproxy /usr/local/bin/wireproxy
COPY start.sh /start.sh
RUN chmod +x /start.sh

ENV PORT=8888
EXPOSE 8888

CMD ["/start.sh"]
