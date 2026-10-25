# Erenos Medikal Mobil

Erenos Medikal'in şirket içi satış takip uygulaması. Telefonda ana ekrana eklenerek uygulama gibi kullanılır (PWA).

- **Yaklaşık Maliyet**, **Doğrudan Temin** ve **Genel Satış** kayıtları, çok kalemli ürün listesi, dosya/ihale no
- Doğrudan teminde hastane aranana kadar **2 saatte bir bildirim** (hafta içi 09:00–18:00)
- Onay/ret, kalem bazında onaylanan miktar, **Reddedilenler** fiyat arşivi
- **Sevkiyat**: parça parça sevk, teslim takibi; ana ekranda toplam / sevkte / teslim / kalan
- Kullanıcıları yönetici ekler (kullanıcı adı + şifre), dışarıdan kayıt olunamaz

Teknoloji: Next.js 15 · Supabase (veritabanı + giriş) · Vercel (yayın) · Web Push

---

## Kurulum

### 1. Supabase

1. [supabase.com](https://supabase.com) üzerinde ücretsiz bir proje açın (bölge: Frankfurt).
2. **SQL Editor**'de `supabase/migrations/20261020000000_init.sql` dosyasının tamamını çalıştırın.
3. **Authentication > Sign In / Providers**:
   - *Allow new users to sign up* → **kapalı**
   - *Email* sağlayıcısı açık kalsın, *Confirm email* → **kapalı**
4. **Project Settings > API**'den şu üç değeri not edin: Project URL, `anon` key, `service_role` key.

### 2. Bilgisayarda çalıştırma

```bash
npm install
cp .env.example .env.local      # değerleri doldurun
npm run vapid                    # çıkan iki satırı .env.local'a ekleyin
npm run create-admin -- bulent GucluBirSifre "Bülent Tayfur"
npm run dev                      # http://localhost:3000/mobiluygulama
```

`CRON_SECRET` için uzun rastgele bir metin yazın (ör. `openssl rand -hex 32`).

### 3. Vercel'de yayın

1. Kodu GitHub'a gönderin, Vercel'de **Add New > Project** ile depoyu içe aktarın.
2. **Environment Variables** bölümüne `.env.local` içindeki tüm değişkenleri ekleyin.
3. Yayınlayın. Adres: `https://<proje>.vercel.app/mobiluygulama`

**Kendi alan adınızın altında (`alanadiniz.com/mobiluygulama`):**

- Siteniz de Vercel'deyse: ana sitenin `vercel.json` dosyasına yönlendirme ekleyin:
  ```json
  { "rewrites": [{ "source": "/mobiluygulama/:path*", "destination": "https://<proje>.vercel.app/mobiluygulama/:path*" }] }
  ```
- Başka bir sunucudaysa (Nginx/Apache/Cloudflare) aynı yolu `<proje>.vercel.app`'e ters vekil (reverse proxy) ile yönlendirin.

Alt yolu değiştirmek isterseniz `NEXT_PUBLIC_BASE_PATH` değişkenini güncelleyin.

### 4. Hatırlatma bildirimleri (zamanlanmış iş)

Vercel'in ücretsiz planı günde tek cron çalıştırdığı için zamanlama Supabase'de yapılır:

1. Supabase **Database > Extensions**'tan `pg_cron` ve `pg_net`'i açın.
2. `supabase/cron.sql` içindeki `<SITE>` ve `<CRON_SECRET>` değerlerini değiştirip SQL Editor'de çalıştırın.

Elle denemek için:
```bash
curl -H "Authorization: Bearer <CRON_SECRET>" "https://<site>/mobiluygulama/api/cron/reminders?force=1"
```

---

## Telefona kurulum (kullanıcılar için)

**iPhone (iOS 16.4 ve üzeri):** Safari'de adresi açın → alttaki **Paylaş** → **Ana Ekrana Ekle**. Uygulamayı ana ekrandaki ikondan açın, giriş yapın, **Ayarlar > Bildirimleri aç**'a dokunun.

**Android:** Chrome'da adresi açın → menü → **Uygulamayı yükle** (veya *Ana ekrana ekle*). Giriş yapıp **Ayarlar > Bildirimleri aç**.

> Bildirimler her cihazda ayrı ayrı açılmalıdır. **Deneme gönder** düğmesiyle kontrol edebilirsiniz.

---

## İş akışı

| Adım | Ne olur |
|---|---|
| Doğrudan temin girilir | Herkese bildirim; durum **Arama bekliyor** |
| Hastane aranmadıkça | Mesai içinde 2 saatte bir herkese hatırlatma |
| **Arandı** + görüşme notu | Hatırlatma durur (*Tekrar aranacak* işaretlenirse devam eder) |
| **Sonuç gir → Reddedildi** | Kayıt **Reddedilenler**'e taşınır, fiyatlar saklanır |
| **Sonuç gir → Onaylandı** | Onaylanan kalemler seçilir, miktarlar düzeltilir; kaydın toplam adedi ve tutarı artık onaylanan miktardır (teklif adedi gösterilmez). Onaylanmayan kalemler Reddedilenler'de görünür |
| **Sevkiyata aktar** | Hastanenin istediği miktar Sevkiyat'a düşer (kalan sonra aktarılabilir) |
| **Teslim edildi** | Ana ekranda teslim/kalan güncellenir |
| **Sonucu düzenle** | Sonuçlanmış doğrudan temin yeniden düzenlenebilir; onaylanan miktar sevkiyata aktarılanın altına inemez, sevkiyatı olan kayıt reddedilemez |
| Yaklaşık maliyet | Yalnızca takip amaçlı: *Onaylandı* veya *Reddedildi* olarak işaretlenir (gerekirse geri alınır) |
| Ana ekran | **Gündemdekiler** sekmesinde yalnızca sonuçlanmamış doğrudan teminler görünür; yaklaşık maliyetler Gündem'e girmez, Yaklaşık Maliyet sekmesinin **Bekleyenler** bölümünde onaylanır veya reddedilir; sonuçlananlar kendi tipinin sekmesinde (Doğrudan Temin / Yaklaşık Maliyet) altında **Onaylananlar** ve **Reddedilenler** sekmelerinde kalır. Üst şerit sırası: Gündemdekiler, Doğrudan Temin, Yaklaşık Maliyet, Arama bekleyen, Reddedilen (fiyat arşivi). Alt bantta Reddedilen yerine **Görüşmeler** var |
| Genel Satış | + menüsünden eklenir (sipariş tarihi, varsa dosya/ihale no, müşteri adı, varsa ilgili kişi/telefon/dahili, sipariş geçilen ürünler, isteğe bağlı not). Aranmaz, hatırlatma gitmez; onaylanana kadar **Gündemdekiler**'de *Onay bekliyor* olarak durur. **Onayla** sayfasında reddetme yoktur, kalemler onaylı seçili gelir. Onaylanınca **Genel Satış** sekmesine geçer; orada sevkiyata aktarılır, sonucu düzenlenebilir, kalan miktar görünür. Tamamı teslim edilenler listenin en altında (Doğrudan Temin Onaylananlar listesinde de aynı) |
| Yeni kayıt | Kaydedince liste ekranına dönülür: doğrudan temin Gündem'e, yaklaşık maliyet kendi sekmesinin Bekleyenler bölümüne. Telefon geçerli bir Türkiye numarası olmalıdır (cep, sabit hat, 0850 veya 444) ve `0xxx xxx xx xx` biçiminde saklanır. İsteğe bağlı **Dahili** alanı yalnızca bilgi olarak gösterilir; arama düğmesi sadece numarayı arar |
| Kart toplamı | Listede her kartta tek toplam görünür; farklı para birimleri TCMB günlük döviz satış kuruyla TL'ye çevrilip ≈ ile yazılır (kur alınamazsa birimlere göre ayrı). Kayıt detayının üstündeki toplam da aynı şekilde tek rakamdır; kalem satırları kendi para biriminde kalır |
| Görüşmeler | Ziyaret notları: tarih (gün adıyla), hastane, servis, not. Herkes görür, en yeni tarih üstte, aranabilir, düzeltilebilir (kim düzelttiği yazılır). Yeni not herkese bildirim gönderir |
| Sevkiyat | **Bekleyen Sevkiyatlar** / **Tamamlanan Sevkiyatlar** sekmeleri; tüm sevkiyatlar tek listede, her kartta türü yazar (gidecek yeşil, gelecek turuncu). Gidecek: doğrudan teminden aktarılan (sevk tarihli, *Teslim edildi*) ya da sağ üstteki **+ Ekle** ile elle eklenen (hastane/alıcı, ürün detayı, isteğe bağlı miktar, sevk tarihi). Gelecek: **+ Ekle** ile eklenen (tedarikçi, ürün detayı, isteğe bağlı miktar, beklenen tarih, *Teslim alındı*). Elle eklenenler `manual_shipments` tablosunda (`direction`: gelecek/gidecek), bekledikleri sürece düzeltilebilir (bildirim gitmez). Bekleyenlerde en yakın tarih üstte, tamamlananlarda en son teslim üstte |
| Kullanıcılar | Yönetici ad, kullanıcı adı ve şifreyi değiştirebilir, başka kullanıcıyı aynı yetkilerle yönetici yapabilir veya pasife alabilir |

Bildirimler, işlemi yapan kişi hariç herkese gider (`src/app/(app)/actions.ts` içindeki `notify`). Arama hatırlatmaları herkese gider.

## Klasör yapısı

```
src/app/login/                Giriş
src/app/(app)/                Ana liste (Reddedilen sekmesi dahil), yeni kayıt, kayıt detayı, sevkiyat, görüşmeler, ayarlar
src/app/(app)/actions.ts      Tüm kayıt işlemleri (server actions)
src/app/api/push/             Bildirim aboneliği ve deneme bildirimi
src/app/api/cron/reminders/   2 saatlik arama hatırlatması
src/lib/                      Supabase istemcileri, push, mesai saati, biçimlendirme
public/sw.js                  Service worker (bildirim + çevrimdışı sayfa)
supabase/migrations/          Veritabanı şeması, RLS ve iş akışı fonksiyonları
supabase/cron.sql             Zamanlanmış hatırlatma işi
```

## Sonraki adımlar

- İhale Siparişi tipi (`record_type` enum'unda yer ayrıldı)
- Rollere göre yetki ayrımı (şimdilik herkes her işi yapabilir, kullanıcı yönetimi yöneticide)
