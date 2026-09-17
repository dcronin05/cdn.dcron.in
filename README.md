# dcron.in CDN

A bespoke, self-hosted Content Delivery Network and Shortlink Generator built on Node.js and an S3-compatible storage interface. The current deployment stores objects in SeaweedFS behind a private S3 gateway; the application retains MinIO-compatible configuration for legacy deployments.

## Features
- **Stateless Architecture**: Uses object-store metadata (`_shortlinks.json`) instead of a database for shortlink mapping.
- **Private Storage Boundary**: The CDN application accesses its configured S3-compatible backend; storage credentials and internal storage endpoints are not upload-client credentials or public routes.
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

## Architecture Note
Storage is selected by server-side environment configuration. The current Bedrock deployment uses the SeaweedFS S3 gateway; client uploads go through the authenticated CDN API, not directly to the S3 gateway.
