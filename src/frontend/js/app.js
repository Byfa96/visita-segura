const API_BASE = 'http://localhost:3000/api';

class VisitasApp {
    constructor() {
        this.init();
        this.setupEventListeners();
        this.checkConnection();
    }

    init() {
        console.log('Aplicación de Registro de Visitas iniciada');
    }

    setupEventListeners() {
        // Registrar ingreso
        document.getElementById('formIngreso').addEventListener('submit', (e) => {
            e.preventDefault();
            this.registrarIngreso();
        });

        // Registrar salida (por rut)
        document.getElementById('btnSalida').addEventListener('click', () => {
            this.registrarSalida();
        });

        // Ver todas las visitas
        document.getElementById('btnVisitas').addEventListener('click', () => {
            this.obtenerVisitas();
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
    }

    async checkConnection() {
        try {
            const response = await fetch(`${API_BASE.replace('/api', '')}/health`);
            if (response.ok) {
                this.updateStatus('Conectado ', 'success');
            }
        } catch (error) {
            this.updateStatus('Error de conexión ', 'error');
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

        if (!rut || !nombre) {
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
                body: JSON.stringify({ rut, nombre })
            });

            const data = await response.json();

            if (response.ok) {
                this.showMessage(` Ingreso registrado: ${nombre} (${rut})`, 'success');
                document.getElementById('formIngreso').reset();
                
                // Recargar automáticamente la lista de visitas
                setTimeout(() => {
                    this.obtenerVisitas();
                }, 1000);
                
                if (window.electronAPI) {
                    window.electronAPI.showDialog(`Ingreso registrado para ${nombre}`);
                }
            } else {
                this.showMessage(` Error: ${data.error}`, 'error');
            }
        } catch (error) {
            this.showMessage(' Error de conexión con el servidor', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async registrarSalida() {
        const rut = document.getElementById('rutSalida').value.trim();

        if (!rut) {
            this.showMessage('Por favor ingrese un RUT', 'error');
            return;
        }

        this.showLoading(true);

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
                this.showMessage(` Salida registrada para RUT: ${rut}`, 'success');
                document.getElementById('rutSalida').value = '';
                
                // Recargar automáticamente la lista de visitas
                setTimeout(() => {
                    this.obtenerVisitas();
                }, 1000);
                
                if (window.electronAPI) {
                    window.electronAPI.showDialog(`Salida registrada para ${rut}`);
                }
            } else {
                this.showMessage(` Error: ${data.error}`, 'error');
            }
        } catch (error) {
            this.showMessage(' Error de conexión con el servidor', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    //  Registrar salida directamente desde el botón
    async registrarSalidaDirecta(rut, nombre) {
        if (!confirm(`¿Registrar salida de ${nombre} (${rut})?`)) {
            return;
        }

        this.showLoading(true);

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
                this.showMessage(` Error: ${data.error}`, 'error');
            }
        } catch (error) {
            this.showMessage(' Error de conexión con el servidor', 'error');
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
                this.showMessage(' Error al obtener visitas', 'error');
            }
        } catch (error) {
            this.showMessage(' Error de conexión con el servidor', 'error');
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
                this.showMessage(` ${data.error}`, 'error');
            }
        } catch (error) {
            this.showMessage(' Error de conexión con el servidor', 'error');
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
                    <h3> Total</h3>
                    <span class="stat-number">${visitas.length}</span>
                </div>
            </div>
        `;

        // Mostrar visitas activas primero con botones de salida
        if (visitasActivas.length > 0) {
            html += `<h3> Visitantes Actualmente en la Sede </h3>`;
            html += visitasActivas.map(visita => `
                <div class="visita-item visita-activa">
                    <div class="visita-header">
                        <strong>${visita.nombre}</strong>
                        <span class="rut">${visita.rut}</span>
                    </div>
                    <div class="visita-info">
                        <small> Ingreso: ${visita.fecha_ingreso} ${visita.hora_ingreso}</small>
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
                        <small> Salida: ${visita.fecha_salida} ${visita.hora_salida}</small>
                        <br>
                        <small>⏱ Duración: ${this.calcularDuracion(visita.fecha_ingreso, visita.hora_ingreso, visita.fecha_salida, visita.hora_salida)}</small>
                    </div>
                </div>
            `).join('');
        }

        resultadoEl.innerHTML = html;
    }

    mostrarVisitaIndividual(visita) {
        const resultadoEl = document.getElementById('resultado');
        
        if (!visita) {
            resultadoEl.innerHTML = '<p>No se encontró el visitante</p>';
            return;
        }

        resultadoEl.innerHTML = `
            <div class="visita-item ${!visita.fecha_salida ? 'visita-activa' : 'visita-completada'}">
                <h4>Información del Visitante</h4>
                <div class="visita-header">
                    <strong>${visita.nombre}</strong>
                    <span class="rut">${visita.rut}</span>
                </div>
                <div class="visita-info">
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
}

// Hacer la instancia global para que los botones puedan acceder a ella
const app = new VisitasApp();

// También inicializar cuando el DOM esté listo por si acaso
document.addEventListener('DOMContentLoaded', () => {
    window.app = app;
});