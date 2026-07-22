# dcron.in CDN

A bespoke, self-hosted Content Delivery Network and Shortlink Generator built on top of MinIO and Node.js.

## Features
- **Stateless Architecture**: Uses MinIO bucket metadata (`_shortlinks.json`) instead of a database for shortlink mapping.
- **High Performance**: NGINX intercepts downloads and streams binary data directly from the S3 backend, bypassing the Node.js API.
- **Go CLI Tool**: An ultra-fast, standalone Go binary for uploading files from the terminal with native progress bars.
- **Web UI**: A sleek, dark-mode administrative dashboard with drag-and-drop file uploads.

## CLI Installation

You can install the bespoke `cdn` CLI tool on any Linux machine by downloading the precompiled binary directly from GitHub:

```bash
sudo curl -L "https://github.com/dcronin05/cdn.dcron.in/releases/latest/download/cdn-linux-amd64" -o /usr/local/bin/cdn && sudo chmod +x /usr/local/bin/cdn
```

Once installed, simply run `cdn <file-path>` to upload a file and instantly copy the shortlink to your clipboard! 

## Documentation

Comprehensive documentation can be found in the `docs/` directory:
- [Architecture Overview](docs/Architecture.md)
- [CLI Usage Guide](docs/CLI-Usage.md)
- [REST API Reference](docs/API.md)
