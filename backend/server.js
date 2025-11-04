const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const users = require('./users');
const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
const multer = require('multer');
const crypto = require('crypto');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const PORT = 5000;

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});
io.on('connection', (socket) => {
  try { console.log('socket connected:', socket.id); } catch {}
});

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
  'Notlar',
  'Montaj Durumu',
  'Sökülmüş',
  'Eksik'
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
 
    if (io) { try { io.emit('records:updated'); } catch {} }
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Excel yazılamadı' });
  }
});

/* ================== Model Yönetimi (Admin) ================== */
// Hedef: frontend projesinin public/models klasörü
const MODELS_DIR = path.resolve(__dirname, '..', 'solidworks-tracker', 'public', 'models');
fs.mkdirSync(MODELS_DIR, { recursive: true });

// Basit admin anahtar kontrolü
const ADMIN_KEY = process.env.ADMIN_KEY || 'admin-dev';
function checkAdmin(req, res, next) {
 const key = req.headers['x-admin-key'];
 if (key && key === ADMIN_KEY) return next();
 return res.status(403).json({ message: 'Forbidden' });
}

const storage = multer.diskStorage({
 destination: (req, file, cb) => cb(null, MODELS_DIR),
 filename: (req, file, cb) => {
   // Basit dosya adı temizliği (path traversal engelle)
   const base = path.basename(file.originalname || 'model.glb');
   const safe = base.replace(/[^a-zA-Z0-9._-]/g, '_');
   cb(null, safe);
 }
});
const upload = multer({ storage });
const ALLOWED_EXT = /\.(glb|gltf|zip|draco)$/i;

app.get('/api/models', checkAdmin, async (req, res) => {
 try {
   const files = await fs.promises.readdir(MODELS_DIR);
   const items = await Promise.all(
     files
       .filter((f) => ALLOWED_EXT.test(f))
       .map(async (name) => {
         const st = await fs.promises.stat(path.join(MODELS_DIR, name));
         return { name, size: st.size, mtime: st.mtimeMs };
       })
   );
   res.json({ items });
 } catch (e) {
   console.error('List models failed:', e);
   res.status(500).json({ message: 'Listeleme hatası' });
 }
});

app.post('/api/models/upload', checkAdmin, upload.single('file'), async (req, res) => {
 try {
   if (!req.file) return res.status(400).json({ message: 'Dosya gerekli' });
   const filename = req.file.filename;
   if (!ALLOWED_EXT.test(filename)) {
     // İzin verilmeyen uzantı — dosyayı sil
     try { await fs.promises.unlink(path.join(MODELS_DIR, filename)); } catch {}
     return res.status(400).json({ message: 'Geçersiz dosya türü. İzin verilen: .glb, .gltf, .zip, .draco' });
   }
   res.json({ success: true, file: { name: filename } });
 } catch (e) {
   console.error('Upload failed:', e);
   res.status(500).json({ message: 'Yükleme hatası' });
 }
});

app.delete('/api/models/:filename', checkAdmin, async (req, res) => {
 try {
   const raw = String(req.params.filename || '');
   const name = path.basename(raw); // path traversal engelle
   const target = path.join(MODELS_DIR, name);
   // MODELS_DIR altında mı kontrol et
   if (!target.startsWith(MODELS_DIR)) {
     return res.status(400).json({ message: 'Geçersiz dosya yolu' });
   }
   await fs.promises.unlink(target);
   res.json({ success: true });
 } catch (e) {
   if (e && e.code === 'ENOENT') return res.status(404).json({ message: 'Dosya bulunamadı' });
   console.error('Delete failed:', e);
   res.status(500).json({ message: 'Silme hatası' });
 }
});

/* ================== Proje Yönetimi ================== */
const PROJECTS_JSON = path.resolve(__dirname, 'projects.json');

async function readProjects() {
 try {
   const s = await fs.promises.readFile(PROJECTS_JSON, 'utf8');
   const data = JSON.parse(s);
   return Array.isArray(data) ? data : [];
 } catch {
   return [];
 }
}
async function writeProjects(items) {
 try {
   await fs.promises.writeFile(PROJECTS_JSON, JSON.stringify(items, null, 2), 'utf8');
 } catch (e) {
   console.error('writeProjects failed:', e);
 }
}

// Projeleri herkese açık listele (sadece okuma)
app.get('/api/projects', async (req, res) => {
 try {
   const items = await readProjects();
   res.json({ items });
 } catch (e) {
   console.error('GET /api/projects failed:', e);
   res.status(500).json({ message: 'Listeleme hatası' });
 }
});

// Proje ekle (admin)
app.post('/api/projects', checkAdmin, async (req, res) => {
 try {
   const payload = req.body || {};
   const id = String(payload.id || '').trim();
   const name = String(payload.name || '').trim();
   const tracker = String(payload.tracker || '').trim();
   const modelUrl = String(payload.modelUrl || '').trim();
   const description = String(payload.description || '').trim();

   if (!id || !name || !tracker || !modelUrl) {
     return res.status(400).json({ message: 'id, name, tracker ve modelUrl zorunludur' });
   }

   const items = await readProjects();
   if (items.find(p => String(p.id).toLowerCase() === id.toLowerCase())) {
     return res.status(409).json({ message: 'Aynı id ile proje mevcut' });
   }

   const rec = { id, name, tracker, modelUrl, description };
   items.push(rec);
   await writeProjects(items);
   res.json({ success: true, item: rec });
 } catch (e) {
   console.error('POST /api/projects failed:', e);
   res.status(500).json({ message: 'Kaydetme hatası' });
 }
});

// Proje sil (admin) — isteğe bağlı model dosyasını da sil
app.delete('/api/projects/:id', checkAdmin, async (req, res) => {
try {
  const id = String(req.params.id || '').trim();
  const deleteFile = String(req.query.deleteFile || '').trim() === '1';
  let items = await readProjects();
  const idx = items.findIndex(p => String(p.id).toLowerCase() === id.toLowerCase());
  if (idx < 0) return res.status(404).json({ message: 'Proje bulunamadı' });

  const proj = items[idx];
  // Kayıttan çıkar
  items.splice(idx, 1);
  await writeProjects(items);

  // İlgili model dosyasını sil (varsa ve istenirse)
  if (deleteFile && proj && typeof proj.modelUrl === 'string' && proj.modelUrl.startsWith('/models/')) {
    const fname = path.basename(proj.modelUrl);
    const fpath = path.join(MODELS_DIR, fname);
    try { await fs.promises.unlink(fpath); } catch (e) { if (e.code !== 'ENOENT') console.warn('Model dosyası silinemedi:', e); }
  }

  if (typeof io !== 'undefined' && io) {
    try { io.emit('projects:updated'); } catch {}
  }

  res.json({ success: true });
} catch (e) {
  console.error('DELETE /api/projects failed:', e);
  res.status(500).json({ message: 'Silme hatası' });
}
});

/* ================== Proje Versiyonlama ================== */
const PROJECT_VERSIONS_JSON = path.resolve(__dirname, 'project_versions.json');

async function readProjectVersionsMap() {
 try {
   const s = await fs.promises.readFile(PROJECT_VERSIONS_JSON, 'utf8');
   const data = JSON.parse(s);
   return (data && typeof data === 'object') ? data : {};
 } catch {
   return {};
 }
}
async function writeProjectVersionsMap(map) {
 try {
   await fs.promises.writeFile(PROJECT_VERSIONS_JSON, JSON.stringify(map, null, 2), 'utf8');
 } catch (e) {
   console.error('writeProjectVersionsMap failed:', e);
 }
}

// Proje sürümlerini listele
app.get('/api/projects/:id/versions', async (req, res) => {
 try {
   const id = String(req.params.id || '').trim();
   if (!id) return res.status(400).json({ message: 'id gerekli' });

   const map = await readProjectVersionsMap();
   const list = Array.isArray(map[id]) ? map[id] : [];
   // Yeni -> Eski sıralama
   list.sort((a, b) => Number(b.at || 0) - Number(a.at || 0));
   res.json({ items: list });
 } catch (e) {
   console.error('GET /api/projects/:id/versions failed:', e);
   res.status(500).json({ message: 'Listeleme hatası' });
 }
});

// Proje aktif modelini ayarla (admin)
app.post('/api/projects/:id/set-model', checkAdmin, async (req, res) => {
 try {
   const id = String(req.params.id || '').trim();
   const body = req.body || {};
   const modelUrl = String(body.modelUrl || '').trim();
   const by = String(body.by || 'admin').trim();

   if (!id || !modelUrl) return res.status(400).json({ message: 'id ve modelUrl zorunlu' });
   if (!modelUrl.startsWith('/models/')) return res.status(400).json({ message: 'modelUrl /models/ ile başlamalı' });

   // Projeyi güncelle
   const items = await readProjects();
   const idx = items.findIndex(p => String(p.id).toLowerCase() === id.toLowerCase());
   if (idx < 0) return res.status(404).json({ message: 'Proje bulunamadı' });

   items[idx].modelUrl = modelUrl;
   await writeProjects(items);

   // Versiyon kaydı ekle
   const map = await readProjectVersionsMap();
   const arr = Array.isArray(map[id]) ? map[id] : [];
   arr.push({ modelUrl, at: Date.now(), by, type: 'set' });
   map[id] = arr;
   await writeProjectVersionsMap(map);

   // yayınla
   if (typeof io !== 'undefined' && io) {
     try {
       io.emit('projects:updated');
       io.emit('versions:updated', { projectId: id });
     } catch {}
   }

   res.json({ success: true, item: { projectId: id, modelUrl } });
 } catch (e) {
   console.error('POST /api/projects/:id/set-model failed:', e);
   res.status(500).json({ message: 'Kaydetme hatası' });
 }
});

// Önceki sürüme geri al (admin)
app.post('/api/projects/:id/rollback', checkAdmin, async (req, res) => {
 try {
   const id = String(req.params.id || '').trim();
   const body = req.body || {};
   const index = Number.isInteger(body.index) ? body.index : null;

   if (!id) return res.status(400).json({ message: 'id zorunlu' });

   const map = await readProjectVersionsMap();
   const arr = Array.isArray(map[id]) ? map[id] : [];
   if (arr.length === 0) return res.status(404).json({ message: 'Sürüm bulunamadı' });

   let targetModelUrl = null;
   if (index !== null) {
     if (index < 0 || index >= arr.length) return res.status(400).json({ message: 'index geçersiz' });
     targetModelUrl = String(arr[index].modelUrl || '').trim();
   } else {
     // En son kayıt dışındaki bir önceki sürüme dön (varsa)
     if (arr.length < 2) return res.status(400).json({ message: 'Geri alınacak önceki sürüm yok' });
     targetModelUrl = String(arr[arr.length - 2].modelUrl || '').trim();
   }

   if (!targetModelUrl) return res.status(400).json({ message: 'Hedef sürüm geçersiz' });

   // Projeyi güncelle
   const items = await readProjects();
   const idx = items.findIndex(p => String(p.id).toLowerCase() === id.toLowerCase());
   if (idx < 0) return res.status(404).json({ message: 'Proje bulunamadı' });

   items[idx].modelUrl = targetModelUrl;
   await writeProjects(items);

   // Versiyon günlüğüne rollback kaydı ekle
   arr.push({ modelUrl: targetModelUrl, at: Date.now(), by: 'admin', type: 'rollback' });
   map[id] = arr;
   await writeProjectVersionsMap(map);

   if (typeof io !== 'undefined' && io) {
     try {
       io.emit('projects:updated');
       io.emit('versions:updated', { projectId: id });
     } catch {}
   }

   res.json({ success: true, projectId: id, modelUrl: targetModelUrl });
 } catch (e) {
   console.error('POST /api/projects/:id/rollback failed:', e);
   res.status(500).json({ message: 'Rollback hatası' });
 }
});

/* ================== Onay Akışı ve Audit Log ================== */
const APPROVALS_JSON = path.resolve(__dirname, 'approvals.json');

async function readApprovals() {
  try {
    const s = await fs.promises.readFile(APPROVALS_JSON, 'utf8');
    const data = JSON.parse(s);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}
async function writeApprovals(items) {
  try {
    await fs.promises.writeFile(APPROVALS_JSON, JSON.stringify(items, null, 2), 'utf8');
  } catch (e) {
    console.error('writeApprovals failed:', e);
  }
}
function newApprovalId() {
  const n = Date.now();
  const r = Math.floor(Math.random() * 1e6);
  return `appr_${n}_${r}`;
}

// Excel'e onay uygulama (tamamlama/sökülme/eksik)
async function applyApprovalToExcel(partName, action) {
  try {
    await enqueueWrite(async () => {
      const { workbook, ws } = await ensureWorkbook();

      const key = 'Parça Adı';
      const keyColIndex = HEADERS.indexOf(key) + 1;
      if (keyColIndex <= 0) throw new Error('Geçersiz anahtar sütunu');

      // Hedef satırı bul (yoksa eklenecek)
      let targetRowIndex = -1;
      for (let i = 2; i <= ws.rowCount; i++) {
        const v = cellVal(ws.getRow(i).getCell(keyColIndex));
        if (String(v).trim() === String(partName).trim()) {
          targetRowIndex = i;
          break;
        }
      }

      // Varsayılan değerler
      const payload = {};
      HEADERS.forEach(h => { payload[h] = ''; });
      payload['Parça Adı'] = partName;

      if (action === 'tightened') {
        payload['Montaj Durumu'] = 'tightened';
        payload['Sökülmüş'] = '';
        // Eksik bilgisine dokunma
      } else if (action === 'removed') {
        payload['Sökülmüş'] = '1';
        // Montaj durumu mevcutsa koru; yoksa dokunma
      } else if (action === 'missing') {
        payload['Eksik'] = '1';
      }

      // Eski satır varsa mevcut verileri koru, sadece ilgili alanları değiştir
      if (targetRowIndex !== -1) {
        const row = ws.getRow(targetRowIndex);
        HEADERS.forEach((h, idx) => {
          const cur = cellVal(row.getCell(idx + 1));
          let next = cur;
          if (h === 'Parça Adı') next = partName;
          if (action === 'tightened' && h === 'Montaj Durumu') next = 'tightened';
          if (action === 'removed' && h === 'Sökülmüş') next = '1';
          if (action === 'missing' && h === 'Eksik') next = '1';
          row.getCell(idx + 1).value = next;
        });
        if (row.commit) row.commit();
      } else {
        // Yeni satır
        const values = HEADERS.map(h => payload[h] !== undefined ? payload[h] : '');
        ws.addRow(values);
      }

      await workbook.xlsx.writeFile(EXCEL_PATH);
    });
    return true;
  } catch (e) {
    console.error('applyApprovalToExcel failed:', e);
    return false;
  }
}

// Onay talepleri listeleme
app.get('/api/approvals', async (req, res) => {
  try {
    const list = await readApprovals();
    const q = req.query || {};
    const status = String(q.status || '').trim().toLowerCase();
    const part = String(q.partName || '').trim().toLowerCase();

    let items = list;
    if (status) items = items.filter(x => String(x.status || '').toLowerCase() === status);
    if (part) items = items.filter(x => String(x.partName || '').toLowerCase() === part);

    // Yeni -> eski
    items = items.sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
    res.json({ items });
  } catch (e) {
    console.error('GET /api/approvals failed:', e);
    res.status(500).json({ message: 'Listeleme hatası' });
  }
});

// Audit log (onay geçmişi)
app.get('/api/audit', async (req, res) => {
  try {
    const list = await readApprovals();
    const part = String((req.query || {}).partName || '').trim().toLowerCase();
    let items = list;
    if (part) items = items.filter(x => String(x.partName || '').toLowerCase() === part);
    items = items.sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
    res.json({ items });
  } catch (e) {
    console.error('GET /api/audit failed:', e);
    res.status(500).json({ message: 'Audit okunamadı' });
  }
});

// Onay talebi oluşturma (kullanıcı)
app.post('/api/approvals/request', async (req, res) => {
  try {
    const body = req.body || {};
    const partName = String(body.partName || '').trim();
    const action = String(body.action || '').trim().toLowerCase(); // tightened|removed|missing
    const by = String(body.by || '').trim() || 'user';
    const note = String(body.note || '').trim();
    const autoApproved = !!body.autoApproved;

    if (!partName) return res.status(400).json({ message: 'partName zorunlu' });
    if (!['tightened', 'removed', 'missing'].includes(action)) {
      return res.status(400).json({ message: 'action geçersiz (tightened|removed|missing)' });
    }

    const list = await readApprovals();
    const id = newApprovalId();
    const now = Date.now();

    const rec = {
      id,
      partName,
      action,
      requestedBy: by,
      createdAt: now,
      updatedAt: now,
      status: autoApproved ? 'approved' : 'pending',
      note: note || ''
    };

    // Otomatik onay istendiyse hemen uygula
    if (autoApproved) {
      try { await applyApprovalToExcel(partName, action); } catch {}
      rec.decidedBy = by || 'admin';
      rec.decidedAt = Date.now();
    }

    list.push(rec);
    await writeApprovals(list);
    if (io) {
      try {
        io.emit('approvals:updated');
        io.emit('audit:updated');
        if (rec.status === 'approved') io.emit('records:updated');
      } catch {}
    }
    res.json({ success: true, item: rec });
  } catch (e) {
    console.error('POST /api/approvals/request failed:', e);
    res.status(500).json({ message: 'Kayıt hatası' });
  }
});

// Onay verme (direktör) — admin anahtar gerektirir
app.post('/api/approvals/:id/approve', checkAdmin, async (req, res) => {
  try {
    const list = await readApprovals();
    const id = String(req.params.id || '').trim();
    const by = String((req.body || {}).by || 'admin').trim();
    const note = String((req.body || {}).note || '').trim();

    const idx = list.findIndex(x => x.id === id);
    if (idx < 0) return res.status(404).json({ message: 'Kayıt bulunamadı' });

    const rec = list[idx];
    if (rec.status === 'approved') return res.json({ success: true, item: rec });

    // Excel'e uygula
    await applyApprovalToExcel(rec.partName, rec.action);

    rec.status = 'approved';
    rec.decidedBy = by || 'admin';
    rec.decidedAt = Date.now();
    rec.updatedAt = rec.decidedAt;
    if (note) rec.note = note;

    list[idx] = rec;
    await writeApprovals(list);
    if (io) {
      try {
        io.emit('approvals:updated');
        io.emit('audit:updated');
        io.emit('records:updated');
      } catch {}
    }
    res.json({ success: true, item: rec });
  } catch (e) {
    console.error('POST /api/approvals/:id/approve failed:', e);
    res.status(500).json({ message: 'Onay hatası' });
  }
});

// Reddetme (direktör) — admin anahtar gerektirir
app.post('/api/approvals/:id/reject', checkAdmin, async (req, res) => {
  try {
    const list = await readApprovals();
    const id = String(req.params.id || '').trim();
    const by = String((req.body || {}).by || 'admin').trim();
    const note = String((req.body || {}).note || '').trim();

    const idx = list.findIndex(x => x.id === id);
    if (idx < 0) return res.status(404).json({ message: 'Kayıt bulunamadı' });

    const rec = list[idx];
    rec.status = 'rejected';
    rec.decidedBy = by || 'admin';
    rec.decidedAt = Date.now();
    rec.updatedAt = rec.decidedAt;
    if (note) rec.note = note;

    list[idx] = rec;
    await writeApprovals(list);
    if (io) {
      try {
        io.emit('approvals:updated');
        io.emit('audit:updated');
      } catch {}
    }
    res.json({ success: true, item: rec });
  } catch (e) {
    console.error('POST /api/approvals/:id/reject failed:', e);
    res.status(500).json({ message: 'Red hatası' });
  }
});
/* ================== Paylaşım Linkleri (Client Portal) ================== */
const SHARES_JSON = path.resolve(__dirname, 'shares.json');

async function readShares() {
  try {
    const s = await fs.promises.readFile(SHARES_JSON, 'utf8');
    const data = JSON.parse(s);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}
async function writeShares(items) {
  try {
    await fs.promises.writeFile(SHARES_JSON, JSON.stringify(items, null, 2), 'utf8');
  } catch (e) {
    console.error('writeShares failed:', e);
  }
}
function newShareToken(len = 22) {
  // URL-safe token (base64 without + / =), trimmed to desired length
  return crypto.randomBytes(24).toString('base64').replace(/[+/=]/g, '').slice(0, len);
}
function normalizeScope(scope) {
  const s = String(scope || 'view').trim().toLowerCase();
  return s === 'annotate' ? 'annotate' : 'view';
}
function isShareExpired(share) {
  const exp = Number(share && share.expiresAt ? share.expiresAt : 0);
  if (!exp) return false;
  return Date.now() > exp;
}
function hasRemainingUses(share) {
  const max = Number(share && share.maxUses ? share.maxUses : 0); // 0 = unlimited
  const used = Number(share && share.usedCount ? share.usedCount : 0);
  if (max <= 0) return true;
  return used < max;
}

// Admin: paylaşım oluştur
// body: { projectId, modelUrl?, ttlHours=24, singleUse=false, maxUses=0, scope='view', note? }
app.post('/api/shares', checkAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    const projectId = String(body.projectId || '').trim();
    let modelUrl = String(body.modelUrl || '').trim();
    const ttlHoursRaw = body.ttlHours;
    const singleUse = !!body.singleUse;
    let maxUses = Number.isFinite(body.maxUses) ? Number(body.maxUses) : 0; // 0 = unlimited
    const scope = normalizeScope(body.scope);
    const note = String(body.note || '').trim();

    if (!projectId) {
      return res.status(400).json({ message: 'projectId zorunlu' });
    }

    // Proje doğrula ve modelUrl türet
    const projects = await readProjects();
    const proj = projects.find(p => String(p.id).toLowerCase() === projectId.toLowerCase());
    if (!proj) return res.status(404).json({ message: 'Proje bulunamadı' });

    if (!modelUrl) modelUrl = String(proj.modelUrl || '').trim();
    if (!modelUrl || !modelUrl.startsWith('/models/')) {
      return res.status(400).json({ message: 'Geçerli modelUrl bulunamadı (/models/ ile başlamalı)' });
    }

    let ttlHours = Number.isFinite(ttlHoursRaw) ? Number(ttlHoursRaw) : 24;
    if (ttlHours <= 0) ttlHours = 24;
    const now = Date.now();
    const expiresAt = now + ttlHours * 3600 * 1000;

    if (singleUse) maxUses = 1;
    if (!Number.isFinite(maxUses) || maxUses < 0) maxUses = 0;

    const token = newShareToken(22);
    const share = {
      token,
      projectId: proj.id,
      modelUrl,
      scope,
      createdAt: now,
      expiresAt,
      singleUse,
      usedCount: 0,
      maxUses,
      note
    };

    const list = await readShares();
    list.push(share);
    await writeShares(list);

    if (typeof io !== 'undefined' && io) {
      try { io.emit('shares:updated'); } catch {}
    }

    res.json({
      success: true,
      item: share,
      url: `/p/${token}`
    });
  } catch (e) {
    console.error('POST /api/shares failed:', e);
    res.status(500).json({ message: 'Paylaşım oluşturma hatası' });
  }
});

// Admin: paylaşım listesi
app.get('/api/shares', checkAdmin, async (req, res) => {
  try {
    const list = await readShares();
    // Yeni -> eski
    const items = list
      .slice()
      .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
      .map(s => ({
        ...s,
        expired: isShareExpired(s),
        remainingUses: (Number(s.maxUses || 0) <= 0) ? -1 : Math.max(0, Number(s.maxUses || 0) - Number(s.usedCount || 0))
      }));
    res.json({ items });
  } catch (e) {
    console.error('GET /api/shares failed:', e);
    res.status(500).json({ message: 'Listeleme hatası' });
  }
});

// Token: çözümle (client tarafından kullanılacak)
// Dönüş: { token, projectId, modelUrl, scope, expiresAt, singleUse, usedCount, maxUses }
app.get('/api/shares/:token', async (req, res) => {
  try {
    const token = String(req.params.token || '').trim();
    if (!token) return res.status(400).json({ message: 'token gerekli' });

    const list = await readShares();
    const share = list.find(s => String(s.token) === token);
    if (!share) return res.status(404).json({ message: 'Token geçersiz veya bulunamadı' });

    if (isShareExpired(share) || !hasRemainingUses(share)) {
      return res.status(404).json({ message: 'Token geçersiz veya süresi doldu' });
    }

    // İsteğe bağlı: Proje varlığını doğrula (modelUrl güncel mi)
    const projects = await readProjects();
    const proj = projects.find(p => String(p.id).toLowerCase() === String(share.projectId).toLowerCase());
    const modelUrl = String(share.modelUrl || (proj ? proj.modelUrl : '') || '').trim();

    res.json({
      token: share.token,
      projectId: share.projectId,
      modelUrl,
      scope: normalizeScope(share.scope),
      expiresAt: share.expiresAt,
      singleUse: !!share.singleUse,
      usedCount: Number(share.usedCount || 0),
      maxUses: Number(share.maxUses || 0)
    });
  } catch (e) {
    console.error('GET /api/shares/:token failed:', e);
    res.status(500).json({ message: 'Token çözümleme hatası' });
  }
});

// Token: kullanım bildirimi (single-use / sayılı kullanım için)
app.post('/api/shares/:token/consume', async (req, res) => {
  try {
    const token = String(req.params.token || '').trim();
    if (!token) return res.status(400).json({ message: 'token gerekli' });

    const list = await readShares();
    const idx = list.findIndex(s => String(s.token) === token);
    if (idx < 0) return res.status(404).json({ message: 'Token bulunamadı' });

    const share = list[idx];

    if (isShareExpired(share)) {
      return res.status(409).json({ message: 'Token süresi dolmuş' });
    }
    if (!hasRemainingUses(share)) {
      return res.status(409).json({ message: 'Token kullanım hakkı kalmadı' });
    }

    share.usedCount = Number(share.usedCount || 0) + 1;
    share.lastUsedAt = Date.now();
    list[idx] = share;

    await writeShares(list);

    if (typeof io !== 'undefined' && io) {
      try { io.emit('shares:updated'); } catch {}
    }

    res.json({ success: true, usedCount: share.usedCount, singleUse: !!share.singleUse });
  } catch (e) {
    console.error('POST /api/shares/:token/consume failed:', e);
    res.status(500).json({ message: 'Kullanım bildirimi hatası' });
  }
});
// ================== Summary API (Director Dashboard) ==================
app.get('/api/summary', async (req, res) => {
  try {
    const { ws } = await ensureWorkbook();
    const rows = worksheetToJSON(ws);

    const q = req.query || {};
    const projectNo = String(q.projectNo || q.projeNo || '').trim().toLowerCase();
    const partCode = String(q.partCode || q.parcaKodu || '').trim().toLowerCase();
    const assemblyStatus = String(q.assemblyStatus || '').trim().toLowerCase();
    const dateField = String(q.dateField || 'Termin Tarihi');

    const df = String(q.dateFrom || '').trim();
    const dt = String(q.dateTo || '').trim();
    const from = df ? new Date(df) : null;
    const to = dt ? new Date(dt) : null;
    const validFrom = (from && !isNaN(from)) ? from : null;
    const validTo = (to && !isNaN(to)) ? to : null;

    const normalizeTr = (s) => String(s || '')
      .toLowerCase()
      .replace(/ı/g, 'i')
      .replace(/ğ/g, 'g')
      .replace(/ü/g, 'u')
      .replace(/ş/g, 's')
      .replace(/ö/g, 'o')
      .replace(/ç/g, 'c')
      .trim();

    const STATUS_KEYS = ['tezgahta', 'tamamlandi', 'kalitede', 'siparis', 'stokta', 'beklemede', 'fason'];
    const statusCounts = STATUS_KEYS.reduce((m, k) => { m[k] = 0; return m; }, {});

    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    const overdueParts = [];
    let missingPartsCount = 0;
    let dailyAssemblyRate = 0; // best-effort without explicit timestamps

    rows.forEach(r => {
      // Filters
      if (projectNo && String(r['Proje No'] || '').toLowerCase() !== projectNo) return;

      if (partCode) {
        const kod = String(r['Parça Kodu'] || '').toLowerCase();
        const ad = String(r['Parça Adı'] || '').toLowerCase();
        if (!kod.includes(partCode) && !ad.includes(partCode)) return;
      }

      if (assemblyStatus) {
        const ms = normalizeTr(r['Montaj Durumu']);
        if (ms !== assemblyStatus) return;
      }

      if (validFrom || validTo) {
        const raw = r[dateField] || r['Termin Tarihi'] || r['Gönderim Tarihi'];
        const d = raw ? new Date(raw) : null;
        if (d && !isNaN(d)) {
          if (validFrom && d < validFrom) return;
          if (validTo) {
            const end = new Date(validTo.getFullYear(), validTo.getMonth(), validTo.getDate(), 23, 59, 59, 999);
            if (d > end) return;
          }
        } else {
          // If date is invalid and a date filter is specified, exclude
          return;
        }
      }

      // Status counts from "Durum"
      const st = normalizeTr(r['Durum']);
      if (STATUS_KEYS.includes(st)) statusCounts[st] += 1;

      // Missing parts
      const missingRaw = String(r['Eksik'] || '').trim();
      const isMissing = missingRaw === '1' || /^(evet|true|yes)$/i.test(missingRaw);
      if (isMissing) missingPartsCount += 1;

      // Daily assembly rate (best-effort): if Montaj Durumu == 'tightened' and date equals today
      const montaj = normalizeTr(r['Montaj Durumu']);
      if (montaj === 'tightened') {
        const tRaw = r['Termin Tarihi'] || r['Gönderim Tarihi'];
        const td = tRaw ? new Date(tRaw) : null;
        if (td && !isNaN(td)) {
          const sod = new Date(td.getFullYear(), td.getMonth(), td.getDate());
          if (sod.getTime() === startOfToday.getTime()) dailyAssemblyRate += 1;
        }
      }

      // Overdue parts: due date < today and not completed
      const dueRaw = r['Termin Tarihi'];
      const due = dueRaw ? new Date(dueRaw) : null;
      const isCompleted = (st === 'tamamlandi') || (montaj === 'tightened');
      if (due && !isNaN(due) && due < startOfToday && !isCompleted) {
        overdueParts.push({
          name: String(r['Parça Adı'] || r['Parça Kodu'] || '').trim(),
          dueDate: due.toISOString()
        });
      }
    });

    overdueParts.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
    const overduePartsLimited = overdueParts.slice(0, 50);

    res.json({
      statusCounts,
      overduePartsCount: overdueParts.length,
      overdueParts: overduePartsLimited,
      kpi: {
        missingPartsCount,
        dailyAssemblyRate,
        avgCompletionHours: null // Not available from current Excel schema
      }
    });
  } catch (e) {
    console.error('GET /api/summary failed:', e);
    res.status(500).json({ message: 'Özet oluşturulamadı' });
  }
});
// Server'ı başlat
server.listen(PORT, () => {
 console.log(`Server running on port ${PORT}`);
});