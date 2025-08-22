// Bu dosyada, veritabanı yerine geçici olarak kullanıcı verilerini saklıyoruz.
// Gerçek bir uygulamada bu veriler şifrelenmiş olarak bir veritabanında tutulmalıdır.

const users = [
  {
    id: 1,
    username: 'admin',
    password: 'admin123', // Lütfen gerçek projelerde şifreleri asla bu şekilde saklamayın!
    name: 'Admin',
    role: 'admin' // Her şeye erişebilir
  },
  {
    id: 2,
    username: 'production_user',
    password: 'prodpass',
    name: 'Üretim Sorumlusu',
    role: 'production' // Durumları güncelleyebilir, not ekleyebilir
  },
  {
    id: 3,
    username: 'quality_user',
    password: 'qualpass',
    name: 'Kalite Kontrol',
    role: 'quality' // Sadece 'kalitede' durumunu seçebilir, notları değiştiremez
  }
];

module.exports = users;