(function () {
  'use strict';

  const CONFIG = {
    STORAGE_KEY: 'barcodegen4op_history_v2',
    SETTINGS_KEY: 'barcodegen4op_settings_v2',
    MAX_HISTORY: 10,
    ZEBRA_DPI: 203,
    DEFAULT_LABEL_WIDTH_INCH: 4,
    DEFAULT_LABEL_HEIGHT_INCH: 6,
    SCAN_COOLDOWN_MS: 1600
  };

  const state = {
    currentCode: '',
    selectedFormat: 'AUTO',
    detectedFormat: '',
    generatedBlob: null,
    isScannerRunning: false,
    html5QrCode: null,
    cameras: [],
    currentCameraIndex: 0,
    isTorchOn: false,
    soundEnabled: true,
    vibrateEnabled: true,
    lastScannedCode: null,
    lastScanTime: 0,
    audioCtx: null
  };

  const elements = {
    themeToggle: document.getElementById('btn-theme-toggle'),
    soundToggle: document.getElementById('btn-sound-toggle'),
    vibrateToggle: document.getElementById('btn-vibrate-toggle'),

    scannerContainer: document.getElementById('scanner-container'),
    scannerViewport: document.getElementById('scanner-viewport'),
    scannerTargetBox: document.getElementById('scanner-target-box'),
    scannerStatusText: document.getElementById('scanner-status-text'),
    scannerStatusDot: document.getElementById('scanner-status-dot'),
    btnStartCamera: document.getElementById('btn-start-camera'),
    btnCloseCamera: document.getElementById('btn-close-camera'),
    btnToggleTorch: document.getElementById('btn-toggle-torch'),
    btnSwitchCamera: document.getElementById('btn-switch-camera'),
    fileScanInput: document.getElementById('file-scan-input'),
    btnTriggerFile: document.getElementById('btn-trigger-file'),

    mainInput: document.getElementById('main-input'),
    formatButtons: document.querySelectorAll('.btn-format'),
    btnClearInput: document.getElementById('btn-clear-input'),
    btnPasteInput: document.getElementById('btn-paste-input'),
    inputStatusMsg: document.getElementById('input-status-msg'),
    checksumInfo: document.getElementById('checksum-info'),
    sampleChips: document.querySelectorAll('.sample-chip'),

    resultCard: document.getElementById('result-card'),
    barcodeSvg: document.getElementById('barcode-svg'),
    badgeFormat: document.getElementById('badge-format'),
    metaCodeVal: document.getElementById('meta-code-val'),
    btnShareZebra: document.getElementById('btn-share-zebra'),
    btnDownloadPng: document.getElementById('btn-download-png'),
    btnCopyCode: document.getElementById('btn-copy-code'),
    btnPrintDirect: document.getElementById('btn-print-direct'),
    zebraCanvas: document.getElementById('zebra-canvas'),
    tempCanvas: document.getElementById('temp-barcode-canvas'),

    historyList: document.getElementById('history-list'),
    historyCountBadge: document.getElementById('history-count-badge'),
    btnClearHistory: document.getElementById('btn-clear-history'),
    historyEmptyState: document.getElementById('history-empty-state'),

    toastContainer: document.getElementById('toast-container')
  };

  function initAudioContext() {
    if (!state.audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        state.audioCtx = new AudioContextClass();
      }
    }
    if (state.audioCtx && state.audioCtx.state === 'suspended') {
      state.audioCtx.resume();
    }
  }

  function playScanBeep() {
    if (!state.soundEnabled) return;
    try {
      initAudioContext();
      if (!state.audioCtx) return;

      const osc = state.audioCtx.createOscillator();
      const gain = state.audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1200, state.audioCtx.currentTime);
      osc.frequency.setValueAtTime(1760, state.audioCtx.currentTime + 0.04);

      gain.gain.setValueAtTime(0.2, state.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, state.audioCtx.currentTime + 0.12);

      osc.connect(gain);
      gain.connect(state.audioCtx.destination);

      osc.start();
      osc.stop(state.audioCtx.currentTime + 0.12);
    } catch (err) {
      console.warn('Audio playback error:', err);
    }
  }

  function triggerHaptic() {
    if (!state.vibrateEnabled) return;
    try {
      if ('vibrate' in navigator) {
        navigator.vibrate([40]);
      }
    } catch (e) {}
  }

  function showToast(message, type = 'info', duration = 3000) {
    if (!elements.toastContainer) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'warning') icon = '⚠️';
    if (type === 'danger')  icon = '❌';

    toast.innerHTML = `<span>${icon}</span><span>${escapeHtml(message)}</span>`;
    elements.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.2s ease-out';
      setTimeout(() => toast.remove(), 200);
    }, duration);
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function calculateEan13Checksum(digits12) {
    if (!/^\d{12}$/.test(digits12)) return null;
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      const digit = parseInt(digits12[i], 10);
      sum += (i % 2 === 0) ? digit : digit * 3;
    }
    const remainder = sum % 10;
    return (remainder === 0) ? 0 : 10 - remainder;
  }

  function isValidEan13(digits13) {
    if (!/^\d{13}$/.test(digits13)) return false;
    const expected = calculateEan13Checksum(digits13.slice(0, 12));
    return expected === parseInt(digits13[12], 10);
  }

  function calculateEan8Checksum(digits7) {
    if (!/^\d{7}$/.test(digits7)) return null;
    let sum = 0;
    for (let i = 0; i < 7; i++) {
      const digit = parseInt(digits7[i], 10);
      sum += (i % 2 === 0) ? digit * 3 : digit;
    }
    const remainder = sum % 10;
    return (remainder === 0) ? 0 : 10 - remainder;
  }

  function isValidEan8(digits8) {
    if (!/^\d{8}$/.test(digits8)) return false;
    const expected = calculateEan8Checksum(digits8.slice(0, 7));
    return expected === parseInt(digits8[7], 10);
  }

  function cleanExtractedCode(rawText) {
    if (!rawText) return '';
    const text = String(rawText).trim();

    try {
      if (text.startsWith('http://') || text.startsWith('https://')) {
        const url = new URL(text);
        for (const param of ['p', 'parcel', 'code', 'ean', 'nr', 'pack', 't']) {
          const val = url.searchParams.get(param);
          if (val && val.length >= 8) return val;
        }
        const segments = url.pathname.split('/').filter(Boolean);
        if (segments.length > 0) {
          const last = segments[segments.length - 1];
          if (/^[a-zA-Z0-9_-]{6,30}$/.test(last)) return last;
        }
      }
    } catch (e) {}

    const eanMatch = text.match(/\b\d{13}\b/);
    if (eanMatch) {
      return eanMatch[0];
    }

    return text;
  }

  function getHistory() {
    try {
      const data = localStorage.getItem(CONFIG.STORAGE_KEY);
      if (!data) return [];
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.warn('Error reading history:', e);
      return [];
    }
  }

  function saveHistory(list) {
    try {
      const trimmed = list.slice(0, CONFIG.MAX_HISTORY);
      localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(trimmed));
      renderHistory();
    } catch (e) {
      console.warn('Error saving history:', e);
    }
  }

  function addToHistory(code, format = 'AUTO', source = 'manual') {
    if (!code || !code.trim()) return;
    const cleanCode = code.trim();
    let history = getHistory();

    history = history.filter(item => item.code !== cleanCode);

    const newItem = {
      id: Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      code: cleanCode,
      format: format,
      source: source,
      timestamp: Date.now()
    };

    history.unshift(newItem);
    saveHistory(history);
  }

  function removeFromHistory(id) {
    let history = getHistory();
    history = history.filter(item => item.id !== id);
    saveHistory(history);
    showToast('Usunięto kod z historii', 'info', 2000);
  }

  function clearAllHistory() {
    if (confirm('Czy na pewno chcesz wyczyścić całą historię ostatnich kodów?')) {
      localStorage.removeItem(CONFIG.STORAGE_KEY);
      renderHistory();
      showToast('Wyczyszczono historię kodów', 'info');
    }
  }

  function formatRelativeTime(timestamp) {
    if (!timestamp) return '';
    const diff = Date.now() - timestamp;
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);

    if (mins < 1) return 'Przed chwilą';
    if (mins < 60) return `${mins} min temu`;
    if (hours < 24) return `${hours} godz. temu`;
    if (days === 1) return 'Wczoraj';
    
    const d = new Date(timestamp);
    return `${d.toLocaleDateString('pl-PL')} ${d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}`;
  }

  function renderHistory() {
    const history = getHistory();
    const count = history.length;

    if (elements.historyCountBadge) {
      elements.historyCountBadge.textContent = `${count}/${CONFIG.MAX_HISTORY}`;
    }

    if (!elements.historyList) return;
    elements.historyList.innerHTML = '';

    if (count === 0) {
      if (elements.historyEmptyState) elements.historyEmptyState.style.display = 'flex';
      if (elements.btnClearHistory) elements.btnClearHistory.style.display = 'none';
      return;
    }

    if (elements.historyEmptyState) elements.historyEmptyState.style.display = 'none';
    if (elements.btnClearHistory) elements.btnClearHistory.style.display = 'inline-flex';

    history.forEach(item => {
      const li = document.createElement('li');
      li.className = 'history-item';
      li.setAttribute('data-code', item.code);

      const sourceIcon = item.source === 'camera' ? '📷' : (item.source === 'file' ? '🖼️' : '⌨️');
      const timeStr = formatRelativeTime(item.timestamp);

      li.innerHTML = `
        <div class="history-item-left" title="Kliknij, aby załadować kod">
          <div class="history-code-val">${escapeHtml(item.code)}</div>
          <div class="history-meta">
            <span class="badge badge-primary">${escapeHtml(item.format || 'KOD')}</span>
            <span>${sourceIcon} ${escapeHtml(timeStr)}</span>
          </div>
        </div>
        <div class="history-item-actions">
          <button class="btn-history-action btn-load" title="Załaduj i wygeneruj" data-code="${escapeHtml(item.code)}">
            ⚡
          </button>
          <button class="btn-history-action btn-copy" title="Kopiuj do schowka" data-code="${escapeHtml(item.code)}">
            📋
          </button>
          <button class="btn-history-action btn-del" title="Usuń z historii" data-id="${escapeHtml(item.id)}">
            ✕
          </button>
        </div>
      `;

      li.querySelector('.history-item-left').addEventListener('click', () => {
        loadCodeIntoApp(item.code, item.format);
        showToast(`Załadowano kod: ${item.code}`, 'info', 2000);
      });

      li.querySelector('.btn-load').addEventListener('click', (e) => {
        e.stopPropagation();
        loadCodeIntoApp(item.code, item.format);
        showToast(`Załadowano kod: ${item.code}`, 'info', 2000);
      });

      li.querySelector('.btn-copy').addEventListener('click', (e) => {
        e.stopPropagation();
        copyToClipboard(item.code);
      });

      li.querySelector('.btn-del').addEventListener('click', (e) => {
        e.stopPropagation();
        removeFromHistory(item.id);
      });

      elements.historyList.appendChild(li);
    });
  }

  function loadCodeIntoApp(code, format = 'AUTO') {
    if (!code) return;
    elements.mainInput.value = code;
    if (format && format !== 'AUTO') {
      selectFormat(format);
    }
    processInputAndGenerate(false);
  }

  function copyToClipboard(text) {
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        showToast('Skopiowano kod do schowka', 'success', 2000);
      }).catch(() => fallbackCopy(text));
    } else {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      showToast('Skopiowano kod do schowka', 'success', 2000);
    } catch (e) {
      showToast('Nie udało się skopiować', 'warning');
    }
    document.body.removeChild(ta);
  }

  function determineFormat(code, selectedFormat) {
    if (selectedFormat && selectedFormat !== 'AUTO') {
      return selectedFormat;
    }

    const trimmed = code.trim();
    if (/^\d+$/.test(trimmed)) {
      if (trimmed.length === 12 || trimmed.length === 13) return 'EAN13';
      if (trimmed.length === 8) return 'EAN8';
      if (trimmed.length === 14) return 'ITF14';
    }
    return 'CODE128';
  }

  function generateBarcode(code, source = 'manual') {
    if (!code || !code.trim()) {
      elements.resultCard.classList.remove('active');
      elements.inputStatusMsg.textContent = 'Wpisz lub zeskanuj kod...';
      elements.inputStatusMsg.style.color = '';
      return false;
    }

    const clean = code.trim();
    let format = determineFormat(clean, state.selectedFormat);
    let codeToRender = clean;

    if (format === 'EAN13' && clean.length === 12) {
      const checkDigit = calculateEan13Checksum(clean);
      if (checkDigit !== null) {
        codeToRender = clean + checkDigit;
        elements.mainInput.value = codeToRender;
        showToast(`Obliczono cyfrę kontrolną: ${checkDigit} -> ${codeToRender}`, 'info', 2500);
      }
    }

    try {
      JsBarcode('#barcode-svg', codeToRender, {
        format: format,
        width: 2.6,
        height: 110,
        displayValue: true,
        fontSize: 18,
        textMargin: 6,
        font: 'monospace',
        fontOptions: 'bold',
        margin: 12,
        background: '#ffffff',
        lineColor: '#000000'
      });

      state.currentCode = codeToRender;
      state.detectedFormat = format;

      elements.badgeFormat.textContent = format;
      elements.metaCodeVal.textContent = codeToRender;
      elements.resultCard.classList.add('active');

      renderZebraLabelCanvas(codeToRender, format);

      addToHistory(codeToRender, format, source);

      elements.inputStatusMsg.textContent = `✅ Kod wygenerowany (${format})`;
      elements.inputStatusMsg.style.color = 'var(--success)';
      return true;

    } catch (err) {
      console.warn('JsBarcode rendering error with format ' + format + ':', err);

      if (format === 'EAN13') {
        try {
          JsBarcode('#barcode-svg', codeToRender, {
            format: 'CODE128',
            width: 2.4,
            height: 110,
            displayValue: true,
            fontSize: 18,
            textMargin: 6,
            font: 'monospace',
            fontOptions: 'bold',
            margin: 12,
            background: '#ffffff',
            lineColor: '#000000'
          });

          state.currentCode = codeToRender;
          state.detectedFormat = 'CODE128';
          elements.badgeFormat.textContent = 'CODE 128 (Fallback)';
          elements.metaCodeVal.textContent = codeToRender;
          elements.resultCard.classList.add('active');

          renderZebraLabelCanvas(codeToRender, 'CODE128');
          addToHistory(codeToRender, 'CODE128', source);

          elements.inputStatusMsg.textContent = '⚠️ Błąd EAN-13, użyto formatu CODE 128';
          elements.inputStatusMsg.style.color = 'var(--warning)';
          return true;
        } catch (innerErr) {
          console.error('CODE128 fallback also failed:', innerErr);
        }
      }

      elements.resultCard.classList.remove('active');
      elements.inputStatusMsg.textContent = `⚠️ Błąd formatu: ${err.message || 'Niepoprawne dane'}`;
      elements.inputStatusMsg.style.color = 'var(--danger)';
      return false;
    }
  }

  function renderZebraLabelCanvas(code, format) {
    const dpi = CONFIG.ZEBRA_DPI;
    const widthPx = CONFIG.DEFAULT_LABEL_WIDTH_INCH * dpi;
    const heightPx = CONFIG.DEFAULT_LABEL_HEIGHT_INCH * dpi;

    const canvas = elements.zebraCanvas;
    canvas.width = widthPx;
    canvas.height = heightPx;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, widthPx, heightPx);

    const tempCanvas = elements.tempCanvas;
    try {
      JsBarcode(tempCanvas, code, {
        format: format,
        width: 4.5,
        height: 220,
        displayValue: true,
        fontSize: 44,
        textMargin: 12,
        font: 'monospace',
        fontOptions: 'bold',
        margin: 10,
        background: '#ffffff',
        lineColor: '#000000'
      });

      ctx.fillStyle = '#000000';
      ctx.textAlign = 'center';
      ctx.font = 'bold 36px "Segoe UI", Arial, sans-serif';
      ctx.fillText('ORLEN PACZKA / ETYKIETA', widthPx / 2, 80);

      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(60, 110);
      ctx.lineTo(widthPx - 60, 110);
      ctx.stroke();

      ctx.font = 'bold 24px monospace';
      ctx.fillText(`TYP KODU: ${format}`, widthPx / 2, 160);

      const barcodeWidth = Math.min(widthPx - 100, tempCanvas.width * 1.2);
      const barcodeHeight = (barcodeWidth / tempCanvas.width) * tempCanvas.height;
      const posX = (widthPx - barcodeWidth) / 2;
      const posY = 220;

      ctx.drawImage(tempCanvas, posX, posY, barcodeWidth, barcodeHeight);

      const now = new Date();
      const dateStr = now.toLocaleDateString('pl-PL') + ' ' + now.toLocaleTimeString('pl-PL');
      ctx.font = '20px monospace';
      ctx.fillText(`Wygenerowano: ${dateStr}`, widthPx / 2, heightPx - 60);

      canvas.toBlob((blob) => {
        state.generatedBlob = blob;
      }, 'image/png');

    } catch (err) {
      console.warn('Error in Zebra canvas rendering:', err);
    }
  }

  async function shareZebraLabel() {
    if (!state.generatedBlob) {
      showToast('Najpierw wygeneruj etykietę', 'warning');
      return;
    }

    const fileName = `etykieta_${state.currentCode || 'barcode'}_203dpi.png`;
    const file = new File([state.generatedBlob], fileName, { type: 'image/png' });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          title: `Etykieta Zebra: ${state.currentCode}`,
          text: `Kod kreskowy ${state.detectedFormat}: ${state.currentCode}`,
          files: [file]
        });
        showToast('Wysłano etykietę do aplikacji drukowania', 'success');
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.warn('Share error:', err);
          showToast('Udostępnianie przerwane', 'info');
        }
      }
    } else {
      downloadZebraPng();
      showToast('Przeglądarka nie wspiera Web Share - pobrano plik PNG', 'info', 3500);
    }
  }

  function downloadZebraPng() {
    if (!elements.zebraCanvas) return;
    const link = document.createElement('a');
    link.download = `etykieta_zebra_${state.currentCode || 'kod'}_203dpi.png`;
    link.href = elements.zebraCanvas.toDataURL('image/png');
    link.click();
    showToast('Pobrano etykietę PNG (203 DPI)', 'success');
  }

  function printDirect() {
    window.print();
  }

  async function initCameraScanner() {
    if (state.html5QrCode) return;

    try {
      if (typeof Html5Qrcode === 'undefined') {
        throw new Error('Biblioteka Html5Qrcode nie została załadowana.');
      }

      state.html5QrCode = new Html5Qrcode('scanner-viewport', {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.DATA_MATRIX
        ],
        verbose: false
      });

      try {
        const devices = await Html5Qrcode.getCameras();
        if (devices && devices.length > 0) {
          state.cameras = devices;
          if (elements.btnSwitchCamera) {
            elements.btnSwitchCamera.style.display = devices.length > 1 ? 'flex' : 'none';
          }
        }
      } catch (camErr) {
        console.log('Camera discovery optional note:', camErr);
      }
    } catch (err) {
      console.error('Init camera error:', err);
      showToast('Błąd inicjalizacji skanera: ' + err.message, 'danger');
    }
  }

  async function startCamera() {
    initAudioContext();
    await initCameraScanner();

    if (!state.html5QrCode) {
      showToast('Nie można uruchomić skanera', 'danger');
      return;
    }

    elements.scannerContainer.classList.add('active');
    elements.btnStartCamera.innerHTML = '<span>⏹️</span><span>Zatrzymaj Kamerę</span>';
    elements.btnStartCamera.classList.add('btn-secondary-action');
    elements.scannerStatusText.textContent = 'Szukanie kodu...';
    elements.scannerStatusDot.classList.add('active');

    const config = {
      fps: 25,
      aspectRatio: 1.333333,
      experimental: {
        useBarCodeDetectorIfSupported: true
      }
    };

    let cameraSource = { facingMode: 'environment' };
    if (state.cameras.length > 0 && state.cameras[state.currentCameraIndex]) {
      cameraSource = state.cameras[state.currentCameraIndex].id;
    }

    try {
      await state.html5QrCode.start(
        cameraSource,
        config,
        onScanSuccess,
        onScanProgress
      );
      state.isScannerRunning = true;
      showToast('📷 Skaner aktywny - nakieruj na kod QR lub kreskowy', 'info', 2500);
    } catch (startErr) {
      console.error('Camera start failed:', startErr);
      stopCamera();

      if (location.protocol === 'file:') {
        showToast('Wskazówka: Dostęp do kamery w przeglądarce wymaga HTTPS lub localhost (uruchom przez serwer np. npx serve)', 'warning', 6000);
      } else {
        showToast('Błąd uruchomienia kamery: ' + (startErr.message || startErr), 'danger', 5000);
      }
    }
  }

  async function stopCamera() {
    if (state.html5QrCode && state.isScannerRunning) {
      try {
        await state.html5QrCode.stop();
      } catch (err) {
        console.warn('Camera stop error:', err);
      }
      state.isScannerRunning = false;
    }

    state.isTorchOn = false;
    if (elements.btnToggleTorch) elements.btnToggleTorch.classList.remove('active');

    elements.scannerContainer.classList.remove('active');
    elements.btnStartCamera.innerHTML = '<span>📷</span><span>Uruchom Skaner Kamery</span>';
    elements.btnStartCamera.classList.remove('btn-secondary-action');
    elements.scannerStatusDot.classList.remove('active');
  }

  function toggleCamera() {
    if (state.isScannerRunning) {
      stopCamera();
    } else {
      startCamera();
    }
  }

  async function switchCamera() {
    if (state.cameras.length <= 1) return;
    state.currentCameraIndex = (state.currentCameraIndex + 1) % state.cameras.length;
    await stopCamera();
    await startCamera();
  }

  async function toggleTorch() {
    if (!state.isScannerRunning || !state.html5QrCode) return;
    try {
      state.isTorchOn = !state.isTorchOn;
      await state.html5QrCode.applyVideoConstraints({
        advanced: [{ torch: state.isTorchOn }]
      });
      if (elements.btnToggleTorch) {
        elements.btnToggleTorch.classList.toggle('active', state.isTorchOn);
      }
      showToast(state.isTorchOn ? 'Latarka włączona' : 'Latarka wyłączona', 'info', 1500);
    } catch (err) {
      console.warn('Torch toggle not supported on this device:', err);
      showToast('Latarka niedostępna na tym urządzeniu', 'warning', 2000);
      state.isTorchOn = false;
      if (elements.btnToggleTorch) elements.btnToggleTorch.classList.remove('active');
    }
  }

  function onScanSuccess(decodedText, decodedResult) {
    const now = Date.now();
    const rawCode = decodedText ? decodedText.trim() : '';
    if (!rawCode) return;

    if (rawCode === state.lastScannedCode && (now - state.lastScanTime) < CONFIG.SCAN_COOLDOWN_MS) {
      return;
    }

    state.lastScannedCode = rawCode;
    state.lastScanTime = now;

    playScanBeep();
    triggerHaptic();

    if (elements.scannerTargetBox) {
      elements.scannerTargetBox.classList.add('detected');
      setTimeout(() => elements.scannerTargetBox.classList.remove('detected'), 600);
    }

    const cleanedCode = cleanExtractedCode(rawCode);

    elements.mainInput.value = cleanedCode;

    const detectedFormatName = decodedResult?.result?.format?.formatName || 'QR / KOD';
    elements.scannerStatusText.textContent = `Wykryto: ${cleanedCode}`;

    generateBarcode(cleanedCode, 'camera');

    showToast(`⚡ Wykryto (${detectedFormatName}): ${cleanedCode}`, 'success', 2500);

    if (elements.resultCard) {
      elements.resultCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function onScanProgress(errorMessage) {
  }

  async function handleFileScan(file) {
    if (!file) return;
    await initCameraScanner();

    if (!state.html5QrCode) {
      showToast('Błąd skanera obrazów', 'danger');
      return;
    }

    showToast('⏳ Odczytywanie kodu ze zdjęcia...', 'info', 2000);

    try {
      const decodedText = await state.html5QrCode.scanFile(file, true);
      if (decodedText) {
        playScanBeep();
        triggerHaptic();
        const cleaned = cleanExtractedCode(decodedText);
        elements.mainInput.value = cleaned;
        generateBarcode(cleaned, 'file');
        showToast(`✅ Odczytano ze zdjęcia: ${cleaned}`, 'success', 3000);
      }
    } catch (err) {
      console.warn('File scan error:', err);
      showToast('Nie wykryto kodu QR ani kreskowego na tym zdjęciu', 'warning', 3500);
    } finally {
      elements.fileScanInput.value = '';
    }
  }

  function validateAndInspectInput() {
    const val = elements.mainInput.value.trim();
    if (!val) {
      elements.checksumInfo.textContent = '';
      elements.inputStatusMsg.textContent = 'Wpisz lub zeskanuj kod...';
      elements.inputStatusMsg.style.color = '';
      elements.resultCard.classList.remove('active');
      return;
    }

    if (/^\d+$/.test(val)) {
      if (val.length === 12) {
        const expected = calculateEan13Checksum(val);
        elements.checksumInfo.textContent = `Sugerowana cyfra kontrolna: ${expected} (dla EAN-13)`;
        elements.checksumInfo.className = 'checksum-info';
      } else if (val.length === 13) {
        const isValid = isValidEan13(val);
        if (isValid) {
          elements.checksumInfo.textContent = '✓ Poprawna suma kontrolna EAN-13';
          elements.checksumInfo.className = 'checksum-info valid';
        } else {
          const expected = calculateEan13Checksum(val.slice(0, 12));
          elements.checksumInfo.textContent = `⚠️ Błędna suma kontrolna (powinno być: ${expected})`;
          elements.checksumInfo.className = 'checksum-info invalid';
        }
      } else if (val.length === 8) {
        const isValid = isValidEan8(val);
        elements.checksumInfo.textContent = isValid ? '✓ Poprawny EAN-8' : 'EAN-8';
        elements.checksumInfo.className = isValid ? 'checksum-info valid' : 'checksum-info';
      } else {
        elements.checksumInfo.textContent = `Długość: ${val.length} znaków`;
        elements.checksumInfo.className = 'checksum-info';
      }
    } else {
      elements.checksumInfo.textContent = `Format alfanumeryczny (${val.length} znaków)`;
      elements.checksumInfo.className = 'checksum-info';
    }
  }

  function processInputAndGenerate(addToHist = true) {
    const val = elements.mainInput.value.trim();
    validateAndInspectInput();
    if (val.length >= 3) {
      generateBarcode(val, addToHist ? 'manual' : null);
    }
  }

  function selectFormat(fmt) {
    state.selectedFormat = fmt;
    elements.formatButtons.forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-format') === fmt);
    });
    if (elements.mainInput.value.trim()) {
      generateBarcode(elements.mainInput.value.trim(), 'manual');
    }
  }

  function loadSettings() {
    try {
      const data = localStorage.getItem(CONFIG.SETTINGS_KEY);
      if (data) {
        const settings = JSON.parse(data);
        state.soundEnabled = settings.sound !== false;
        state.vibrateEnabled = settings.vibrate !== false;
        if (settings.theme === 'dark') {
          document.documentElement.setAttribute('data-theme', 'dark');
        }
      }
    } catch (e) {}

    updateSettingsUI();
  }

  function saveSettings() {
    try {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      localStorage.setItem(CONFIG.SETTINGS_KEY, JSON.stringify({
        sound: state.soundEnabled,
        vibrate: state.vibrateEnabled,
        theme: isDark ? 'dark' : 'light'
      }));
    } catch (e) {}
  }

  function updateSettingsUI() {
    if (elements.soundToggle) {
      elements.soundToggle.classList.toggle('active', state.soundEnabled);
      elements.soundToggle.title = state.soundEnabled ? 'Dźwięk: Włączony' : 'Dźwięk: Wyłączony';
    }
    if (elements.vibrateToggle) {
      elements.vibrateToggle.classList.toggle('active', state.vibrateEnabled);
      elements.vibrateToggle.title = state.vibrateEnabled ? 'Wibracje: Włączone' : 'Wibracje: Wyłączone';
    }
    if (elements.themeToggle) {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      elements.themeToggle.textContent = isDark ? '☀️' : '🌙';
      elements.themeToggle.title = isDark ? 'Włącz jasny motyw' : 'Włącz ciemny motyw';
    }
  }

  function toggleTheme() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (isDark) {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
    saveSettings();
    updateSettingsUI();
  }

  function initEventListeners() {
    if (elements.themeToggle) elements.themeToggle.addEventListener('click', toggleTheme);
    if (elements.soundToggle) {
      elements.soundToggle.addEventListener('click', () => {
        state.soundEnabled = !state.soundEnabled;
        saveSettings();
        updateSettingsUI();
        showToast(state.soundEnabled ? 'Dźwięk skanera włączony' : 'Dźwięk wyciszony', 'info', 1500);
      });
    }
    if (elements.vibrateToggle) {
      elements.vibrateToggle.addEventListener('click', () => {
        state.vibrateEnabled = !state.vibrateEnabled;
        saveSettings();
        updateSettingsUI();
        showToast(state.vibrateEnabled ? 'Wibracje włączone' : 'Wibracje wyłączone', 'info', 1500);
      });
    }

    if (elements.btnStartCamera) elements.btnStartCamera.addEventListener('click', toggleCamera);
    if (elements.btnCloseCamera) elements.btnCloseCamera.addEventListener('click', stopCamera);
    if (elements.btnToggleTorch) elements.btnToggleTorch.addEventListener('click', toggleTorch);
    if (elements.btnSwitchCamera) elements.btnSwitchCamera.addEventListener('click', switchCamera);

    if (elements.btnTriggerFile) {
      elements.btnTriggerFile.addEventListener('click', () => {
        elements.fileScanInput.click();
      });
    }
    if (elements.fileScanInput) {
      elements.fileScanInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          handleFileScan(e.target.files[0]);
        }
      });
    }

    if (elements.mainInput) {
      elements.mainInput.addEventListener('input', () => {
        processInputAndGenerate(true);
      });
      elements.mainInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          processInputAndGenerate(true);
          elements.mainInput.blur();
        }
      });
    }

    if (elements.btnClearInput) {
      elements.btnClearInput.addEventListener('click', () => {
        elements.mainInput.value = '';
        validateAndInspectInput();
        elements.resultCard.classList.remove('active');
        elements.mainInput.focus();
      });
    }

    if (elements.btnPasteInput) {
      elements.btnPasteInput.addEventListener('click', async () => {
        try {
          if (navigator.clipboard && navigator.clipboard.readText) {
            const text = await navigator.clipboard.readText();
            if (text) {
              elements.mainInput.value = text.trim();
              processInputAndGenerate(true);
              showToast('Wklejono kod ze schowka', 'success', 2000);
            }
          } else {
            showToast('Użyj Ctrl+V aby wkleić', 'info');
          }
        } catch (err) {
          showToast('Użyj Ctrl+V aby wkleić', 'info');
        }
      });
    }

    elements.formatButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        selectFormat(btn.getAttribute('data-format'));
      });
    });

    elements.sampleChips.forEach(chip => {
      chip.addEventListener('click', () => {
        const sample = chip.getAttribute('data-sample');
        elements.mainInput.value = sample;
        processInputAndGenerate(true);
        showToast(`Załadowano przykładowy kod: ${sample}`, 'info', 2000);
      });
    });

    if (elements.btnShareZebra) elements.btnShareZebra.addEventListener('click', shareZebraLabel);
    if (elements.btnDownloadPng) elements.btnDownloadPng.addEventListener('click', downloadZebraPng);
    if (elements.btnCopyCode) elements.btnCopyCode.addEventListener('click', () => copyToClipboard(state.currentCode));
    if (elements.btnPrintDirect) elements.btnPrintDirect.addEventListener('click', printDirect);

    if (elements.btnClearHistory) elements.btnClearHistory.addEventListener('click', clearAllHistory);
  }

  function init() {
    loadSettings();
    initEventListeners();
    renderHistory();

    if (elements.mainInput && elements.mainInput.value.trim()) {
      processInputAndGenerate(false);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
