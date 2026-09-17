# Architecture Overview

The `cdn.dcron.in` project is a bespoke content delivery interface and shortlink generator mapped on top of a self-hosted S3-compatible storage backend.

## Infrastructure Stack

1. **Traefik**: The edge proxy that handles SSL termination (`cdn.dcron.in`).
2. **NGINX**: The secondary reverse-proxy that routes requests and rate-limits uploads. The current deployment sends upload, API, shortlink, and public-file requests to the Node.js application; it does not expose the S3 gateway as a public route.
3. **Node.js (Express)**: The API and delivery application. It authenticates management uploads/deletes, performs object-store operations, and resolves shortlinks.
4. **S3-compatible object storage**: The current deployment uses SeaweedFS through a private HTTPS S3 gateway. The application retains MinIO-compatible configuration for older deployments.

## The Shortlink System

Instead of relying on a dedicated database (like PostgreSQL or Redis) to map shortcodes (e.g., `x7K9pQ`) to file names, this system achieves total statelessness by storing a hidden `_shortlinks.json` file in the configured object store.

When the Node.js container starts, it downloads this JSON file to build its in-memory shortlink map. When a new file is uploaded, a shortcode is generated, the map is updated, and `_shortlinks.json` is re-uploaded to the bucket.

## Public file delivery

Public file requests are handled by the CDN application, which reads from the configured object store. SeaweedFS stays private: clients use the CDN hostname and never the storage gateway. The application can keep the Seaweed bucket private while providing public-object delivery through its own edge and API boundary.
