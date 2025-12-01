(function(){
  const video = document.getElementById('preview');
  const cameraSelect = document.getElementById('cameraSelect');
  const btnStart = document.getElementById('btnStart');
  const btnStop = document.getElementById('btnStop');
  const statusEl = document.getElementById('status');

  const rawEl = document.getElementById('raw');
  const rutEl = document.getElementById('rut');
  const nombreEl = document.getElementById('nombre');
  const areaSelect = document.getElementById('areaSelect');
  const btnRegistrar = document.getElementById('btnRegistrar');
  const btnLimpiar = document.getElementById('btnLimpiar');
  const msgEl = document.getElementById('msg');

  let reader = null;
  let currentDeviceId = null;
  let scanning = false;
  let lastText = '';
  let devicesCache = [];

  function preferBackCamera(devices) {
    if (!devices || !devices.length) return null;
    const idx = devices.findIndex(d => /back|rear|environment/i.test(d.label || ''));
    return (idx >= 0 ? devices[idx].deviceId : devices[devices.length - 1].deviceId);
  }

  function populateCameraSelect(devices, preserveSelection = true) {
    const prev = preserveSelection ? (cameraSelect.value || currentDeviceId) : null;
    cameraSelect.innerHTML = '';
    devices.forEach((c, i) => {
      const opt = document.createElement('option');
      opt.value = c.deviceId;
      opt.textContent = c.label || `Cámara ${i+1}`;
      cameraSelect.appendChild(opt);
    });
    if (preserveSelection && prev) {
      const exists = devices.some(d => d.deviceId === prev);
      if (exists) cameraSelect.value = prev;
    }
  }

  function setStatus(msg, cls) {
    statusEl.textContent = msg;
    statusEl.className = 'small ' + (cls || '');
  }

  function normalizeRut(text) {
    if (!text) return '';
    const match = text.match(/([0-9]{6,8}-?[0-9kK])/);
    if (!match) return '';
    let rut = match[1].replace(/[^0-9kK-]/g, '');
    if (!rut.includes('-')) {
      const dv = rut.slice(-1);
      rut = rut.slice(0, -1) + '-' + dv;
    }
    return rut.toUpperCase();
  }

  function extractRutFromSidivUrl(text) {
    try {
      const maybeUrl = new URL(text);
      const run = maybeUrl.searchParams.get('RUN');
      if (run) return normalizeRut(run);
    } catch (_) {
      // Not a valid URL, try regex fallback
    }
    // Fallback: buscar RUN=xxxxx en el texto
    const m = text.match(/RUN=([0-9kK-]+)/);
    if (m) return normalizeRut(m[1]);
    return '';
  }

  function maybeExtractName(text) {
    if (!text) return '';
    // Heurística simple: buscar dos palabras en mayúsculas separadas por espacio
    const m = text.match(/([A-ZÁÉÍÓÚÑ]{2,}(?:\s+[A-ZÁÉÍÓÚÑ]{2,}){1,3})/);
    return m ? m[1].trim() : '';
  }

  async function listCameras() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cams = devices.filter(d => d.kind === 'videoinput');
    devicesCache = cams;
    populateCameraSelect(cams, true);
    if (!currentDeviceId && cams.length) {
      currentDeviceId = preferBackCamera(cams);
      if (currentDeviceId) cameraSelect.value = currentDeviceId;
    }
  }

  async function loadAreas() {
    try {
      const resp = await fetch('/api/areas');
      const data = await resp.json();
      const sel = areaSelect;
      if (!sel) return;
      sel.innerHTML = '<option value="" disabled selected>Seleccione un área</option>';
      (data.data || []).forEach(a => {
        const opt = document.createElement('option');
        opt.value = a.id;
        opt.textContent = a.nombre;
        sel.appendChild(opt);
      });
    } catch (_) {}
  }

  async function start() {
    if (scanning) return;
    try {
      if (!devicesCache.length) {
        await listCameras();
      }
      const selected = cameraSelect.value;
      currentDeviceId = selected || currentDeviceId || preferBackCamera(devicesCache);

      // Hints para mejorar la detección (QR y try harder)
      const hints = new Map();
      if (ZXing && ZXing.DecodeHintType) {
        hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
        hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [ZXing.BarcodeFormat.QR_CODE]);
      }
      reader = new ZXing.BrowserMultiFormatReader(hints);
      scanning = true;
      setStatus('Escaneando…', 'ok');

      const controls = await reader.decodeFromVideoDevice(currentDeviceId, video, (result, err) => {
        if (result) {
          const text = result.getText();
          if (text && text !== lastText) {
            lastText = text;
            rawEl.value = text;
            // Primero intentar extraer desde URL del Registro Civil (RUN=...)
            let rut = extractRutFromSidivUrl(text);
            if (!rut) {
              // Fallback: buscar RUT directo en el texto
              rut = normalizeRut(text);
            }
            if (rut) rutEl.value = rut;
            const nombre = maybeExtractName(text);
            if (nombre && !nombreEl.value) {
              nombreEl.value = nombre;
            } else if (!nombreEl.value) {
              setStatus('QR leído. Completa el nombre manualmente (no viene en el QR).', 'ok');
            }
            // Enviar datos escaneados al backend para autocompletar en escritorio
            try {
              fetch('/api/scan-update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ raw: text, rut: rut || '', nombre: nombre || nombreEl.value || '', area: '' })
              }).catch(()=>{});
            } catch (_) {}
          }
        }
      });

      // Guardar controls para stop
      video._zxingControls = controls;

      // Tras obtener permisos, refrescar lista y conservar la cámara en uso
      try {
        const track = video.srcObject && video.srcObject.getVideoTracks ? video.srcObject.getVideoTracks()[0] : null;
        const settings = track && track.getSettings ? track.getSettings() : {};
        const inUseId = settings.deviceId || currentDeviceId;
        await listCameras();
        if (inUseId) {
          currentDeviceId = inUseId;
          cameraSelect.value = inUseId;
        }
      } catch (_) {}
    } catch (e) {
      console.error(e);
      setStatus('Error al iniciar cámara: ' + e.message, 'err');
    }
  }

  function stop() {
    try {
      scanning = false;
      if (video._zxingControls && video._zxingControls.stop) {
        video._zxingControls.stop();
      }
      if (reader && reader.reset) reader.reset();
      setStatus('Detenido');
    } catch (e) {
      console.warn('stop error', e);
    }
  }

  async function registrar() {
    msgEl.textContent = '';
    msgEl.className = 'small';
    const rut = rutEl.value.trim();
    const nombre = nombreEl.value.trim();
    const areaId = areaSelect.value;

    if (!rut || !nombre) {
      msgEl.textContent = 'RUT y nombre son obligatorios';
      msgEl.className = 'small err';
      return;
    }

    try {
      const res = await fetch('/api/ingreso', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify((areaId ? { rut, nombre, area_id: Number(areaId) } : { rut, nombre }))
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error desconocido');
      msgEl.textContent = 'Ingreso registrado ✔️';
      msgEl.className = 'small ok';
      // Opcional: limpiar solo raw para el siguiente escaneo
      // rawEl.value = '';
    } catch (e) {
      msgEl.textContent = 'Error: ' + e.message;
      msgEl.className = 'small err';
    }
  }

  function limpiar() {
    rawEl.value = '';
    rutEl.value = '';
    nombreEl.value = '';
    areaEl.value = '';
    lastText = '';
    msgEl.textContent = '';
  }

  cameraSelect.addEventListener('change', () => {
    currentDeviceId = cameraSelect.value;
    if (scanning) {
      stop();
      start();
    }
  });
  btnStart.addEventListener('click', start);
  btnStop.addEventListener('click', stop);
  btnRegistrar.addEventListener('click', registrar);
  btnLimpiar.addEventListener('click', limpiar);

  // Pre-llenar lista de cámaras
  if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) {
    if (window.isSecureContext === false) {
      setStatus('La cámara requiere HTTPS. Usa https://IP:3443/scanner', 'err');
    } else {
      setStatus('Este navegador no soporta acceso a cámara', 'err');
    }
  } else {
    listCameras().catch(()=>{});
    loadAreas().catch(()=>{});
  }
})();
