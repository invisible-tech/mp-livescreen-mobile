# MP Live Screen - Backend API Documentation

This document describes the API endpoints that need to be implemented by the backend team to support the MP Live Screen app.

## Base URLs

| Environment | Base URL |
|-------------|----------|
| Development | `https://vdi-dev.invsta.systems` |
| Staging | `https://vdi-voice-demo.invsta.systems` |
| Production | `https://vdi.inv.tech` |

## Authentication

All endpoints require the `X-API-Key` header:

```
X-API-Key: <api-key>
```

## Endpoints

### 1. Start Recording Session

Initializes a new recording session and returns a unique recording ID.

**Endpoint:** `POST /api/v1/recordings/start`

**Request Headers:**
```
Content-Type: application/json
X-API-Key: <api-key>
```

**Request Body:**
```json
{
  "deviceId": "string",      // Unique device identifier
  "platform": "ios" | "android",
  "quality": "720p" | "1080p",
  "frameRate": 30 | 60
}
```

**Response (200 OK):**
```json
{
  "recordingId": "string",   // UUID for this recording session
  "uploadUrl": "string"      // Optional: Pre-signed URL for direct uploads
}
```

**Response (400 Bad Request):**
```json
{
  "error": "Invalid request parameters",
  "details": "string"
}
```

**Response (401 Unauthorized):**
```json
{
  "error": "Invalid or missing API key"
}
```

---

### 2. Upload Video Chunk

Uploads a video chunk for an active recording session. Chunks are sent every 5 seconds.

**Endpoint:** `POST /api/v1/recordings/{recordingId}/chunk`

**URL Parameters:**
- `recordingId` - The recording session ID from the start endpoint

**Request Headers:**
```
Content-Type: multipart/form-data
X-API-Key: <api-key>
```

**Request Body (multipart/form-data):**
| Field | Type | Description |
|-------|------|-------------|
| `chunk` | File | Video chunk file (MP4/JPEG depending on encoder) |
| `chunkIndex` | Integer | Sequential index starting from 0 |
| `timestamp` | Long | Unix timestamp in milliseconds |
| `duration` | Integer | Chunk duration in milliseconds (usually 5000) |

**Response (200 OK):**
```json
{
  "success": true,
  "received": 0          // The chunk index that was received
}
```

**Response (404 Not Found):**
```json
{
  "error": "Recording session not found"
}
```

**Response (413 Payload Too Large):**
```json
{
  "error": "Chunk size exceeds maximum allowed"
}
```

---

### 3. End Recording Session

Finalizes the recording session and triggers video assembly.

**Endpoint:** `POST /api/v1/recordings/{recordingId}/end`

**URL Parameters:**
- `recordingId` - The recording session ID

**Request Headers:**
```
Content-Type: application/json
X-API-Key: <api-key>
```

**Request Body:**
```json
{
  "totalChunks": 12,        // Total number of chunks uploaded
  "totalDuration": 60000    // Total recording duration in milliseconds
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "finalVideoUrl": "https://storage.example.com/recordings/abc123.mp4"
}
```

**Response (404 Not Found):**
```json
{
  "error": "Recording session not found"
}
```

**Response (422 Unprocessable Entity):**
```json
{
  "error": "Missing chunks",
  "expectedChunks": 12,
  "receivedChunks": 10,
  "missingIndices": [3, 7]
}
```

---

## Data Flow

```
┌──────────────┐                              ┌──────────────┐
│  Mobile App  │                              │   Backend    │
└──────┬───────┘                              └──────┬───────┘
       │                                             │
       │  POST /recordings/start                     │
       │  {deviceId, platform, quality, frameRate}   │
       │────────────────────────────────────────────>│
       │                                             │
       │  {recordingId: "abc123"}                    │
       │<────────────────────────────────────────────│
       │                                             │
       │  [Every 5 seconds]                          │
       │  POST /recordings/abc123/chunk              │
       │  FormData: {chunk, chunkIndex, timestamp}   │
       │────────────────────────────────────────────>│
       │                                             │
       │  {success: true, received: 0}               │
       │<────────────────────────────────────────────│
       │                                             │
       │  ... more chunks ...                        │
       │                                             │
       │  POST /recordings/abc123/end                │
       │  {totalChunks: 12, totalDuration: 60000}    │
       │────────────────────────────────────────────>│
       │                                             │
       │  {success: true, finalVideoUrl: "..."}      │
       │<────────────────────────────────────────────│
       │                                             │
```

## Technical Notes

### Chunk Characteristics

- **Duration:** 5 seconds per chunk
- **Format:** Initially JPEG frames; can be upgraded to H.264/MP4 segments
- **Size:** Approximately 2-5 MB per chunk at 1080p
- **Timing:** Chunks are uploaded in real-time during recording

### Handling Missing Chunks

The backend should:
1. Track received chunks by index
2. Allow out-of-order chunk uploads (network delays)
3. Report missing chunks at session end
4. Optionally: Request retransmission of missing chunks

### Video Assembly

After `end` is called, the backend should:
1. Verify all chunks are received
2. Sort chunks by index
3. Concatenate into final MP4 file
4. Store and return URL to assembled video

### Retry Logic

The mobile app implements:
- 3 retry attempts per chunk
- Exponential backoff (1s, 2s, 4s)
- 30-second buffer (6 chunks) before failing

### Error Handling

Recommended HTTP status codes:
- `200` - Success
- `400` - Invalid request
- `401` - Authentication failed
- `404` - Recording session not found
- `413` - Chunk too large
- `422` - Processing error (missing chunks, etc.)
- `500` - Server error

## Sample Implementation (Node.js/Express)

```javascript
// POST /api/v1/recordings/start
app.post('/api/v1/recordings/start', async (req, res) => {
  const { deviceId, platform, quality, frameRate } = req.body;
  
  const recordingId = uuid();
  
  await db.recordings.create({
    id: recordingId,
    deviceId,
    platform,
    quality,
    frameRate,
    status: 'recording',
    createdAt: new Date(),
  });
  
  res.json({ recordingId });
});

// POST /api/v1/recordings/:id/chunk
app.post('/api/v1/recordings/:id/chunk', upload.single('chunk'), async (req, res) => {
  const { id } = req.params;
  const { chunkIndex, timestamp, duration } = req.body;
  
  // Store chunk to S3/storage
  const chunkPath = `recordings/${id}/chunk_${chunkIndex}`;
  await storage.upload(chunkPath, req.file.buffer);
  
  // Track in database
  await db.chunks.create({
    recordingId: id,
    chunkIndex: parseInt(chunkIndex),
    timestamp: parseInt(timestamp),
    duration: parseInt(duration),
    path: chunkPath,
  });
  
  res.json({ success: true, received: parseInt(chunkIndex) });
});

// POST /api/v1/recordings/:id/end
app.post('/api/v1/recordings/:id/end', async (req, res) => {
  const { id } = req.params;
  const { totalChunks, totalDuration } = req.body;
  
  // Verify chunks
  const chunks = await db.chunks.findAll({ recordingId: id });
  const receivedIndices = chunks.map(c => c.chunkIndex);
  const expectedIndices = Array.from({ length: totalChunks }, (_, i) => i);
  const missing = expectedIndices.filter(i => !receivedIndices.includes(i));
  
  if (missing.length > 0) {
    return res.status(422).json({
      error: 'Missing chunks',
      expectedChunks: totalChunks,
      receivedChunks: chunks.length,
      missingIndices: missing,
    });
  }
  
  // Trigger async video assembly job
  await jobQueue.add('assemble-video', { recordingId: id });
  
  // Update status
  await db.recordings.update(id, { status: 'processing' });
  
  res.json({ success: true });
});
```

---

## Questions?

Contact the mobile team for clarification on any requirements.

