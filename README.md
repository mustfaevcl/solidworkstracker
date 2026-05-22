# OTC Üretim Takip Sistemi

3D model üzerinden parça durumlarını takip eden, üretim süreçlerini yöneten profesyonel web uygulaması.

## 🚀 Hızlı Başlangıç

### Backend

```bash
cd solidworkstracker
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

API Docs: http://localhost:8000/docs

### Frontend

```bash
cd solidworks-tracker-clean
cp .env.example .env
npm install
npm run dev
```

Uygulama: http://localhost:5173

## 👥 Varsayılan Kullanıcılar

| Kullanıcı | Şifre     | Rol       |
|-----------|-----------|-----------|
| admin     | admin123  | Yönetici  |
| uretim    | uretim123 | Üretim    |
| kalite    | kalite123 | Kalite    |

> ⚠️ Prodüksiyon ortamında şifreleri değiştirin!

## 🛠 Teknolojiler

**Frontend:** React 19, Three.js, React Three Fiber, Zustand, Vite  
**Backend:** FastAPI, SQLite, Pydantic

## 📱 Desteklenen Cihazlar

- ✅ Masaüstü (1024px+)
- ✅ Tablet (768px - 1024px)
- ✅ Mobil (< 768px) — Drawer navigasyon

## 🏗 Mimari

```
solidworkstracker/
├── main.py              # FastAPI backend (SQLite)
├── requirements.txt
├── otc_tracker.db       # SQLite veritabanı (auto-created)
└── solidworks-tracker-clean/
    ├── src/
    │   ├── App.jsx          # Ana uygulama
    │   ├── api.js           # API katmanı
    │   ├── components/
    │   │   ├── Login.jsx
    │   │   ├── MachineModel.jsx  # 3D model
    │   │   ├── TreeMenu.jsx      # Ağaç menü
    │   │   ├── PartPanel.jsx     # Parça detay paneli
    │   │   ├── Dashboard.jsx     # İstatistik bar
    │   │   ├── UserManagement.jsx # Hesap yönetimi
    │   │   └── store/state.js    # Zustand store
    │   └── index.css        # Global CSS sistemi
    └── vite.config.js
```

## 🔒 Güvenlik Notları

- Prodüksiyonda `VITE_API_URL` env değişkenini ayarlayın
- Backend'de JWT authentication eklenebilir
- SQLite yerine PostgreSQL kullanılabilir (büyük kurulumlar için)
