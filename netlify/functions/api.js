'use strict';

const fs = require('fs');
const path = require('path');

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-key',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS,DELETE',
  };
}

function ok(body) {
  return { statusCode: 200, headers: cors(), body: JSON.stringify(body) };
}

function bad(statusCode, message) {
  return { statusCode, headers: cors(), body: JSON.stringify({ message }) };
}

const PROJECTS_JSON = path.resolve(__dirname, '..', '..', 'backend', 'projects.json');

async function readProjects() {
  try {
    const s = await fs.promises.readFile(PROJECTS_JSON, 'utf8');
    const data = JSON.parse(s);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

exports.handler = async (event) => {
  // Preflight CORS
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors(), body: '' };
  }

  try {
    const rawPath = String(event.path || '');
    // Normalize Netlify functions base path
    // Examples:
    //  /.netlify/functions/api/projects
    //  /.netlify/functions/api/summary
    const p = rawPath.replace(/^\/\.netlify\/functions\/api/, '') || '/';
    const method = event.httpMethod.toUpperCase();

    // GET /projects -> { items: [...] }
    if (method === 'GET' && (p === '/projects' || p === '/projects/')) {
      const items = await readProjects();
      return ok({ items });
    }

    // Minimal fallbacks so the UI does not break on production without full backend
    // GET /summary
    if (method === 'GET' && (p === '/summary' || p.startsWith('/summary?'))) {
      return ok({
        statusCounts: { tezgahta: 0, tamamlandi: 0, kalitede: 0, siparis: 0, stokta: 0, beklemede: 0, fason: 0 },
        overduePartsCount: 0,
        overdueParts: [],
        kpi: { missingPartsCount: 0, dailyAssemblyRate: 0, avgCompletionHours: null },
      });
    }

    // GET /approvals
    if (method === 'GET' && (p === '/approvals' || p.startsWith('/approvals?'))) {
      return ok({ items: [] });
    }

    // GET /audit
    if (method === 'GET' && (p === '/audit' || p.startsWith('/audit?'))) {
      return ok({ items: [] });
    }

    return bad(404, 'Not Found');
  } catch (err) {
    console.error('[api-function]', err);
    return bad(500, err.message || 'Sunucu hatası');
  }
};