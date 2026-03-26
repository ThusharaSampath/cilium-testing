# error-responder

A minimal Go HTTP server that responds with `HTTP 500 Internal Server Error` to every request and logs each incoming request to stdout.

## Usage

### Run directly

```bash
go run main.go
```

### Build & run

```bash
go build -o error-responder .
./error-responder
```

### Docker

```bash
docker build -t error-responder .
docker run -p 8080:8080 error-responder
```

### Configuration

| Env var | Default | Description        |
|---------|---------|--------------------|
| `PORT`  | `8080`  | Port to listen on  |

## Log format

```
[2026-03-26T10:00:00Z] GET example.com /path?query=1 | RemoteAddr: 127.0.0.1:54321 | UserAgent: curl/7.88
```
