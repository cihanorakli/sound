# Web Uyumlu Sürüm

Bu klasör GitHub Pages gibi statik bir ortamda çalışacak şekilde ayarlanmış kopyadır.

- Giriş: `index.html` → `ses.html` sayfasına yönlendirir.
- Kamera: HTTPS altında çalışır (GitHub Pages uygundur). Dosyayı `file://` ile açarsanız kamera izinleri kısıtlı olabilir.
- Sistem Sesi Köprüsü: Tarayıcıdan yerel Python köprüsüne erişim güvenlik nedeniyle GitHub Pages'da çalışmaz; mod otomatik olarak “Sayfa Sesi” olur.
- Müzik: `music/` klasöründeki MP3'ler sayfayla birlikte sunulur.

Yerelde test için:

```bash
cd web-uyumlu-hal
python3 -m http.server
# Sonra: http://127.0.0.1:8000/
```
