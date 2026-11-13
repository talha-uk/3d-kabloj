# Düzenek

GLB modelleri yerleştirip port ve kablo şemasını tarayıcıda düzenlemek için yerel bir uygulama.

## Çalıştırma

```bash
npm install
npm run dev
```

Adres: [http://127.0.0.1:5173](http://127.0.0.1:5173)

## Kullanım

1. GLB model yükle.
2. İncelemede yüzeye tıklayıp port türünü seç.
3. Sahneye koy. Taşıma okları ve döndürme parçayı oynatır. W A S D kameranın baktığı yöne gider. E yukarı, Q aşağı.
4. İki port arasında kablo yerleştir.
5. Seçili kabloya orta tuşla kıvrım noktası ekle.

Yerleşim ve şema aynı parçaları kullanır. Şemada dizilim ayrıdır. Izgara çizgisine yaklaşınca hizalama yumuşaktır. Dönüş 15 derecede kısa süre tutulur.

Kayıt bu makinede `proje/duzenek.json` ve `proje/modeller/` altındadır. Bu klasör depoya girmez.

## Sınama

```bash
npm test
```
