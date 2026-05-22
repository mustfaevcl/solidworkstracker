import React, { useState, useEffect } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, useGLTF, Environment } from '@react-three/drei';

// Basit 3D model görüntüleyici
function SimpleModel() {
  const modelPath = '/otc-0915-0000000-r00.glb';
  const { scene } = useGLTF(modelPath);

  useEffect(() => {
    if (scene) {
      scene.rotation.y = Math.PI / 4;
      scene.traverse((child) => {
        if (child.isMesh) {
          child.material = new THREE.MeshStandardMaterial({
            color: new THREE.Color('#2980b9'),
            metalness: 0.7,
            roughness: 0.2,
            envMapIntensity: 1,
          });
        }
      });
    }
  }, [scene]);

  return <primitive object={scene} scale={0.5} position={[0, -1, 0]} />;
}

function Login({ onLogin }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [users] = useState([
    { id: 1, name: 'Admin', username: 'admin', password: 'admin123', role: 'admin' },
    { id: 2, name: 'Üretim Sorumlusu', username: 'uretim', password: 'uretim123', role: 'production' },
    { id: 3, name: 'Kalite Kontrol', username: 'kalite', password: 'kalite123', role: 'quality' },
  ]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (selectedUser) {
      const el = document.getElementById('password-field');
      if (el) el.focus();
    }
  }, [selectedUser]);

  const handleUserSelect = (user) => {
    setSelectedUser(user);
    setError('');
    setPassword('');
  };

  const handleLogin = (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    setTimeout(() => {
      const user = users.find(
        (u) => u.username === selectedUser.username && u.password === password
      );

      if (user) {
        onLogin(user);
      } else {
        setError('Kullanıcı adı veya şifre hatalı!');
        setIsLoading(false);
      }
    }, 1000);
  };

  const getRoleLabel = (role) => {
    if (role === 'admin') return 'Yönetici';
    if (role === 'production') return 'Üretim Sorumlusu';
    return 'Kalite Kontrol';
  };

  return (
    <div className="login-page">
      {/* Sol taraf - 3D model */}
      <div className="login-left">
        <Canvas
          camera={{ position: [0, 0, 5], fov: 50 }}
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
        >
          <ambientLight intensity={0.5} />
          <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} intensity={1} castShadow />
          <SimpleModel />
          <Environment preset="warehouse" />
          <OrbitControls
            enableZoom={false}
            enablePan={false}
            autoRotate
            autoRotateSpeed={0.5}
          />
        </Canvas>

        <div style={{
          position: 'absolute',
          bottom: '10%',
          left: '10%',
          color: 'white',
          zIndex: 10,
        }}>
          <h1 style={{ fontSize: '2.5rem', margin: 0, textShadow: '2px 2px 4px rgba(0,0,0,0.5)' }}>
            Üretim Takip Sistemi
          </h1>
          <p style={{ fontSize: '1.2rem', maxWidth: '400px', textShadow: '1px 1px 2px rgba(0,0,0,0.5)' }}>
            3D model üzerinden parça durumlarını takip edin, üretim süreçlerini yönetin.
          </p>
        </div>
      </div>

      {/* Sağ taraf - Giriş formu */}
      <div className="login-right">
        <h2 className="login-title">Hoş Geldiniz</h2>
        <p className="login-subtitle">Lütfen hesabınıza giriş yapın</p>

        {!selectedUser ? (
          // Kullanıcı seçim ekranı
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {users.map((user) => (
              <div
                key={user.id}
                className="login-user-card"
                onClick={() => handleUserSelect(user)}
              >
                <div className="avatar avatar-lg">
                  {user.name.charAt(0)}
                </div>
                <div>
                  <div className="login-user-name">{user.name}</div>
                  <div className="login-user-role">{getRoleLabel(user.role)}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          // Şifre giriş ekranı
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div
              className="login-user-card selected"
              style={{ cursor: 'default' }}
            >
              <div className="avatar avatar-lg">
                {selectedUser.name.charAt(0)}
              </div>
              <div>
                <div className="login-user-name">{selectedUser.name}</div>
                <div className="login-user-role">{getRoleLabel(selectedUser.role)}</div>
              </div>
            </div>

            <div className="field-group">
              <label className="field-label" htmlFor="password-field">Şifre</label>
              <input
                id="password-field"
                className="field-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Şifrenizi girin"
                required
              />
            </div>

            {error && (
              <div className="save-feedback error">{error}</div>
            )}

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ flex: 1 }}
                onClick={() => setSelectedUser(null)}
              >
                Geri
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                style={{ flex: 2 }}
                disabled={isLoading}
              >
                {isLoading ? (
                  <span className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }} />
                ) : 'Giriş Yap'}
              </button>
            </div>
          </form>
        )}

        <div style={{ marginTop: '30px', textAlign: 'center', color: 'var(--text-light)', fontSize: '12px' }}>
          &copy; 2025 GMM Üretim Takip Sistemi
        </div>
      </div>
    </div>
  );
}

export default Login;
