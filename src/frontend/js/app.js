const API_BASE = 'http://localhost:3000/api';

class VisitasApp {
    constructor() {
        this.init();
        this.setupEventListeners();
        this.checkConnection();
        this.setupScannerInput();
        // Estado de sesión
        this.authToken = null;
        this.authRole = null;
        this.authUser = null;
    }

    // Restaurar sesión si hay token en localStorage
    async restoreSession() {
        const token = localStorage.getItem('authToken');
        if (!token) {
            this.showLoginModal();
            return;
        }

        try {
            const resp = await fetch(`${API_BASE}/me`, { headers: { 'X-Auth-Token': token } });
            const data = await resp.json();
            if (data && data.authenticated) {
                this.authToken = token;
                this.authRole = data.role;
                this.authUser = data.username;
                this.applyRoleToUI();
            } else {
                this.showLoginModal();
            }
        } catch (e) {
            this.showLoginModal();
        }
    }

    showChangePassModal() {
        const m = document.getElementById('changePassModal');
        if (!m) return;
        // only admin allowed to change passwords
        if (this.authRole !== 'admin') return this.showMessage('No autorizado: solo administradores pueden cambiar contraseñas', 'error');
        m.setAttribute('aria-hidden', 'false');
        // reset
        const oldPw = document.getElementById('oldPassword'); if (oldPw) oldPw.value = '';
        const newPw = document.getElementById('newPassword'); if (newPw) newPw.value = '';
        const confirmPw = document.getElementById('confirmPassword'); if (confirmPw) confirmPw.value = '';

        // populate users select only for admin
        const sel = document.getElementById('changeUser');
        if (!sel) return;
        sel.innerHTML = '<option value="">(Selecciona usuario)</option>';
        if (this.authRole === 'admin' && this.authToken) {
            fetch(`${API_BASE}/users`, { headers: { 'X-Auth-Token': this.authToken } })
                .then(r => r.json())
                .then(data => {
                    if (data && data.users) {
                        data.users.forEach(u => {
                            const opt = document.createElement('option');
                            opt.value = u.username;
                            opt.textContent = `${u.username} (${u.role})`;
                            sel.appendChild(opt);
                        });
                        // preselect current user
                        if (this.authUser) sel.value = this.authUser;
                    }
                }).catch(()=>{});
        }
    }

    closeChangePassModal() {
        const m = document.getElementById('changePassModal');
        if (!m) return;
        m.setAttribute('aria-hidden', 'true');
    }

    async submitChangePassword() {
        const sel = document.getElementById('changeUser');
        const username = sel ? sel.value : '';
        const newPassword = document.getElementById('newPassword').value || '';
        const confirmPassword = document.getElementById('confirmPassword').value || '';

        if (!newPassword || newPassword.length < 4) return this.showMessage('La contraseña nueva debe tener al menos 4 caracteres', 'error');
        if (newPassword !== confirmPassword) return this.showMessage('Las contraseñas no coinciden', 'error');

        // Only admin can change passwords
        if (this.authRole !== 'admin') return this.showMessage('No autorizado: solo administradores pueden cambiar contraseñas', 'error');

        try {
            const resp = await fetch(`${API_BASE}/change-password`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Auth-Token': this.authToken },
                body: JSON.stringify({ username, newPassword })
            });
            const data = await resp.json();
            if (!resp.ok) return this.showMessage(data.error || 'No se pudo cambiar la contraseña', 'error');
            this.showMessage('Contraseña cambiada para ' + username, 'success');
            this.closeChangePassModal();
        } catch (e) {
            this.showMessage('Error al cambiar la contraseña', 'error');
        }
    }

    showLoginModal() {
        const m = document.getElementById('loginModal');
        if (!m) return;
        m.setAttribute('aria-hidden', 'false');
        // reset inputs
        const pwd = document.getElementById('loginPassword'); if (pwd) pwd.value = '';
        document.querySelectorAll('.profile-btn').forEach(b => b.classList.remove('selected'));
    }

    closeLoginModal() {
        const m = document.getElementById('loginModal');
        if (!m) return;
        m.setAttribute('aria-hidden', 'true');
    }

    async attemptLogin(username, password) {
        try {
            const resp = await fetch(`${API_BASE}/login`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await resp.json();
            if (!resp.ok) {
                return this.showMessage(data.error || 'Error al iniciar sesión', 'error');
            }
            // Guardar token
            this.authToken = data.token;
            this.authRole = data.role;
            this.authUser = data.username;
            localStorage.setItem('authToken', data.token);
            localStorage.setItem('authRole', data.role);
            localStorage.setItem('authUser', data.username);

            this.applyRoleToUI();
            this.closeLoginModal();
            this.showMessage(`Bienvenido ${this.authUser} (${this.authRole})`, 'success');
        } catch (e) {
            this.showMessage('Error al iniciar sesión', 'error');
        }
    }

    async logout() {
        try {
            await fetch(`${API_BASE}/logout`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Auth-Token': this.authToken } });
        } catch(_) {}
        this.authToken = null; this.authRole = null; this.authUser = null;
        localStorage.removeItem('authToken'); localStorage.removeItem('authRole'); localStorage.removeItem('authUser');
        this.showLoginModal();
        this.applyRoleToUI();
    }

    applyRoleToUI() {
        // Habilitar/desabilitar el botón de generar reporte
        const btnReporte = document.getElementById('btnReporte');
        if (btnReporte) {
            if (this.authRole === 'admin') {
                btnReporte.disabled = false;
                btnReporte.classList.remove('disabled');
            } else {
                btnReporte.disabled = true;
                btnReporte.classList.add('disabled');
            }
        }

        // Mostrar/ocultar botones de eliminar en reportes si existen
        document.querySelectorAll('.btn-eliminar').forEach(b => {
            if (this.authRole === 'guardia') b.style.display = 'none'; else b.style.display = '';
        });

        // Mostrar usuario en status + mostrar/ocultar botones de sesión
        const statusEl = document.getElementById('status');
        if (statusEl) {
            if (this.authUser) statusEl.textContent = `Usuario: ${this.authUser}`; else statusEl.textContent = 'Conectado';
        }

        const btnLogout = document.getElementById('btnLogout');
        const btnChangePass = document.getElementById('btnChangePass');
        if (btnLogout) btnLogout.style.display = this.authUser ? '' : 'none';
        if (btnChangePass) btnChangePass.style.display = this.authRole === 'admin' ? '' : 'none';
    }

    init() {
        console.log(' Aplicación de Registro de Visitas iniciada');
        // Cargar áreas al iniciar
        this.cargarAreas();
        // Restaurar sesión o abrir modal de login
        setTimeout(() => this.restoreSession(), 120);
    }

    setupEventListeners() {
        // Registrar ingreso
        document.getElementById('formIngreso').addEventListener('submit', (e) => {
            e.preventDefault();
            this.registrarIngreso();
        });

        // Ver todas las visitas
        document.getElementById('btnVisitas').addEventListener('click', () => {
            this.obtenerVisitas();
        });

        // Ver reportes
        document.getElementById('btnReportes').addEventListener('click', () => {
            this.listarReportes();
        });

        // Escáner móvil
        const btnScanner = document.getElementById('btnScanner');
        if (btnScanner) {
            btnScanner.addEventListener('click', () => {
                this.mostrarScannerInfo();
            });
            // Iniciar polling pasivo para captar QR si aparece
            this.iniciarPollingScan();
        }

        // Aviso por visitas expiradas cada 60s
        setInterval(() => this.checkExpirados(), 60000);

        // Generar reporte
        document.getElementById('btnReporte').addEventListener('click', () => {
            this.generarReporte();
        });

        // Buscar por RUT
        document.getElementById('btnBuscar').addEventListener('click', () => {
            this.toggleSearch();
        });

        document.getElementById('btnBuscarRut').addEventListener('click', () => {
            this.buscarPorRut();
        });

        // Limpiar resultados
        document.getElementById('btnLimpiar').addEventListener('click', () => {
            this.limpiarResultados();
        });

        // Area picker modal (UI mejorada para seleccionar área)
        const areaPickerBtn = document.getElementById('areaPickerBtn');
        const areaModal = document.getElementById('areaModal');
        const areaModalClose = document.getElementById('areaModalClose');
        const areaModalOverlay = document.getElementById('areaModalOverlay');
        const areaCloseBtn = document.getElementById('areaCloseBtn');
        const areaClearBtn = document.getElementById('areaClearBtn');

        if (areaPickerBtn) {
            areaPickerBtn.addEventListener('click', () => this.openAreaModal());
        }
        if (areaModalClose) areaModalClose.addEventListener('click', () => this.closeAreaModal());
        if (areaCloseBtn) areaCloseBtn.addEventListener('click', () => this.closeAreaModal());
        if (areaModalOverlay) areaModalOverlay.addEventListener('click', () => this.closeAreaModal());
        if (areaClearBtn) areaClearBtn.addEventListener('click', () => this.clearSelectedArea());
        // cerrar con Escape
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.closeAreaModal(); });

        // Escuchar eventos de Electron
        if (window.electronAPI) {
            window.electronAPI.onMenuEvent((event, action) => {
                if (action === 'nueva-visita') {
                    document.getElementById('rut').focus();
                } else if (action === 'ver-historial') {
                    this.obtenerVisitas();
                }
            });
        }

        // Login / perfiles
        const profileGuardia = document.getElementById('profileGuardia');
        const profileAdmin = document.getElementById('profileAdmin');
        const loginModal = document.getElementById('loginModal');
        const loginOverlay = document.getElementById('loginModalOverlay');
        const loginSubmit = document.getElementById('loginSubmit');

        let selectedProfile = null;
        const setSelected = (username, el) => {
            selectedProfile = username;
            document.querySelectorAll('.profile-btn').forEach(b => b.classList.remove('selected'));
            if (el) el.classList.add('selected');
        };

        if (profileGuardia) profileGuardia.addEventListener('click', (e) => setSelected('guardia', e.currentTarget));
        if (profileAdmin) profileAdmin.addEventListener('click', (e) => setSelected('admin', e.currentTarget));
        if (loginOverlay) loginOverlay.addEventListener('click', () => {}); // no cerrar al click fuera
        if (loginSubmit) loginSubmit.addEventListener('click', () => {
            const pass = document.getElementById('loginPassword').value || '';
            if (!selectedProfile) return this.showMessage('Selecciona un perfil antes de iniciar sesión', 'error');
            this.attemptLogin(selectedProfile, pass);
        });

        // Exponer para pruebas: abrir login si no hay sesión
        window.appOpenLogin = () => this.showLoginModal();

        // Logout / change-password buttons
        const btnLogout = document.getElementById('btnLogout');
        const btnChangePass = document.getElementById('btnChangePass');
        if (btnLogout) btnLogout.addEventListener('click', () => this.logout());
        if (btnChangePass) btnChangePass.addEventListener('click', () => this.showChangePassModal());

        // Change password modal controls
        const changePassClose = document.getElementById('changePassClose');
        const changePassCancel = document.getElementById('changePassCancel');
        const changePassSubmit = document.getElementById('changePassSubmit');
        if (changePassClose) changePassClose.addEventListener('click', () => this.closeChangePassModal());
        if (changePassCancel) changePassCancel.addEventListener('click', () => this.closeChangePassModal());
        if (changePassSubmit) changePassSubmit.addEventListener('click', () => this.submitChangePassword());
    }

    async mostrarScannerInfo() {
        try {
            const resp = await fetch(`${API_BASE}/scanner-info`);
            const data = await resp.json();
            const resultadoEl = document.getElementById('resultado');
            const urls = (data.urls || []).map(u => `<li><code>${u}</code></li>`).join('') || '<li>No se detectaron IPs locales</li>';
            resultadoEl.innerHTML = `
            <div class="card-inner">
              <h3> Escáner Móvil</h3>
              <p>1. Conecta el celular a la misma red WiFi que este equipo.</p>
              <p>2. Abre una de estas URLs en el navegador del celular:</p>
              <ul>${urls}</ul>
              <p>3. Pulsa "Iniciar" y apunta al QR del carnet.</p>
              <p>El RUT/identificador se autocompletará aquí si el QR trae ese dato.</p>
            </div>`;
        } catch (e) {
            this.showMessage('No se pudo obtener info del escáner', 'error');
        }
    }

    iniciarPollingScan() {
        // Poll cada 2s por un máximo razonable (se mantiene mientras la app corre)
        setInterval(async () => {
            try {
                const resp = await fetch(`${API_BASE}/last-scan`);
                const data = await resp.json();
                if (data && data.data) {
                    // Heurística: si parece un RUT (contiene guión y dígitos) lo ponemos directamente
                    const contenido = data.data.trim();
                    const rutInput = document.getElementById('rut');
                    if (contenido.match(/\d{5,8}-[\dkK]/)) {
                        // Guardar valor previo para decidir foco
                        const previo = rutInput.value;
                        // Actualizar valor siempre que cambie
                        if (previo !== contenido) rutInput.value = contenido;

                        const nombreInput = document.getElementById('nombre');
                        const active = document.activeElement;

                        // Si el rut se escribió ahora (antes vacío) y el campo nombre está vacío,
                        // mover el foco al nombre para que el usuario pueda escribirlo.
                        if ((!previo || previo === '') && nombreInput && !nombreInput.value) {
                            nombreInput.focus();
                        } else {
                            // Sólo enfocar rut si el usuario no está escribiendo en otro campo distinto
                            // (evitar robar el foco cuando está escribiendo el nombre u otro input)
                            if (active === document.body || active === document.documentElement || active === rutInput || !active || active.tagName === 'HTML') {
                                rutInput.focus();
                            }
                        }
                    } else {
                        // Si no es rut, lo dejamos en nombre si está vacío y tiene espacios
                        const nombreInput = document.getElementById('nombre');
                        if (!nombreInput.value && contenido.split(' ').length >= 2 && contenido.length < 80) {
                            nombreInput.value = contenido;
                        }
                    }
                }
            } catch (e) {
                // Silencioso
            }
        }, 2000);
    }

    async checkExpirados() {
        try {
            const resp = await fetch(`${API_BASE}/expirados`);
            const data = await resp.json();
            if (data && data.total > 0) {
                this.showMessage(` ${data.total} visita(s) expiradas (más de 6h sin salida).`, 'error');
            }
        } catch (e) {
            // silencioso
        }
    }

    async checkConnection() {
        try {
            const response = await fetch(`${API_BASE.replace('/api', '')}/health`);
            if (response.ok) {
                // Obtener usuario del sistema
                try {
                    const who = await fetch(`${API_BASE}/whoami`).then(r => r.json());
                    if (who && who.user) {
                        this.updateStatus(`Usuario: ${who.user}`, 'success');
                    } else {
                        this.updateStatus('Usuario: desconocido', 'success');
                    }
                } catch {
                    this.updateStatus('Usuario: desconocido', 'success');
                }
            } else {
                this.updateStatus('Sin conexión', 'error');
            }
        } catch (error) {
            this.updateStatus('Sin conexión', 'error');
        }
    }

    updateStatus(message, type) {
        const statusEl = document.getElementById('status');
        statusEl.textContent = message;
        statusEl.className = `status ${type}`;
    }

    showLoading(show = true) {
        document.getElementById('loading').style.display = show ? 'block' : 'none';
    }

    async registrarIngreso() {
        const rut = document.getElementById('rut').value.trim();
        const nombre = document.getElementById('nombre').value.trim();
        const areaSel = document.getElementById('areaSelect').value;

        if (!rut || !nombre || !areaSel) {
            this.showMessage('Por favor complete todos los campos', 'error');
            return;
        }

        this.showLoading(true);

        try {
            const response = await fetch(`${API_BASE}/ingreso`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ rut, nombre, area_id: Number(areaSel) })
            });

            const data = await response.json();

            if (response.ok) {
                this.showMessage(` Ingreso registrado: ${nombre} (${rut})`, 'success');
                document.getElementById('formIngreso').reset();
                // Resetear select
                const sel = document.getElementById('areaSelect');
                if (sel) sel.selectedIndex = 0;
                // Actualizar etiqueta visible
                try { this.updateAreaLabel('Ninguna'); } catch(e){}

                // Evitar que el último escaneo vuelva a autocompletar el RUT (consumir/limpiar el staging de scanner)
                try {
                    fetch(`${API_BASE}/scan-update`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ raw: '', rut: '', nombre: '', area: '' })
                    }).catch(()=>{});
                } catch(e) {}

                // Asegurar que el campo RUT quede vacío y sin foco hasta que se escanee o escriba uno nuevo
                try {
                    const rutInput = document.getElementById('rut');
                    if (rutInput) { rutInput.value = ''; rutInput.blur(); }
                } catch(e) {}

                // Recargar automáticamente la lista de visitas
                setTimeout(() => {
                    this.obtenerVisitas();
                }, 1000);

                if (window.electronAPI) {
                    window.electronAPI.showDialog(`Ingreso registrado para ${nombre}`);
                }
            } else {
                this.showMessage(`❌ Error: ${data.error}`, 'error');
            }
        } catch (error) {
            this.showMessage('❌ Error de conexión con el servidor', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    // Poblar selector de áreas
    async cargarAreas() {
        try {
            const resp = await fetch(`${API_BASE}/areas`);
            const data = await resp.json();
            const sel = document.getElementById('areaSelect');
            if (!sel) return;
            sel.innerHTML = '<option value="" disabled selected>Seleccione un área</option>';
            // También poblar el modal con botones grandes
            const grid = document.getElementById('areaGrid');
            if (grid) grid.innerHTML = '';

            (data.data || []).forEach(a => {
                const opt = document.createElement('option');
                opt.value = a.id;
                opt.textContent = a.nombre;
                sel.appendChild(opt);

                if (grid) {
                    const tile = document.createElement('button');
                    tile.type = 'button';
                    tile.className = 'area-tile';
                    tile.setAttribute('data-area-id', a.id);
                    tile.setAttribute('data-area-name', a.nombre);
                    tile.setAttribute('title', a.descripcion || a.nombre);
                    tile.textContent = a.nombre;
                    tile.addEventListener('click', () => {
                        this.setSelectedArea(String(a.id), a.nombre);
                        this.closeAreaModal();
                    });
                    grid.appendChild(tile);
                }
            });
            // Si ya había una selección, sincronizar el label
            const selVal = sel.value;
            if (selVal) {
                const selectedOpt = sel.querySelector(`option[value="${selVal}"]`);
                if (selectedOpt) this.updateAreaLabel(selectedOpt.textContent);
            }
        } catch (e) {
            // Silencioso
        }
    }

    // UI del modal de selección
    setSelectedArea(id, name) {
        const sel = document.getElementById('areaSelect');
        if (sel) sel.value = id;
        this.updateAreaLabel(name || '');

        // marcar tile seleccionado
        const tiles = document.querySelectorAll('.area-tile');
        tiles.forEach(t => t.classList.toggle('selected', t.getAttribute('data-area-id') === String(id)));
    }

    updateAreaLabel(name) {
        // actualizar el texto visible dentro del botón
        const btn = document.getElementById('areaPickerBtn');
        if (btn) {
            const textEl = btn.querySelector('.area-picker-text');
            if (textEl) textEl.textContent = name && name.trim() ? name : 'Seleccione un área';
            else btn.textContent = name || 'Seleccione un área';
        }
    }

    openAreaModal() {
        const modal = document.getElementById('areaModal');
        if (!modal) return;
        modal.setAttribute('aria-hidden', 'false');
        // focus al grid para teclado
        const grid = document.getElementById('areaGrid');
        if (grid) grid.focus();
    }

    closeAreaModal() {
        const modal = document.getElementById('areaModal');
        if (!modal) return;
        modal.setAttribute('aria-hidden', 'true');
        // devolver foco al botón selector
        const btn = document.getElementById('areaPickerBtn');
        if (btn) btn.focus();
    }

    clearSelectedArea() {
        const sel = document.getElementById('areaSelect');
        if (sel) sel.value = '';
        // desmarcar tiles
        const tiles = document.querySelectorAll('.area-tile');
        tiles.forEach(t => t.classList.remove('selected'));
        this.updateAreaLabel('Ninguna');
    }

    // Registrar salida directamente desde el botón
    async registrarSalidaDirecta(rut, nombre) {
        if (!confirm(`¿Registrar salida de ${nombre} (${rut})?`)) {
            return;
        }

        this.showLoading(true);
                try { this.updateAreaLabel(''); } catch(e){}
        try {
            const response = await fetch(`${API_BASE}/salida`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ rut })
            });

            const data = await response.json();

            if (response.ok) {
                this.showMessage(` Salida registrada para ${nombre}`, 'success');

                // Recargar la lista de visitas automáticamente
                setTimeout(() => {
                    this.obtenerVisitas();
                }, 1000);

                if (window.electronAPI) {
                    window.electronAPI.showDialog(`Salida registrada para ${nombre}`);
                }
            } else {
                this.showMessage(`❌ Error: ${data.error}`, 'error');
            }
        } catch (error) {
            this.showMessage('❌ Error de conexión con el servidor', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async obtenerVisitas() {
        this.showLoading(true);

        try {
            const response = await fetch(`${API_BASE}/visitas`);
            const data = await response.json();

            if (response.ok) {
                this.mostrarVisitas(data.data);
            } else {
                this.showMessage('❌ Error al obtener visitas', 'error');
            }
        } catch (error) {
            this.showMessage('❌ Error de conexión con el servidor', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async buscarPorRut() {
        const rut = document.getElementById('rutBuscar').value.trim();

        if (!rut) {
            this.showMessage('Por favor ingrese un RUT', 'error');
            return;
        }

        this.showLoading(true);

        try {
            const response = await fetch(`${API_BASE}/visitante/${rut}`);
            const data = await response.json();

            if (response.ok) {
                this.mostrarVisitaIndividual(data.data);
            } else {
                this.showMessage(`❌ ${data.error}`, 'error');
            }
        } catch (error) {
            this.showMessage('❌ Error de conexión con el servidor', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    // FUNCIÓN MEJORADA: Ahora incluye botones de salida
    mostrarVisitas(visitas) {
        const resultadoEl = document.getElementById('resultado');

        if (!visitas || visitas.length === 0) {
            resultadoEl.innerHTML = '<p>No hay visitas registradas</p>';
            return;
        }

        // Separar visitas activas y completadas
    const visitasActivas = visitas.filter(v => !v.fecha_salida);
    const visitasExpiradas = visitasActivas.filter(v => v.estado === 'expirado');
        const visitasCompletadas = visitas.filter(v => v.fecha_salida);

        let html = `
            <div class="stats">
                <div class="stat-card">
                    <h3> Activos</h3>
                    <span class="stat-number">${visitasActivas.length}</span>
                </div>
                <div class="stat-card">
                    <h3> Completados</h3>
                    <span class="stat-number">${visitasCompletadas.length}</span>
                </div>
                <div class="stat-card">
                    <h3> Expirados</h3>
                    <span class="stat-number">${visitasExpiradas.length}</span>
                </div>
                <div class="stat-card">
                    <h3> Total</h3>
                    <span class="stat-number">${visitas.length}</span>
                </div>
            </div>
        `;

        // Mostrar visitas activas primero con botones de salida
        if (visitasActivas.length > 0) {
            html += `<h3> Visitantes Actualmente en la Sede</h3>`;
            html += visitasActivas.map(visita => `
                <div class="visita-item visita-activa">
                    <div class="visita-header">
                        <strong>${visita.nombre}</strong>
                        <span class="rut">${visita.rut}</span>
                        ${visita.estado === 'expirado' ? '<span class="badge" style="margin-left:8px;color:#ff9800">EXPIRADO</span>' : ''}
                    </div>
                    <div class="visita-info">
                        <small> Ingreso: ${visita.fecha_ingreso} ${visita.hora_ingreso}</small>
                        <br>
                        <small> Área: ${visita.area_nombre || (visita.area || 'No especificada')}</small>
                        <br>
                        <small> Tiempo dentro: ${this.calcularTiempo(visita.fecha_ingreso, visita.hora_ingreso)}</small>
                    </div>
                    <div class="visita-actions">
                        <button class="btn btn-salida" onclick="app.registrarSalidaDirecta('${visita.rut}', '${visita.nombre.replace(/'/g, "\\'")}')">
                             Registrar Salida
                        </button>
                    </div>
                </div>
            `).join('');
        }

        // Mostrar visitas completadas (sin botones)
        if (visitasCompletadas.length > 0) {
            html += `<h3> Historial de Visitas</h3>`;
            html += visitasCompletadas.map(visita => `
                <div class="visita-item visita-completada">
                    <div class="visita-header">
                        <strong>${visita.nombre}</strong>
                        <span class="rut">${visita.rut}</span>
                    </div>
                    <div class="visita-info">
                        <small> Ingreso: ${visita.fecha_ingreso} ${visita.hora_ingreso}</small>
                        <br>
                        <small> Área: ${visita.area_nombre || (visita.area || 'No especificada')}</small>
                        <br>
                        <small> Salida: ${visita.fecha_salida} ${visita.hora_salida}</small>
                        <br>
                        <small> Duración: ${this.calcularDuracion(visita.fecha_ingreso, visita.hora_ingreso, visita.fecha_salida, visita.hora_salida)}</small>
                    </div>
                </div>
            `).join('');
        }

        resultadoEl.innerHTML = html;
        // Re-aplicar permisos (escondemos botones que correspondan al rol)
        this.applyRoleToUI();
    }

    mostrarVisitaIndividual(visita) {
        const resultadoEl = document.getElementById('resultado');

        if (!visita) {
            resultadoEl.innerHTML = '<p>No se encontró el visitante</p>';
            return;
        }

        resultadoEl.innerHTML = `
            <div class="visita-item ${!visita.fecha_salida ? 'visita-activa' : 'visita-completada'}">
                <h4> Información del Visitante</h4>
                <div class="visita-header">
                    <strong>${visita.nombre}</strong>
                    <span class="rut">${visita.rut}</span>
                </div>
                <div class="visita-info">
                    <p><strong>Área:</strong> ${visita.area_nombre || (visita.area || 'No especificada')}</p>
                    <p><strong>Fecha de ingreso:</strong> ${visita.fecha_ingreso} ${visita.hora_ingreso}</p>
                    ${visita.fecha_salida ?
                `<p><strong>Fecha de salida:</strong> ${visita.fecha_salida} ${visita.hora_salida}</p>` :
                `<p><strong>Estado:</strong>  Actualmente en el edificio</p>
                         <div class="visita-actions">
                            <button class="btn btn-salida" onclick="app.registrarSalidaDirecta('${visita.rut}', '${visita.nombre.replace(/'/g, "\\'")}')">
                                 Registrar Salida
                            </button>
                         </div>`
            }
                    <p><strong>Registrado el:</strong> ${new Date(visita.created_at).toLocaleString()}</p>
                </div>
            </div>
        `;
    }

    // ===========================================================
    // FUNCIONES DE REPORTES
    // ===========================================================

    // Función para listar reportes existentes
    async listarReportes() {
        this.showLoading(true);

        try {
            const response = await fetch(`${API_BASE}/reportes`);
            const data = await response.json();

            if (response.ok) {
                this.mostrarReportes(data.reportes);
            } else {
                this.showMessage('❌ Error al cargar reportes', 'error');
            }
        } catch (error) {
            this.showMessage('❌ Error de conexión al cargar reportes', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    // Función para mostrar la lista de reportes
    mostrarReportes(reportes) {
        const resultadoEl = document.getElementById('resultado');
        
        if (!reportes || reportes.length === 0) {
            resultadoEl.innerHTML = '<p>No hay reportes generados.</p>';
            return;
        }

        let html = `
            <div class="reportes-container">
                <h3> Reportes Generados (${reportes.length})</h3>
                <div class="reportes-list">
        `;

        html += reportes.map(reporte => `
            <div class="reporte-item">
                <div class="reporte-info">
                    <strong>${reporte.nombre}</strong>
                    <div class="reporte-detalles">
                        <small> Tamaño: ${(reporte.tamaño / 1024).toFixed(2)} KB</small>
                        <small> Generado: ${new Date(reporte.fechaModificacion).toLocaleString()}</small>
                    </div>
                </div>
                <div class="reporte-actions">
                    <button class="btn btn-descargar" onclick="app.descargarReporte('${reporte.nombre}')">
                        Descargar
                    </button>
                    ${this.authRole === 'admin' ? `
                    <button class="btn btn-eliminar" onclick="app.eliminarReporte('${reporte.nombre}')">
                         Eliminar
                    </button>
                    ` : ''}
                </div>
            </div>
        `).join('');

        html += `
                </div>
            </div>
        `;

        resultadoEl.innerHTML = html;
    }

    // Función para descargar reportes
    async descargarReporte(nombreArchivo) {
        try {
            const response = await fetch(`${API_BASE}/descargar-reporte/${encodeURIComponent(nombreArchivo)}`);
            
            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = nombreArchivo;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
                
                this.showMessage(` Reporte "${nombreArchivo}" descargado`, 'success');
            } else {
                this.showMessage('❌ Error al descargar el reporte', 'error');
            }
        } catch (error) {
            console.error('Error al descargar:', error);
            this.showMessage('❌ Error al descargar el reporte', 'error');
        }
    }

    // Función para eliminar reportes
    async eliminarReporte(nombreArchivo) {
        if (!confirm(`¿Estás seguro de eliminar el reporte "${nombreArchivo}"?`)) {
            return;
        }

        try {
            const headers = { 'Content-Type': 'application/json' };
            if (this.authToken) headers['X-Auth-Token'] = this.authToken;

            const response = await fetch(`${API_BASE}/eliminar-reporte/${encodeURIComponent(nombreArchivo)}`, {
                method: 'DELETE', headers
            });

            const data = await response.json();

            if (response.ok) {
                this.showMessage(`Reporte "${nombreArchivo}" eliminado`, 'success');
                // Recargar la lista de reportes
                setTimeout(() => {
                    this.listarReportes();
                }, 1000);
            } else {
                this.showMessage(`❌ Error: ${data.error}`, 'error');
            }
        } catch (error) {
            this.showMessage('❌ Error de conexión', 'error');
        }
    }

    // Función para generar reporte
    async generarReporte() {
        if (!confirm('¿Generar reporte diario y reiniciar la base de datos?\n\nEsta acción exportará todos los registros actuales y limpiará la base de datos.')) {
            return;
        }

        this.showLoading(true);

        try {
            if (!this.authRole || this.authRole !== 'admin') {
                this.showMessage('No autorizado: necesitas iniciar sesión como Administrador para generar reportes', 'error');
                this.showLoading(false);
                return;
            }

            if (!this.authRole || this.authRole !== 'admin') {
                this.showMessage('No autorizado: necesitas iniciar sesión como Administrador para eliminar reportes', 'error');
                return;
            }
            const headers = { 'Content-Type': 'application/json' };
            if (this.authToken) headers['X-Auth-Token'] = this.authToken;

            const response = await fetch(`${API_BASE}/generar-reporte`, {
                method: "POST",
                headers
            });

            const data = await response.json();

            if (response.ok) {
                // Limpiar UI de resultados inmediatamente para indicar historial vaciado
                this.limpiarResultados();
                this.showMessage(` ${data.message} (${data.registros_exportados || data.registros || 0} registros exportados)`, 'success');

                // Recargar la lista de visitas tras un pequeño retraso para reflejar el estado limpio
                setTimeout(() => {
                    this.obtenerVisitas();
                }, 800);
            } else {
                this.showMessage(`❌ ${data.error}`, 'error');
            }
        } catch (error) {
            this.showMessage('❌ Error de conexión con el servidor', 'error');
            console.error("Error al generar reporte:", error);
        } finally {
            this.showLoading(false);
        }
    }

    // ===========================================================
    // FUNCIONES UTILITARIAS
    // ===========================================================

    // Función para calcular tiempo transcurrido
    calcularTiempo(fecha, hora) {
        try {
            const ingreso = new Date(`${fecha}T${hora}`);
            const ahora = new Date();
            const diffMs = ahora - ingreso;
            const diffMins = Math.floor(diffMs / 60000);
            const diffHours = Math.floor(diffMins / 60);
            const mins = diffMins % 60;

            if (diffHours > 0) {
                return `${diffHours}h ${mins}m`;
            }
            return `${mins} minutos`;
        } catch (error) {
            return '--';
        }
    }

    // Función para calcular duración total
    calcularDuracion(fechaInicio, horaInicio, fechaFin, horaFin) {
        try {
            const inicio = new Date(`${fechaInicio}T${horaInicio}`);
            const fin = new Date(`${fechaFin}T${horaFin}`);
            const diffMs = fin - inicio;
            const diffMins = Math.floor(diffMs / 60000);
            const diffHours = Math.floor(diffMins / 60);
            const mins = diffMins % 60;

            if (diffHours > 0) {
                return `${diffHours}h ${mins}m`;
            }
            return `${mins} minutos`;
        } catch (error) {
            return '--';
        }
    }

    toggleSearch() {
        const searchSection = document.getElementById('searchSection');
        searchSection.style.display = searchSection.style.display === 'none' ? 'block' : 'none';
    }

    limpiarResultados() {
        document.getElementById('resultado').innerHTML = '';
    }

    showMessage(message, type = 'info') {
        const resultadoEl = document.getElementById('resultado');
        resultadoEl.innerHTML = `
            <div class="message ${type}">
                ${message}
            </div>
        `;

        setTimeout(() => {
            if (resultadoEl.innerHTML.includes('message')) {
                resultadoEl.innerHTML = '';
            }
        }, 5000);
    }

    // Parte del scanner, por ahora código de pruebas hasta tener pistola
    setupScannerInput() {
        let buffer = '';
        let lastTime = Date.now();

        document.addEventListener('keydown', (e) => {
            const now = Date.now();
            const diff = now - lastTime;

            // Tiempo entre pulsaciones, si es mayor a 100ms se considera un nuevo input
            if (diff > 100) buffer = '';
            lastTime = now;

            if (e.key === 'Enter') {
                const rutInput = document.getElementById('rut');
                rutInput.value = buffer.trim();
                document.getElementById('nombre').focus();
                buffer = '';
            } else if (e.key.length === 1) {
                buffer += e.key;
            }
        });
    }
}

// Hacer la instancia global para que los botones puedan acceder a ella
const app = new VisitasApp();

// También inicializar cuando el DOM esté listo por si acaso
document.addEventListener('DOMContentLoaded', () => {
    window.app = app;
});