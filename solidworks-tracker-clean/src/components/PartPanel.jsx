import React, { useState } from 'react';
import useStore from './store/state';
import { addRecord, updateRecord } from '../api';

const STATUS_LIST = [
  { key: 'tezgahta', label: 'Tezgahta', color: 'var(--status-tezgahta)' },
  { key: 'tamamlandi', label: 'Tamamlandı', color: 'var(--status-tamamlandi)' },
  { key: 'kalitede', label: 'Kalitede', color: 'var(--status-kalitede)' },
  { key: 'siparis', label: 'Sipariş', color: 'var(--status-siparis)' },
  { key: 'stokta', label: 'Stokta', color: 'var(--status-stokta)' },
  { key: 'beklemede', label: 'Beklemede', color: 'var(--status-beklemede)' },
  { key: 'fason', label: 'Fason', color: 'var(--status-fason)' },
  { key: 'montajda', label: 'Montajda', color: 'var(--status-montajda)' },
];

const MACHINE_TYPES = ['CNC', 'Torna', 'Freze', 'Borwerk', 'Kaynak', 'Tesviye'];
const PURCHASE_STATUSES = [
  'Sipariş Edilmedi',
  'Sipariş Edildi',
  'Kısmi Tedarik',
  'Tedarik Edildi',
  'Stokta Mevcut',
];

export default function PartPanel({ selectedPart, onStatusChange }) {
  const { partStatuses, partDetails, updatePartDetail } = useStore();
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  const currentStatus = partStatuses[selectedPart] || '';
  const details = partDetails[selectedPart] || {};

  const handleDetailChange = (field, value) => updatePartDetail(selectedPart, field, value);

  const handleSave = async () => {
    if (!selectedPart) return;
    setSaving(true);
    setSaveMsg('');
    try {
      const record = {
        projeNo: details.projeNo || '',
        parcaKodu: details.parcaKodu || '',
        parcaAdi: selectedPart,
        durum: currentStatus,
        machineType: details.machineType || '',
        purchaseStatus: details.purchaseStatus || '',
        location: details.location || '',
        outsourceCompany: details.outsourceCompany || '',
        outsourceDate: details.outsourceDate || '',
        dueDate: details.dueDate || '',
        notes: details.notes || '',
      };
      try {
        await updateRecord(selectedPart, record);
      } catch {
        await addRecord(record);
      }
      setSaveMsg('success');
    } catch (err) {
      setSaveMsg('error:' + err.message);
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(''), 3000);
    }
  };

  if (!selectedPart) {
    return (
      <div className="part-panel-empty">
        <div className="part-panel-empty-icon">🔩</div>
        <div className="part-panel-empty-text">Bir parçaya tıklayın</div>
      </div>
    );
  }

  return (
    <>
      <div className="part-panel-header">
        <div className="part-panel-title">{selectedPart}</div>
        {currentStatus && (
          <div className="part-panel-subtitle">Durum: {currentStatus}</div>
        )}
      </div>
      <div className="part-panel-body">
        {/* Durum */}
        <div>
          <div className="section-title">Durum</div>
          <div className="status-buttons" style={{ marginTop: '8px' }}>
            {STATUS_LIST.map(({ key, label, color }) => (
              <button
                key={key}
                className="status-btn"
                onClick={() => onStatusChange(key)}
                style={{
                  backgroundColor: currentStatus === key ? color : 'transparent',
                  color: currentStatus === key ? 'white' : color,
                  borderColor: color,
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Proje No & Parça Kodu */}
        <div className="field-row">
          <div className="field-group">
            <label className="field-label">Proje No</label>
            <input
              className="field-input"
              type="text"
              value={details.projeNo || ''}
              onChange={(e) => handleDetailChange('projeNo', e.target.value)}
              placeholder="OTC-XXX"
            />
          </div>
          <div className="field-group">
            <label className="field-label">Parça Kodu</label>
            <input
              className="field-input"
              type="text"
              value={details.parcaKodu || ''}
              onChange={(e) => handleDetailChange('parcaKodu', e.target.value)}
              placeholder="P-001"
            />
          </div>
        </div>

        {/* Tezgah Türü */}
        <div className="field-group">
          <label className="field-label">Tezgah Türü</label>
          <select
            className="field-select"
            value={details.machineType || ''}
            onChange={(e) => handleDetailChange('machineType', e.target.value)}
          >
            <option value="">Seçin...</option>
            {MACHINE_TYPES.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        {/* Satın Alma Durumu */}
        <div className="field-group">
          <label className="field-label">Satın Alma</label>
          <select
            className="field-select"
            value={details.purchaseStatus || ''}
            onChange={(e) => handleDetailChange('purchaseStatus', e.target.value)}
          >
            <option value="">Seçin...</option>
            {PURCHASE_STATUSES.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>

        {/* Konum */}
        <div className="field-group">
          <label className="field-label">Konum</label>
          <input
            className="field-input"
            type="text"
            value={details.location || ''}
            onChange={(e) => handleDetailChange('location', e.target.value)}
            placeholder="Depo A, Raf 3..."
          />
        </div>

        {/* Tarihler */}
        <div className="field-row">
          <div className="field-group">
            <label className="field-label">Termin</label>
            <input
              className="field-input"
              type="date"
              value={details.dueDate || ''}
              onChange={(e) => handleDetailChange('dueDate', e.target.value)}
            />
          </div>
          <div className="field-group">
            <label className="field-label">Gönderim</label>
            <input
              className="field-input"
              type="date"
              value={details.outsourceDate || ''}
              onChange={(e) => handleDetailChange('outsourceDate', e.target.value)}
            />
          </div>
        </div>

        {/* Fason Firma */}
        <div className="field-group">
          <label className="field-label">Fason Firma</label>
          <input
            className="field-input"
            type="text"
            value={details.outsourceCompany || ''}
            onChange={(e) => handleDetailChange('outsourceCompany', e.target.value)}
            placeholder="Firma adı..."
          />
        </div>

        {/* Notlar */}
        <div className="field-group">
          <label className="field-label">Notlar</label>
          <textarea
            className="field-textarea"
            value={details.notes || ''}
            onChange={(e) => handleDetailChange('notes', e.target.value)}
            placeholder="Parça notları..."
          />
        </div>

        {/* Kaydet */}
        <button
          className="btn btn-success btn-block"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? '⏳ Kaydediliyor...' : '💾 Kaydet'}
        </button>

        {saveMsg === 'success' && (
          <div className="save-feedback success">✅ Kaydedildi!</div>
        )}
        {saveMsg.startsWith('error:') && (
          <div className="save-feedback error">❌ {saveMsg.slice(6)}</div>
        )}
      </div>
    </>
  );
}
