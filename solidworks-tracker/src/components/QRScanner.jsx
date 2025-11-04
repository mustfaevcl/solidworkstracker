import React, { useEffect, useRef, useState, useCallback } from "react";

export default function QRScanner({ onDetect, autoStart = false }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const detectorRef = useRef(null);
  const [supported, setSupported] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [lastText, setLastText] = useState("");

  const stop = useCallback(() => {
    setRunning(false);
    try {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    } catch {}
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      streamRef.current = null;
    } catch {}
  }, []);

  const start = useCallback(async () => {
    setError("");
    try {
      // BarcodeDetector support check
      if ("BarcodeDetector" in window) {
        const formats = ["qr_code", "code_128", "code_39", "ean_13", "ean_8", "upc_a"];
        try {
          // @ts-ignore
          detectorRef.current = new window.BarcodeDetector({ formats });
          setSupported(true);
        } catch {
          detectorRef.current = null;
          setSupported(false);
        }
      } else {
        setSupported(false);
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setRunning(true);

      const scanLoop = async () => {
        if (!running || !videoRef.current) return;
        try {
          if (detectorRef.current) {
            const detections = await detectorRef.current.detect(videoRef.current);
            if (detections && detections.length > 0) {
              const text = detections[0].rawValue || detections[0].rawValue || "";
              if (text && text !== lastText) {
                setLastText(text);
                if (typeof onDetect === "function") onDetect(text);
              }
            }
          }
        } catch (e) {
          // Swallow per-frame errors to keep loop alive
        }
        rafRef.current = requestAnimationFrame(scanLoop);
      };
      rafRef.current = requestAnimationFrame(scanLoop);
    } catch (e) {
      setError(e?.message || "Kamera başlatılamadı");
      stop();
    }
  }, [onDetect, running, lastText, stop]);

  useEffect(() => {
    if (autoStart) start();
    return () => stop();
  }, [autoStart, start, stop]);

  return (
    <div style={{ border: "1px solid #e2e2e2", borderRadius: 8, padding: 12, background: "#fafafa" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>QR/Barcode Tarayıcı</h3>
        <div style={{ display: "flex", gap: 8 }}>
          {!running ? (
            <button
              onClick={start}
              style={{ padding: "6px 10px", border: "1px solid #ccc", borderRadius: 6, background: "#fff", cursor: "pointer" }}
              title="Kamerayı başlat"
            >
              Başlat
            </button>
          ) : (
            <button
              onClick={stop}
              style={{ background: "#fff5f5", border: "1px solid #f2b2b2", color: "#b23", padding: "6px 10px", borderRadius: 6, cursor: "pointer" }}
              title="Kamerayı durdur"
            >
              Durdur
            </button>
          )}
        </div>
      </div>

      {!supported && (
        <div style={{ marginTop: 8, color: "#777", fontSize: 12 }}>
          Tarayıcı BarcodeDetector API desteklemiyor olabilir. Destekleyen bir tarayıcıda (Chrome/Edge mobil) daha iyi sonuç alınır.
        </div>
      )}

      {error && (
        <div style={{ marginTop: 8, color: "#b23" }}>
          {error}
        </div>
      )}

      <div style={{ display: "grid", placeItems: "center", marginTop: 10 }}>
        <video
          ref={videoRef}
          playsInline
          muted
          style={{
            width: "100%",
            maxWidth: 420,
            aspectRatio: "4 / 3",
            background: "#000",
            borderRadius: 8,
            border: "1px solid #ddd",
            transform: "scaleX(-1)" // mirror for back camera UI consistency
          }}
        />
      </div>

      {lastText && (
        <div style={{ marginTop: 10, fontSize: 13 }}>
          <strong>Son Okunan:</strong> <span style={{ color: "#333" }}>{lastText}</span>
        </div>
      )}
    </div>
  );
}