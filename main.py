"""
OTC Üretim Takip Sistemi - Backend API
FastAPI + SQLite tabanlı profesyonel backend
"""

from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from pydantic import BaseModel, Field
from typing import Optional, List
import sqlite3
import os
import json
import secrets
import hashlib
from datetime import datetime

# ─── App ────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="OTC Üretim Takip API",
    description="Parça durumu ve üretim süreci takip sistemi",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── DB ─────────────────────────────────────────────────────────────────────
DB_PATH = "otc_tracker.db"

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()

def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    # Parça kayıtları tablosu
    c.execute("""
        CREATE TABLE IF NOT EXISTS parts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            parca_adi TEXT NOT NULL UNIQUE,
            proje_no TEXT DEFAULT '',
            parca_kodu TEXT DEFAULT '',
            durum TEXT DEFAULT '',
            machine_type TEXT DEFAULT '',
            purchase_status TEXT DEFAULT '',
            location TEXT DEFAULT '',
            outsource_company TEXT DEFAULT '',
            outsource_date TEXT DEFAULT '',
            due_date TEXT DEFAULT '',
            notes TEXT DEFAULT '',
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )
    """)

    # Kullanıcılar tablosu
    c.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            name TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'viewer',
            active INTEGER DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now')),
            last_login TEXT
        )
    """)

    # Aktivite logu
    c.execute("""
        CREATE TABLE IF NOT EXISTS activity_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user TEXT,
            action TEXT,
            parca_adi TEXT,
            details TEXT,
            ts TEXT DEFAULT (datetime('now'))
        )
    """)

    # Varsayılan kullanıcıları ekle (yoksa)
    default_users = [
        ("admin", "admin123", "Admin", "admin"),
        ("uretim", "uretim123", "Üretim Sorumlusu", "production"),
        ("kalite", "kalite123", "Kalite Kontrol", "quality"),
    ]
    for username, password, name, role in default_users:
        existing = c.execute("SELECT id FROM users WHERE username=?", (username,)).fetchone()
        if not existing:
            pw_hash = hashlib.sha256(password.encode()).hexdigest()
            c.execute("INSERT INTO users (username, password_hash, name, role) VALUES (?,?,?,?)",
                      (username, pw_hash, name, role))

    conn.commit()
    conn.close()

init_db()

# ─── Models ─────────────────────────────────────────────────────────────────
class PartRecord(BaseModel):
    parcaAdi: str
    projeNo: Optional[str] = ""
    parcaKodu: Optional[str] = ""
    durum: Optional[str] = ""
    machineType: Optional[str] = ""
    purchaseStatus: Optional[str] = ""
    location: Optional[str] = ""
    outsourceCompany: Optional[str] = ""
    outsourceDate: Optional[str] = ""
    dueDate: Optional[str] = ""
    notes: Optional[str] = ""

class UserLogin(BaseModel):
    username: str
    password: str

class UserCreate(BaseModel):
    username: str
    password: str
    name: str
    role: str = "viewer"

class UserUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    active: Optional[int] = None
    password: Optional[str] = None

# ─── Auth ────────────────────────────────────────────────────────────────────
@app.post("/auth/login")
def login(credentials: UserLogin, db: sqlite3.Connection = Depends(get_db)):
    pw_hash = hashlib.sha256(credentials.password.encode()).hexdigest()
    user = db.execute(
        "SELECT id, username, name, role, active FROM users WHERE username=? AND password_hash=?",
        (credentials.username, pw_hash)
    ).fetchone()
    if not user:
        raise HTTPException(status_code=401, detail="Kullanıcı adı veya şifre hatalı")
    if not user["active"]:
        raise HTTPException(status_code=403, detail="Hesap devre dışı")
    # last_login güncelle
    db.execute("UPDATE users SET last_login=datetime('now') WHERE id=?", (user["id"],))
    db.commit()
    return {
        "id": user["id"],
        "username": user["username"],
        "name": user["name"],
        "role": user["role"],
    }

# ─── Users ──────────────────────────────────────────────────────────────────
@app.get("/users")
def get_users(db: sqlite3.Connection = Depends(get_db)):
    rows = db.execute("SELECT id, username, name, role, active, created_at, last_login FROM users").fetchall()
    return [dict(r) for r in rows]

@app.post("/users")
def create_user(user: UserCreate, db: sqlite3.Connection = Depends(get_db)):
    existing = db.execute("SELECT id FROM users WHERE username=?", (user.username,)).fetchone()
    if existing:
        raise HTTPException(status_code=400, detail="Bu kullanıcı adı zaten mevcut")
    pw_hash = hashlib.sha256(user.password.encode()).hexdigest()
    db.execute(
        "INSERT INTO users (username, password_hash, name, role) VALUES (?,?,?,?)",
        (user.username, pw_hash, user.name, user.role)
    )
    db.commit()
    return {"message": "Kullanıcı oluşturuldu"}

@app.put("/users/{user_id}")
def update_user(user_id: int, data: UserUpdate, db: sqlite3.Connection = Depends(get_db)):
    user = db.execute("SELECT id FROM users WHERE id=?", (user_id,)).fetchone()
    if not user:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
    if data.name is not None:
        db.execute("UPDATE users SET name=? WHERE id=?", (data.name, user_id))
    if data.role is not None:
        db.execute("UPDATE users SET role=? WHERE id=?", (data.role, user_id))
    if data.active is not None:
        db.execute("UPDATE users SET active=? WHERE id=?", (data.active, user_id))
    if data.password is not None:
        pw_hash = hashlib.sha256(data.password.encode()).hexdigest()
        db.execute("UPDATE users SET password_hash=? WHERE id=?", (pw_hash, user_id))
    db.commit()
    return {"message": "Kullanıcı güncellendi"}

@app.delete("/users/{user_id}")
def delete_user(user_id: int, db: sqlite3.Connection = Depends(get_db)):
    db.execute("DELETE FROM users WHERE id=?", (user_id,))
    db.commit()
    return {"message": "Kullanıcı silindi"}

# ─── Parts ──────────────────────────────────────────────────────────────────
def row_to_part(row):
    return {
        "id": row["id"],
        "parcaAdi": row["parca_adi"],
        "projeNo": row["proje_no"] or "",
        "parcaKodu": row["parca_kodu"] or "",
        "durum": row["durum"] or "",
        "machineType": row["machine_type"] or "",
        "purchaseStatus": row["purchase_status"] or "",
        "location": row["location"] or "",
        "outsourceCompany": row["outsource_company"] or "",
        "outsourceDate": row["outsource_date"] or "",
        "dueDate": row["due_date"] or "",
        "notes": row["notes"] or "",
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }

@app.get("/records")
def get_records(db: sqlite3.Connection = Depends(get_db)):
    rows = db.execute("SELECT * FROM parts ORDER BY updated_at DESC").fetchall()
    return [row_to_part(r) for r in rows]

@app.post("/records")
def add_record(record: PartRecord, db: sqlite3.Connection = Depends(get_db)):
    existing = db.execute("SELECT id FROM parts WHERE parca_adi=?", (record.parcaAdi,)).fetchone()
    if existing:
        raise HTTPException(status_code=400, detail="Bu parça zaten kayıtlı. Güncelleme için PUT kullanın.")
    db.execute("""
        INSERT INTO parts (parca_adi, proje_no, parca_kodu, durum, machine_type, purchase_status,
                           location, outsource_company, outsource_date, due_date, notes)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)
    """, (record.parcaAdi, record.projeNo, record.parcaKodu, record.durum,
          record.machineType, record.purchaseStatus, record.location,
          record.outsourceCompany, record.outsourceDate, record.dueDate, record.notes))
    db.commit()
    return {"message": "Kayıt eklendi"}

@app.put("/records/{parca_adi}")
def update_record(parca_adi: str, record: PartRecord, db: sqlite3.Connection = Depends(get_db)):
    existing = db.execute("SELECT id FROM parts WHERE parca_adi=?", (parca_adi,)).fetchone()
    if not existing:
        # Yoksa oluştur (upsert)
        db.execute("""
            INSERT INTO parts (parca_adi, proje_no, parca_kodu, durum, machine_type, purchase_status,
                               location, outsource_company, outsource_date, due_date, notes)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)
        """, (record.parcaAdi, record.projeNo, record.parcaKodu, record.durum,
              record.machineType, record.purchaseStatus, record.location,
              record.outsourceCompany, record.outsourceDate, record.dueDate, record.notes))
    else:
        db.execute("""
            UPDATE parts SET
                proje_no=?, parca_kodu=?, durum=?, machine_type=?, purchase_status=?,
                location=?, outsource_company=?, outsource_date=?, due_date=?, notes=?,
                updated_at=datetime('now')
            WHERE parca_adi=?
        """, (record.projeNo, record.parcaKodu, record.durum,
              record.machineType, record.purchaseStatus, record.location,
              record.outsourceCompany, record.outsourceDate, record.dueDate, record.notes,
              parca_adi))
    db.commit()
    return {"message": "Kayıt güncellendi"}

@app.delete("/records/{parca_adi}")
def delete_record(parca_adi: str, db: sqlite3.Connection = Depends(get_db)):
    result = db.execute("DELETE FROM parts WHERE parca_adi=?", (parca_adi,))
    db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Parça bulunamadı")
    return {"message": "Kayıt silindi"}

@app.patch("/records/{parca_adi}/status")
def update_status(parca_adi: str, body: dict, db: sqlite3.Connection = Depends(get_db)):
    """Sadece durum güncelle — hızlı endpoint"""
    durum = body.get("durum", "")
    existing = db.execute("SELECT id FROM parts WHERE parca_adi=?", (parca_adi,)).fetchone()
    if not existing:
        db.execute(
            "INSERT INTO parts (parca_adi, durum) VALUES (?,?)",
            (parca_adi, durum)
        )
    else:
        db.execute(
            "UPDATE parts SET durum=?, updated_at=datetime('now') WHERE parca_adi=?",
            (durum, parca_adi)
        )
    db.commit()
    return {"message": "Durum güncellendi", "durum": durum}

@app.get("/stats")
def get_stats(db: sqlite3.Connection = Depends(get_db)):
    """Dashboard istatistikleri"""
    total = db.execute("SELECT COUNT(*) as cnt FROM parts").fetchone()["cnt"]
    by_status = db.execute(
        "SELECT durum, COUNT(*) as cnt FROM parts WHERE durum != '' GROUP BY durum"
    ).fetchall()
    return {
        "total": total,
        "byStatus": {r["durum"]: r["cnt"] for r in by_status}
    }

@app.get("/activity")
def get_activity(limit: int = 50, db: sqlite3.Connection = Depends(get_db)):
    rows = db.execute(
        "SELECT * FROM activity_log ORDER BY ts DESC LIMIT ?", (limit,)
    ).fetchall()
    return [dict(r) for r in rows]

# Legacy compat endpoints (eski frontend ile uyumluluk)
@app.post("/add_record")
def add_record_legacy(record: PartRecord, db: sqlite3.Connection = Depends(get_db)):
    return add_record(record, db)

@app.put("/update_record/{parca_adi}")
def update_record_legacy(parca_adi: str, record: PartRecord, db: sqlite3.Connection = Depends(get_db)):
    return update_record(parca_adi, record, db)

@app.delete("/delete_record/{parca_adi}")
def delete_record_legacy(parca_adi: str, db: sqlite3.Connection = Depends(get_db)):
    return delete_record(parca_adi, db)

@app.get("/")
def root():
    return {"message": "OTC Üretim Takip API v2.0", "docs": "/docs"}
