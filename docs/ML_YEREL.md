# Yerel ML öngörü sistemi

Öncelik **yön**, ardından **gelecek oynaklık** öngörüsüdür. Fiyat projeksiyonu,
coin grafiğindeki aynı panelde isteğe bağlı açılır. Tüm çıktılar **deneyseldir**;
doğruluk, kâr veya temel modelden üstünlük garantisi verilmez. 1M kapalıdır.

## Veri, özellikler ve algoritmalar

BTC, ETH, SOL, BNB, XRP, ADA, DOGE ve LINK için Kasım 2025–Ekim 2026 dönemindeki
96 CSV / 4.204.800 bir dakikalık mum kullanıldı. UTC zamanları, süreklilik, fiyat /
hacim alanları ve dosya SHA-256 değerleri doğrulandı; yerel Parquet bölümleri
yeniden kullanılır. Kaynak arşivlerinin bağımsız doğrulaması mevcut değildir.
CSV, Parquet, ağırlıklar ve çalışma verileri Git'e eklenmez veya silinmez.

52 geçmişe dayalı özellik; çok ölçekli getiriler, gerçekleşen oynaklık, normalize
momentum, göreli hacim/işlem yoğunluğu, taker-alış dengesizliği, mum yapısı, trend
ve tam zaman hizalı bir dakika gecikmeli BTC/ETH getirilerinden oluşur. Ölçekleme
yalnızca eğitim verisinde öğrenilir. Grupların katkısı çıkarma deneyleriyle ölçüldü.
Oynaklık özelliklerinin çıkarılması, sabit referans modelin ortalama oynaklık
MAE'sini %17,83 kötüleştirdi; çok sayıda ek gösterge yönü düzenli iyileştirmedi.

Yön: Logistic Regression, Random Forest, LightGBM, XGBoost ve LSTM. Asıl hedef,
ufka ve geçmiş oynaklığa göre aşağı / nötr / yukarı sınıflarıdır. İki sınıflı
kontroller sıfır olmayan harekete koşulludur; canlı üç sınıflı olasılık yerine
kullanılmaz. Olasılıklar ayrı, kronolojik 14 günlük bölümde temperature scaling
ile kalibre edildi. Log loss, Brier, dengeli doğruluk, MCC ve ECE kaydedildi.

Oynaklık hedefi, sonraki 1/15/60 dakikanın **kareli log getirileri toplamının
kareköküdür**; yıllıklandırılmaz. %0,4 oynaklık bir yön, fiyat veya kayıp olasılığı
değildir. Rolling/EWMA, HAR-RV/Ridge, GARCH, LightGBM ve XGBoost karşılaştırıldı.
MAE, QLIKE, ölçülen aralık kapsaması ve rejim kararlılığı raporlandı. GARCH için
doğrulanmış canlı durum/ağırlık artefaktı bulunmadığından yerel seçimde kullanılmaz.

## Seçim ve gerçek sonuçlar

Üç kronolojik geliştirme katında hedef sınırları arındırıldı ve bir dakikalık
ambargo uygulandı. Önceki fiyat çalışmasında hiçbir model istatistiksel kabul
eşiklerini geçemedi. Faz 2'de 768 sabit deney tamamlandı; yalnızca beş aday eski
geliştirme kapılarını geçti ve hiçbiri gelecek dönem doğrulaması almadı.
Bu bulgular [ayrıntılı araştırmada](OBJECTIVE_FINDINGS.md) aynen korunur.

**Yeni yerel kullanım politikası**, mevcut ve bütünlüğü doğrulanmış modelleri
geliştirme performansına göre sıralar: yön için kalibre log loss → Brier,
oynaklık için QLIKE → MAE, fiyat için getiri RMSE. 12 ondalığa yuvarlanan ölçütler
eşitse sabit sadelik sırası (doğrusal/HAR, RF, histogram GB, LightGBM, XGBoost,
LSTM), sonra aday kimliği kullanılır. Özellik çıkarma deneylerindeki eğitilmiş
modeller de adaydır. Son holdout sonuçları **seçim için kullanılmaz**.

%1 üstünlük, anlamlılık, tüm katları kazanma ve gelecekteki dönem doğrulaması,
yerel **deneysel gösterim koşulu değildir**. Bu değişiklik modelleri daha doğru
yapmaz. 24 yön, 24 oynaklık ve 24 fiyat artefaktı kullanılabilir durumdadır.
Eksik/bozuk bir ağırlık atlanır; başka geçerli eğitilmiş aday yoksa sayı gösterilmez.

Aşağıdaki tablo mevcut yerel seçimleri özetler. Yön sütunu kalibre log loss'u;
oynaklık sütunu MAE'yi ve QLIKE seçimine rağmen MAE bakımından baz modele göre
değişimi gösterir. **Negatif iyileşme, baz modelden kötü sonuçtur.** Fiyat oranı
geliştirme RMSE / değişim-yok baz RMSE'dir; 1'in üstü daha kötüdür. Aday kimlikleri,
QLIKE, ECE, MCC, kapsama, artefakt hash'leri ve tam ölçüler
[yerel seçim kanıtında](../ml/reports/local-selection.json) bulunur.

| Coin / ufuk | Yön adayı · log loss | Oynaklık adayı · MAE · baz iyileşmesi | Fiyat modeli · RMSE/baz |
|---|---|---|---|
| BTC / 1m | lightgbm_regularized · 1.0404 | rich-rv-volatility · 0.000417 · -49.75% | xgboost · 1.00067 |
| BTC / 15m | ablate-activity · 1.0663 | lightgbm_rv · 0.000566 · +4.00% | xgboost · 1.00072 |
| BTC / 1h | logistic_36k · 1.0655 | lightgbm_rv · 0.000982 · +9.94% | ridge · 1.00113 |
| ETH / 1m | lightgbm_regularized · 1.0588 | lightgbm_rv · 0.000370 · -1.49% | random_forest · 1.00081 |
| ETH / 15m | ablate-multiscale · 1.0536 | rich-rv-multiscale · 0.000797 · +3.29% | xgboost · 1.00019 |
| ETH / 1h | ablate-multiscale · 1.0482 | lightgbm_rv · 0.001358 · +11.60% | lstm · 1.00156 |
| SOL / 1m | ablate-multiscale · 1.0774 | rich-rv-volatility · 0.000590 · -37.52% | lightgbm · 0.99870 |
| SOL / 15m | ablate-cross_asset · 1.0645 | rich-rv-structure · 0.000831 · +0.33% | lightgbm · 1.00111 |
| SOL / 1h | forest · 1.0664 | rich-rv-activity · 0.001414 · +9.32% | hist_gradient_boosting · 1.00131 |
| BNB / 1m | ablate-cross_asset · 1.0667 | xgboost_rv · 0.000278 · -2.74% | ridge · 0.99871 |
| BNB / 15m | ablate-multiscale · 1.0714 | rich-rv-all · 0.000511 · +3.83% | xgboost · 0.99938 |
| BNB / 1h | ablate-structure · 1.0716 | lightgbm_rv · 0.000863 · +9.25% | random_forest · 0.99956 |
| XRP / 1m | ablate-structure · 1.0693 | xgboost_rv · 0.000427 · -3.67% | xgboost · 1.00099 |
| XRP / 15m | ablate-multiscale · 1.0680 | rich-rv-structure · 0.000944 · -20.72% | lstm · 1.00141 |
| XRP / 1h | xgboost · 1.0711 | rich-rv-trend · 0.001365 · +7.46% | lstm · 1.00353 |
| ADA / 1m | ablate-activity · 1.0853 | lightgbm_rv · 0.000837 · -31.89% | lightgbm · 0.99818 |
| ADA / 15m | logistic_36k · 1.0642 | rich-rv-cross_asset · 0.001017 · +5.64% | xgboost · 1.00069 |
| ADA / 1h | ablate-clock · 1.0663 | rich-rv-activity · 0.001686 · +9.62% | ridge · 1.00224 |
| DOGE / 1m | ablate-multiscale · 1.0784 | har · 0.000436 · -2.52% | ridge · 0.99604 |
| DOGE / 15m | ablate-multiscale · 1.0667 | rich-rv-multiscale · 0.000812 · +2.34% | lightgbm · 1.00225 |
| DOGE / 1h | ablate-multiscale · 1.0686 | rich-rv-all · 0.001451 · +9.33% | lightgbm · 1.00152 |
| LINK / 1m | ablate-structure · 1.0788 | har_regularized · 0.000541 · -19.63% | lightgbm · 1.00424 |
| LINK / 15m | ablate-structure · 1.0758 | rich-rv-multiscale · 0.000832 · +6.87% | hist_gradient_boosting · 1.00090 |
| LINK / 1h | xgboost · 1.0784 | xgboost_rv · 0.001495 · +7.40% | lstm · 1.00348 |

## Sınırlar ve çalıştırma

Dakikalık hareketlerin %96,2–98,94'ü varsayılan 24bp gidiş-dönüş maliyetinin
içindedir. Yön kazanımları küçüktür; eski iki uygun ETH adayı sabit %60 karar
kuralında hiç işlem açmadı. Kâr kanıtı yoktur. Oynaklık daha kalıcıdır; bir dakikada
sekiz coin'in seçilen oynaklık modeli de MAE bakımından bazından kötüdür. QLIKE ve
MAE farklı hedefleri ödüllendirir; QLIKE ile seçilen model en düşük MAE modeli
olmayabilir. Sıfır getiriler nedeniyle bazı kalibrasyon aralıkları çok geniş ve
pratikte az bilgilendiricidir. Aralıkların hedefi %90 olsa da gerçekleşen kapsama
farklıdır; bu aralıklar fiyat bandı değildir.

Geliştirme seçimi iyimserlik taşır; rejim değişimi, düşük etkin örnek sayısı,
örneklenmiş değerlendirme saatleri ve eski ağırlıklar genellemeyi sınırlar. Yön /
oynaklık ağırlıkları son geliştirme katındandır; fiyat artefaktları sonraki tam
geçmiş yeniden eğitimini kullanabilir. Kayıtlı geçmiş puanlar bugünkü piyasa
performansı değildir. Aralık ve olasılıklar garanti sayılmaz.

```powershell
.\dev.ps1 -Install   # ilk kurulum ve başlatma
.\dev.ps1            # sonraki kullanım
.\dev.ps1 -Check     # bağımlılık/ortam kontrolü
```

http://localhost:3000 adresini açın. Tek ML işçisi tamamlanmış Binance mumlarıyla,
aynı dondurulmuş ağırlıkları kullanarak günceller; istek başına eğitim yapmaz.
Süre dolunca sayılar kaldırılır. İnternet yoksa güncel öngörü üretilemez; veri
uydurulmaz. Modeller varsa eski veri kümesinin yokluğu çıkarımı engellemez, ancak
tarihsel risk kategorisi gösterilemeyebilir. Ctrl+C tüm yerel süreçleri kapatır.
MongoDB isteğe bağlıdır; Railway/Docker gerekmez. [Windows yönergesi](LOCAL_WINDOWS.md)
ve [doğrulama sonuçları](LOCAL_VERIFICATION.md) ek ayrıntıları içerir.
