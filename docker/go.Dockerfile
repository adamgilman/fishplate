FROM golang:1.25

RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*
RUN go install github.com/air-verse/air@latest

WORKDIR /repo

CMD ["air"]
