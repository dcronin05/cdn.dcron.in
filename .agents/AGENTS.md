# Agent Rules

## CDN / MinIO Interaction
When interacting with the CDN or MinIO storage, DO NOT backdoor files by trying to copy them directly into the Docker container's storage volumes (e.g. using `docker cp`). This bypasses MinIO's backend metadata generation and causes the files to be unreadable (404 errors) by the CDN.
Instead, ALWAYS use the bespoke `cdn` CLI tool (installed at `/usr/local/bin/cdn`) to upload files directly from the host. If for some reason the CLI is unavailable, fallback to using the official MinIO Client (`mc`) inside the container.
