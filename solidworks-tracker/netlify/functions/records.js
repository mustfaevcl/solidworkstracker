'use strict';

const { google } = require('googleapis');

const HEADERS = [
  'Proje No',
  'Parça Kodu',
  'Parça Adı',
  'Durum',
  'Tezgah Türü',
  'Satın Alma Durumu',
  'Konum',
  'Fason Firma',
  'Gönderim Tarihi',
  'Termin Tarihi',
  'Notlar'
];

const SHEET_NAME = process.env.SHEET_NAME || 'Veriler';
const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
  };
}

function ok(body) {
  return { statusCode: 200, headers: cors(), body: JSON.stringify(body) };
}

function bad(statusCode, message) {
  return { statusCode, headers: cors(), body: JSON.stringify({ message }) };
}

function colIdxToA1(idx1) {
  // 1-based index to A1 column (1 -> A, 2 -> B, ... 26 -> Z, 27 -> AA)
  let n = idx1;
  let s = '';
  while (n > 0) {
    const mod = (n - 1) % 26;
    s = String.fromCharCode(65 + mod) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function padRow(values, length) {
  const out = new Array(length).fill('');
  for (let i = 0; i < Math.min(values.length, length); i++) out[i] = values[i] ?? '';
  return out;
}

async function getSheetsClient() {
  if (!SPREADSHEET_ID) {
    throw new Error('GOOGLE_SHEETS_SPREADSHEET_ID env variable is missing');
  }

  const privateKey = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '').replace(/\\n/g, '\n');

  const jwt = new google.auth.JWT(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    undefined,
    privateKey,
    ['https://www.googleapis.com/auth/spreadsheets']
  );
  await jwt.authorize();
  return google.sheets({ version: 'v4', auth: jwt });
}

async function ensureHeaderRow(sheets) {
  // Read row 1
  const range = `${SHEET_NAME}!1:1`;
  const get = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range
  });

  const current = (get.data.values && get.data.values[0]) || [];
  const same =
    current.length >= HEADERS.length &&
    HEADERS.every((h, i) => (current[i] || '') === h);

  if (!same) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A1:${colIdxToA1(HEADERS.length)}1`,
      valueInputOption: 'RAW',
      requestBody: { values: [HEADERS] }
    });
  }
}

function rowToObject(row) {
  const out = {};
  for (let i = 0; i < HEADERS.length; i++) {
    out[HEADERS[i]] = row[i] ?? '';
  }
  return out;
}

async function listAllRecords(sheets) {
  const range = `${SHEET_NAME}!A2:${colIdxToA1(HEADERS.length)}`;
  const get = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range
  });
  const rows = get.data.values || [];
  const records = [];
  for (let i = 0; i < rows.length; i++) {
    const row = padRow(rows[i], HEADERS.length);
    const obj = rowToObject(row);
    if ((obj['Parça Adı'] || '').toString().trim().length === 0) continue;
    // rowIndex is 2-based data start
    records.push({ rowIndex: i + 2, ...obj });
  }
  return records;
}

async function getByName(sheets, name) {
  const keyColIndex = HEADERS.indexOf('Parça Adı') + 1; // 1-based
  if (keyColIndex <= 0) throw new Error('Parça Adı sütunu bulunamadı');
  const colA1 = colIdxToA1(keyColIndex);
  const range = `${SHEET_NAME}!${colA1}2:${colA1}`;
  const get = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range
  });
  const values = get.data.values || [];
  for (let i = 0; i < values.length; i++) {
    const v = (values[i][0] || '').toString().trim();
    if (v === (name || '').toString().trim()) {
      const rowIdx = i + 2;
      const rowRange = `${SHEET_NAME}!A${rowIdx}:${colIdxToA1(HEADERS.length)}${rowIdx}`;
      const rowGet = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: rowRange
      });
      const row = padRow((rowGet.data.values && rowGet.data.values[0]) || [], HEADERS.length);
      return { rowIndex: rowIdx, ...rowToObject(row) };
    }
  }
  return null;
}

async function upsertRecord(sheets, record, keyField) {
  const key = keyField || 'Parça Adı';
  const keyIdx = HEADERS.indexOf(key) + 1;
  if (keyIdx <= 0) throw new Error('Geçersiz anahtar sütun adı');

  const values = HEADERS.map((h) => (record[h] !== undefined ? record[h] : ''));

  // Find row by key
  const keyColA1 = colIdxToA1(keyIdx);
  const get = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!${keyColA1}2:${keyColA1}`
  });
  const colValues = get.data.values || [];

  let targetRow = null;
  for (let i = 0; i < colValues.length; i++) {
    const v = (colValues[i][0] || '').toString().trim();
    if (v === (record[key] || '').toString().trim()) {
      targetRow = i + 2;
      break;
    }
  }

  if (!targetRow) {
    // append
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A:${colIdxToA1(HEADERS.length)}`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [values] }
    });
    return { action: 'inserted' };
  } else {
    // update row
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A${targetRow}:${colIdxToA1(HEADERS.length)}${targetRow}`,
      valueInputOption: 'RAW',
      requestBody: { values: [values] }
    });
    return { action: 'updated', rowIndex: targetRow };
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors(), body: '' };
  }

  try {
    const sheets = await getSheetsClient();
    await ensureHeaderRow(sheets);

    const path = event.path || '';

    if (event.httpMethod === 'GET') {
      if (path.endsWith('/by-name')) {
        const name = (event.queryStringParameters && event.queryStringParameters.parcaAdi) || '';
        if (!name) return bad(400, 'parcaAdi parametresi zorunludur');
        const record = await getByName(sheets, name);
        if (!record) return bad(404, 'Kayıt bulunamadı');
        return ok({ record });
      }
      const records = await listAllRecords(sheets);
      return ok({ records });
    }

    if (event.httpMethod === 'POST' && path.endsWith('/upsert')) {
      const payload = JSON.parse(event.body || '{}');
      const record = payload.record || payload;
      const key = payload.key || 'Parça Adı';
      if (!record || !record[key]) {
        return bad(400, `${key} alanı zorunludur`);
      }
      const result = await upsertRecord(sheets, record, key);
      return ok({ success: true, ...result });
    }

    return bad(404, 'Not Found');
  } catch (err) {
    console.error('[records-function]', err);
    return bad(500, err.message || 'Sunucu hatası');
  }
};