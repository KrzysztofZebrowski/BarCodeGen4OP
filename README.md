# BarCodeGen4OP 📦⚡

Nowoczesny, szybki generator i skaner kodów kreskowych oraz kodów QR, zoptymalizowany pod kątem obsługi przesyłek (np. **Orlen Paczka**, etykiety kurierskie) oraz drukarek termicznych **Zebra (203 DPI)**.

---

## 🚀 Nowości i kluczowe funkcje

1. **⚡ Dynamiczne skanowanie z kamery na żywo**:
   - Ciągła, błyskawiczna detekcja kodów QR i kodów kreskowych (1D: EAN-13, Code 128, EAN-8, UPC itp.).
   - Sprzętowa akceleracja (`BarcodeDetector API` w Chrome/Android + płynny fallback dla Safari/Firefox).
   - Animowany celownik laserowy z sygnalizacją trafienia.
   - Obsługa latarki (flesza) oraz przełączania aparatów (przód/tył).
   - Możliwość odczytu kodów ze zdjęć/galerii pliku graficznego.

2. **📊 Natychmiastowe wyświetlanie kodu kreskowego**:
   - Od razu po wykryciu kodu QR/kreskowego aplikacja generuje i wyświetla czytelny kod kreskowy.
   - Inteligentne wykrywanie formatu:
     - Automatyczne EAN-13 dla 12 lub 13 cyfr (z kalkulacją cyfry kontrolnej).
     - Automatyczny fallback do Code 128 dla kodów alfanumerycznych (np. `OP1234567890PL`).
   - Wektorowy podgląd SVG na ekranie telefonu lub komputera.

3. **⏱️ Historia ostatnich 10 kodów w Local Storage**:
   - Ostatnie 10 kodów zapisywanych trwale w pamięci przeglądarki (`localStorage`).
   - Kliknięcie w dowolny element natychmiast ładuje i wyświetla kod.
   - Szybkie kopiowanie numeru jednym kliknięciem.
   - Opcja usuwania pojedynczych kodów oraz czyszczenia całej historii.

4. **🖨️ Obsługa drukarek Zebra (203 DPI)**:
   - Dedykowane generowanie etykiet w natywnej rozdzielczości 203 DPI (standard drukarek Zebra).
   - Przycisk **„Drukuj / Udostępnij Zebrze”** korzystający z `Web Share API` (bezpośrednie wysyłanie pliku PNG do aplikacji Zebra Print Station lub drukarek Bluetooth).
   - Pobieranie etykiety w wysokiej rozdzielczości PNG.
   - Szablon wydruku termicznego w CSS (`@media print`).

5. **✨ Dźwięk, wibracje i motywy**:
   - Dźwięk potwierdzenia skanu (syntetyzator Web Audio API – autentyczny dźwięk terminala POS).
   - Sprzężenie haptyczne (wibracja telefonu po poprawnym odczycie).
   - Tryb ciemny / jasny (Dark Mode).

---

## 📁 Struktura plików

```
BarCodeGen4OP/
├── index.html       # Główny interfejs aplikacji
├── styles.css       # Style, ciemny motyw, animacje celownika, @media print
├── app.js           # Silnik kamery, generator JsBarcode, historia LocalStorage
├── vendor/          # Lokalne biblioteki offline (zero zależności od internetu)
│   ├── html5-qrcode.min.js
│   └── jsbarcode.all.min.js
└── README.md
```

---

## 💻 Jak uruchomić?

### Sposób 1: Bezpośrednio w przeglądarce
Kliknij dwukrotnie w plik `index.html`.
> *Wskazówka:* Niektóre przeglądarki (np. Chrome) ze względów bezpieczeństwa zezwalają na dostęp do fizycznej kamery (`getUserMedia`) tylko przez bezpieczne połączenia (`https://` lub `localhost`). Do wpisywania ręcznego, generowania etykiet i skanowania zdjęć z dysku wystarczy samo otwarcie `index.html`.

### Sposób 2: Na telefonie lub lokalnie przez serwer (Zalecane dla kamery)
Aby korzystać ze skanera kamery na telefonie w sieci lokalnej:
```bash
# W folderze projektu:
npx serve .
# lub
python -m http.server 8080
```
Otwórz wyświetlony adres w przeglądarce telefonu.