# API Documentation

The Node.js backend provides a simple REST API for managing the CDN contents.

## Authentication
Administrative endpoints require a Bearer token in the `Authorization` header containing the **CDN application admin password**. This is not the S3 access key or secret used internally by the server. Upload clients send requests to the CDN application, not to the private object-store gateway.
`Authorization: Bearer <your_password>`

## Endpoints

### List Files
`GET /api/files`
- **Auth**: Public
- **Description**: With no query parameters, returns an array of all uploaded files sorted by newest first. Excludes the hidden `_shortlinks.json` metadata file. For the web UI and clients that need bounded responses, pass `page` and/or `pageSize` to receive a paginated response. Search, category, sorting, and page size are applied server-side.
- **Query parameters**:
  - `page` (default `1`)
  - `pageSize` (default `24`, maximum `100`)
  - `q` (optional filename search)
  - `category` (optional: `all`, `image`, `video`, `doc`, or `archive`)
  - `sort` (optional: `date`, `name`, or `size`; default `date`)
  - `order` (optional: `asc` or `desc`; default `desc`)
- **Response**:
```json
{
  "files": [
    {
      "name": "photo.png",
      "size": 1048576,
      "lastModified": "2024-01-01T12:00:00Z",
      "shortCode": "aB3x9",
      "shortUrl": "https://dcron.in/s/aB3x9",
      "url": "https://cdn.dcron.in/photo.png"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 24,
    "total": 1,
    "totalPages": 1
  }
}
```

The server caches the storage metadata catalog for 30 seconds by default so paging does not re-enumerate the bucket on every click. Uploads and deletes invalidate the catalog immediately. Set `FILE_CACHE_TTL_MS` to change the refresh interval.

### Upload File
`POST /api/upload`
- **Auth**: Required
- **Content-Type**: `multipart/form-data`
- **Body**: `file` (binary)
- **Description**: Uploads a file through the CDN application to its configured S3-compatible object store and automatically generates a shortlink. The current deployment uses the private SeaweedFS S3 gateway; MinIO environment-variable compatibility is retained by the application.
- **Response**:
```json
{
  "success": true,
  "fileName": "photo.png",
  "shortCode": "aB3x9",
  "shortUrl": "https://dcron.in/s/aB3x9"
}
```

### Delete File
`DELETE /api/files/:filename`
- **Auth**: Required
- **Description**: Deletes a file from the configured object store and removes its associated shortlink mapping.
- **Response**:
```json
{
  "success": true
}
```
