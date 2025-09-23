const API_BASE = 'http://localhost:3000/api';

class VisitasApp {
    constructor() {
        this.init();
        this.setupEventListeners();
        this.checkConnection();
    }

    init() {
        console.log(' Aplicación de Registro de Visitas iniciada');
    }

    setupEventListeners() {
        // Registrar ingreso
        document.getElementById('formIngreso').addEventListener('submit', (e) => {
            e.preventDefault();
            this.registrarIngreso();
        });

        // Registrar salida
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

    mostrarVisitas(visitas) {
        const resultadoEl = document.getElementById('resultado');
        
        if (!visitas || visitas.length === 0) {
            resultadoEl.innerHTML = '<p>No hay visitas registradas</p>';
            return;
        }

        const html = `
            <h3>📊 Total de visitas: ${visitas.length}</h3>
            ${visitas.map(visita => `
                <div class="visita-item ${!visita.fecha_salida ? 'visita-activa' : 'visita-completada'}">
                    <strong>${visita.nombre}</strong> (${visita.rut})<br>
                    <small>Ingreso: ${visita.fecha_ingreso} ${visita.hora_ingreso}</small>
                    ${visita.fecha_salida ? 
                        `<br><small>Salida: ${visita.fecha_salida} ${visita.hora_salida}</small>` : 
                        '<br><em> Visitante actualmente en el edificio</em>'
                    }
                </div>
            `).join('')}
        `;

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
                <h4>👤 Información del Visitante</h4>
                <p><strong>Nombre:</strong> ${visita.nombre}</p>
                <p><strong>RUT:</strong> ${visita.rut}</p>
                <p><strong>Fecha de ingreso:</strong> ${visita.fecha_ingreso} ${visita.hora_ingreso}</p>
                ${visita.fecha_salida ? 
                    `<p><strong>Fecha de salida:</strong> ${visita.fecha_salida} ${visita.hora_salida}</p>` : 
                    '<p><strong>Estado:</strong>  Actualmente en el edificio</p>'
                }
                <p><strong>Registrado el:</strong> ${new Date(visita.created_at).toLocaleString()}</p>
            </div>
        `;
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

// Inicializar la aplicación cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    new VisitasApp();
});