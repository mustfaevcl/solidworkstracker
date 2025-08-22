const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const users = require('./users');
const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');

const app = express();
const PORT = 5000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// ================= Excel Ayarları =================
const EXCEL_PATH = path.resolve(__dirname, '..', 'solidworks_tracker.xlsx');
const SHEET_NAME = 'Veriler';
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

async function ensureWorkbook() {
  const workbook = new ExcelJS.Workbook();

  if (fs.existsSync(EXCEL_PATH)) {
    await workbook.xlsx.readFile(EXCEL_PATH);
  } else {
    fs.mkdirSync(path.dirname(EXCEL_PATH), { recursive: true });
  }

  let ws = workbook.getWorksheet(SHEET_NAME) || workbook.worksheets[0];
  if (!ws) ws = workbook.addWorksheet(SHEET_NAME);

  // Başlıkları garanti altına al
  const headerRow = ws.getRow(1);
  const hasHeaders =
    headerRow &&
    headerRow.cellCount >= HEADERS.length &&
    HEADERS.every((h, idx) => headerRow.getCell(idx + 1).value === h);

  if (!hasHeaders) {
    ws.spliceRows(1, 1, HEADERS);
    ws.getRow(1).font = { bold: true };
  }

  return { workbook, ws };
}

function cellVal(cell) {
  if (!cell) return '';
  const v = cell.value;
  if (!v) return '';
  if (typeof v === 'object' && v.text) return v.text;
  return v;
}

function worksheetToJSON(ws) {
  const rows = [];
  for (let i = 2; i <= ws.rowCount; i++) {
    const row = ws.getRow(i);
    const parcaAdi = cellVal(row.getCell(3)); // "Parça Adı"
    if (!parcaAdi) continue;

    const obj = {};
    HEADERS.forEach((h, idx) => {
      obj[h] = cellVal(row.getCell(idx + 1));
    });
    rows.push({ rowIndex: i, ...obj });
  }
  return rows;
}

// Basit yazma kuyruğu (eşzamanlı yazım çakışmalarını önler)
let writeQueue = Promise.resolve();
function enqueueWrite(task) {
  writeQueue = writeQueue.then(task).catch((err) => {
    console.error('Excel write failed:', err);
  });
  return writeQueue;
}

// ================= Kullanıcı API'leri =================
// Get all users
app.get('/api/users', (req, res) => {
  const safeUsers = users.map(({ password, ...user }) => user);
  res.json(safeUsers);
});

// Login endpoint
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = users.find((u) => u.username === username && u.password === password);

  if (user) {
    const { password, ...userWithoutPassword } = user;
    res.json({ success: true, user: userWithoutPassword });
  } else {
    res.status(401).json({ success: false, message: 'Kullanıcı adı veya şifre hatalı' });
  }
});

// ================= Excel Tabanlı Kayıt API'leri =================

// Tüm kayıtları getir
app.get('/api/records', async (req, res) => {
  try {
    const { ws } = await ensureWorkbook();
    const records = worksheetToJSON(ws);
    res.json({ records });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Excel okunamadı' });
  }
});

// Parça adına göre tek kayıt getir
app.get('/api/records/by-name', async (req, res) => {
  const name = req.query.parcaAdi;
  if (!name) return res.status(400).json({ message: 'parcaAdi parametresi gerekli' });

  try {
    const { ws } = await ensureWorkbook();
    const records = worksheetToJSON(ws);
    const record = records.find(
      (r) => String(r['Parça Adı']).trim() === String(name).trim()
    );
    if (!record) return res.status(404).json({ message: 'Kayıt bulunamadı' });
    res.json({ record });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Excel okunamadı' });
  }
});

// Upsert (varsa güncelle, yoksa ekle) — varsayılan anahtar "Parça Adı"
app.post('/api/records/upsert', async (req, res) => {
  const payload = req.body && (req.body.record || req.body);
  const key = (req.body && req.body.key) || 'Parça Adı';

  if (!payload || !payload[key]) {
    return res.status(400).json({ message: `${key} alanı zorunludur` });
  }

  try {
    await enqueueWrite(async () => {
      const { workbook, ws } = await ensureWorkbook();

      const keyColIndex = HEADERS.indexOf(key) + 1;
      if (keyColIndex <= 0) throw new Error('Geçersiz anahtar sütunu');

      // Satırı bul
      let targetRowIndex = -1;
      for (let i = 2; i <= ws.rowCount; i++) {
        const v = cellVal(ws.getRow(i).getCell(keyColIndex));
        if (String(v).trim() === String(payload[key]).trim()) {
          targetRowIndex = i;
          break;
        }
      }

      // Yazılacak değerleri sıraya koy
      const values = HEADERS.map((h) => (payload[h] !== undefined ? payload[h] : ''));

      if (targetRowIndex === -1) {
        ws.addRow(values);
      } else {
        const row = ws.getRow(targetRowIndex);
        values.forEach((val, idx) => {
          row.getCell(idx + 1).value = val;
        });
        if (row.commit) row.commit();
      }

      await workbook.xlsx.writeFile(EXCEL_PATH);
    });

    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Excel yazılamadı' });
  }
});

// Server'ı başlat
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});