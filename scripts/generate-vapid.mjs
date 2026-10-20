// Web Push için VAPID anahtar çifti üretir. Çıktıyı .env.local ve Vercel ortam değişkenlerine ekleyin.
import webpush from "web-push";

const { publicKey, privateKey } = webpush.generateVAPIDKeys();
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
