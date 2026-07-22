# CDN CLI Usage Guide

The `cdn` tool is a bespoke command-line interface written in Go for managing file uploads directly to your self-hosted MinIO bucket.

## Installation

You can install or update the `cdn` binary on any Linux machine by downloading it from the latest GitHub release:

```bash
sudo curl -L "https://github.com/dcronin05/cdn.dcron.in/releases/latest/download/cdn-linux-amd64" -o /usr/local/bin/cdn && sudo chmod +x /usr/local/bin/cdn
```

### Self-Update

Once installed, you can easily keep the CLI up-to-date using the built-in update flag:

```bash
cdn --update
# or
cdn -U
```
*Note: Depending on where the binary is installed (e.g. `/usr/local/bin`), you may need to run this command with `sudo`.*

## Authentication & Configuration

The first time you upload a file, the CLI will prompt you for your Server URL and Admin Password:
```
=== dcron.in CDN CLI Setup ===
CDN Server URL [https://cdn.dcron.in]: 
CDN Admin Password: 
✔ Config saved!
```
These credentials are saved natively to your user profile at `~/.config/cdn/config`.

## Basic Uploading

Simply pass the file path to upload an asset:
```bash
cdn my-photo.png
```

The CLI will output a neat progress bar for large files, and upon completion, it will automatically copy the Shortlink or Direct URL directly to your clipboard using `xclip` or `wl-copy`.

## Flags
- `-u`, `--url <server-url>`: Override the saved CDN URL for a single request.
- `-w`, `--password <password>`: Override the saved Admin Password.
- `-U`, `--update`: Update the CLI tool to the latest GitHub release.
- `-v`, `--version`: Print current version.
