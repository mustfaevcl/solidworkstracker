'use strict';

// Netlify Functions (Node 18+) has global fetch.
// This function proxies Google Drive file downloads to bypass CORS in the browser.
// Usage: /.netlify/functions/gdrive?id=FILE_ID
// Optional: set GDRIVE_API_KEY env to use Google Drive API (more reliable than usercontent host).

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Range',
    'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS',
    // Allow caching large static models aggressively at the edge
    'Cache-Control': 'public, max-age=31536000, immutable',
  };
}

const okBin = (bodyBase64, contentType = 'model/gltf-binary', extra = {}) => ({
  statusCode: 200,
  headers: { ...cors(), 'Content-Type': contentType, ...extra },
  isBase64Encoded: true,
  body: bodyBase64,
});

const bad = (statusCode, message) => ({
  statusCode,
  headers: { ...cors(), 'Content-Type': 'application/json' },
  body: JSON.stringify({ message }),
});

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors(), body: '' };
  }
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'HEAD') {
    return bad(405, 'Method Not Allowed');
  }

  try {
    const qs = event.queryStringParameters || {};
    const fileId = (qs.id || '').trim();
    if (!fileId) return bad(400, 'id parametresi zorunludur (Google Drive FILE_ID)');

    const apiKey = (process.env.GDRIVE_API_KEY || process.env.VITE_GDRIVE_API_KEY || '').trim();

    // Prefer Drive API (CORS friendly, reliable), else fall back to usercontent direct download host
    const target = apiKey
      ? `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&key=${encodeURIComponent(apiKey)}`
      : `https://drive.usercontent.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`;

    const res = await fetch(target, {
      method: 'GET',
      headers: {
        // Hint for binary content
        'Accept': '*/*',
      },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return bad(res.status, `Google Drive fetch failed: ${res.status} ${res.statusText} ${text.slice(0, 200)}`);
    }

    // Try to keep the original content-type if provided
    const contentType = res.headers.get('content-type') || 'application/octet-stream';

    // Note: For large files, we buffer into base64 due to Netlify Functions response format.
    // If file sizes are huge (>10-20MB), consider hosting on CDN for best performance.
    const arrayBuffer = await res.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');

    // Also forward length if available
    const contentLength = Buffer.byteLength(base64, 'base64');
    const headersExtra = {};
    if (contentLength) headersExtra['Content-Length'] = String(contentLength);

    return okBin(base64, contentType, headersExtra);
  } catch (err) {
    console.error('[gdrive-proxy]', err);
    return bad(500, err.message || 'Sunucu hatası');
  }
};