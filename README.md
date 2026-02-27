# 🗑️ Instagram DM Cleaner

Instagram web arayüzünde DM (Direct Message) sohbetlerinizi toplu olarak silmenizi sağlayan Chrome eklentisi.

## ✨ Özellikler

- **Arka Planda Silme** — Ayrı bir pencerede çalışır, siz Instagram'da gezinmeye devam edersiniz
- **Hız Ayarları** — 🐢 Güvenli / ⚡ Normal / 🚀 Hızlı modları
- **Duraklat & Devam Et** — İstediğiniz zaman silmeyi durdurup tekrar başlatabilirsiniz
- **Anti-Bot Koruması** — Rastgele bekleme süreleri ve doğal molalar ile hesap güvenliği
- **İlerleme Takibi** — Gerçek zamanlı progress paneli ile kaç DM silindiğini görün
- **Modern Arayüz** — Dark tema, animasyonlar ve şık onay dialogları

## 📦 Kurulum

1. Bu projeyi bilgisayarınıza indirin
2. Chrome tarayıcınızda `chrome://extensions/` adresine gidin
3. Sağ üst köşedeki **Geliştirici modu**'nu açın
4. **Paketlenmemiş öğe yükle** butonuna tıklayın
5. İndirdiğiniz proje klasörünü seçin

> 🔗 Chrome Web Store: [Instagram DM Cleaner](https://chromewebstore.google.com/detail/instagram-dm-cleaner/ahmmnkmhmidpggdipmmijaiphnaoeidh)

## 🚀 Kullanım

1. **Hız seçin** — Eklenti ikonuna tıklayıp popup'tan silme hızını ayarlayın
2. **DM sayfasını açın** — `instagram.com/direct/inbox/` adresine gidin
3. **Silmeye başlayın** — **🗑️ Tüm DM'leri Sil** butonuna tıklayın
4. **Gezinmeye devam edin** — Küçük bir pencere açılır, silme orada gerçekleşir
5. **Kontrol edin** — Sağ alttaki panelden ilerlemeyi takip edin, ⏸️ ile duraklatın

## ⚡ Hız Modları

| Mod | Hız | Mola Sıklığı | Risk |
|---|---|---|---|
| 🐢 Güvenli | 2-4 sn/sohbet | Her 8 silmede | Minimum |
| ⚡ Normal | 1-1.5 sn/sohbet | Her 12 silmede | Düşük |
| 🚀 Hızlı | 0.5-1 sn/sohbet | Her 15 silmede | Orta (uyarı gösterilir) |

## ⚠️ Uyarılar

- Bu işlem **geri alınamaz**. Silinen sohbetler kurtarılamaz.
- **Hızlı mod** kullanırken Instagram bot algılaması yapabilir. Güvenli mod önerilir.
- Instagram arayüzü değişirse eklenti güncellenmesi gerekebilir.
- Sadece kendi hesabınızda çalışır.

## 📁 Proje Yapısı

```
├── manifest.json      # Chrome Extension manifest (v3)
├── background.js      # Service worker — pencere yönetimi
├── content.js         # Ana mantık — UI + silme döngüsü
├── popup.html         # Eklenti popup arayüzü
├── popup.js           # Popup etkileşim scripti
├── icons/             # Eklenti ikonları
└── README.md
```

## 🛠️ Geliştirici

**Ünsal GEL** — [GitHub](https://github.com/unsalgel)
