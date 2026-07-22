# Architecture Overview

The `cdn.dcron.in` project is a bespoke content delivery interface and shortlink generator mapped on top of a self-hosted S3-compatible storage backend.

## Infrastructure Stack

1. **Traefik**: The primary edge proxy that handles SSL termination (`cdn.dcron.in`).
2. **NGINX**: A secondary reverse-proxy that handles routing logic and strict rate-limiting (preventing upload abuse). It routes shortlink requests to the Node.js API, UI requests to the Node.js frontend, and directly proxies raw file requests to MinIO for zero-overhead downloads.
3. **Node.js (Express)**: The core API server that manages the Web UI, administrative upload/delete endpoints, and the shortlink translation layer.
4. **MinIO**: The underlying S3-compatible block storage system.

## The Shortlink System

Instead of relying on a dedicated database (like PostgreSQL or Redis) to map shortcodes (e.g., `x7K9pQ`) to file names, this system achieves total statelessness by storing a hidden `_shortlinks.json` file natively inside the MinIO bucket.

When the Node.js container starts, it downloads this JSON file to build its in-memory shortlink map. When a new file is uploaded, a shortcode is generated, the map is updated, and `_shortlinks.json` is re-uploaded to the bucket.

## Zero-Overhead Downloads

To ensure maximum performance when serving massive files (like ISOs), the Node.js server is entirely bypassed during file downloads. NGINX intercepts all root requests (e.g., `https://cdn.dcron.in/windows.iso`) and streams the binary data directly from the MinIO container's `public` bucket. Node.js is only invoked for the `/api/` layer and the UI.
