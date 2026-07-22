# API Documentation

The Node.js backend provides a simple REST API for managing the CDN contents.

## Authentication
Administrative endpoints require a Bearer token in the `Authorization` header containing the CDN Admin Password.
`Authorization: Bearer <your_password>`

## Endpoints

### List Files
`GET /api/files`
- **Auth**: Public
- **Description**: Returns an array of all uploaded files, sorted by newest first. Excludes the hidden `_shortlinks.json` metadata file.
- **Response**:
```json
[
  {
    "name": "photo.png",
    "size": 1048576,
    "lastModified": "2024-01-01T12:00:00Z",
    "shortCode": "aB3x9",
    "shortUrl": "https://dcron.in/s/aB3x9"
  }
]
```

### Upload File
`POST /api/upload`
- **Auth**: Required
- **Content-Type**: `multipart/form-data`
- **Body**: `file` (binary)
- **Description**: Uploads a file to the MinIO bucket and automatically generates a shortlink.
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
- **Description**: Deletes a file from the MinIO bucket and removes its associated shortlink mapping.
- **Response**:
```json
{
  "success": true
}
```
