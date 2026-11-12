"use strict";

(() => {
    // Referencias a elementos del DOM
    const modalAutenticacion = document.getElementById("modal-autenticacion");
    const entradaServidor = document.getElementById("entrada-servidor");
    const entradaIdEquipo = document.getElementById("entrada-id-equipo");
    const listaEquiposNube = document.getElementById("lista-equipos-nube");
    const botonRefrescarEquipos = document.getElementById("boton-refrescar-equipos");
    const entradaUrlNube = document.getElementById("entrada-url-nube");
    const botonGuardarNube = document.getElementById("boton-guardar-nube");
    const listaDireccionesRed = document.getElementById("lista-direcciones-red");
    const entradaClave = document.getElementById("entrada-clave");
    const botonMostrarClave = document.getElementById("boton-mostrar-clave");
    const botonConectar = document.getElementById("boton-conectar");
    const mensajeEstadoAcceso = document.getElementById("mensaje-estado-acceso");

    const barraHud = document.getElementById("barra-hud");
    const botonRestaurarHud = document.getElementById("boton-restaurar-hud");
    const botonMinimizarHud = document.getElementById("boton-minimizar-hud");

    const indicadorEstado = document.getElementById("indicador-estado");
    const indicadorFps = document.getElementById("indicador-fps");
    const indicadorLatencia = document.getElementById("indicador-latencia");
    const indicadorAnchoBanda = document.getElementById("indicador-ancho-banda");
    const indicadorResolucion = document.getElementById("indicador-resolucion");
    const miniFps = document.getElementById("mini-fps");
    const miniLatencia = document.getElementById("mini-latencia");

    const selectorMonitor = document.getElementById("selector-monitor");
    const selectorCalidad = document.getElementById("selector-calidad");
    const selectorEscala = document.getElementById("selector-escala");
    const selectorFps = document.getElementById("selector-fps");

    const botonPortapapeles = document.getElementById("boton-portapapeles");
    const panelPortapapeles = document.getElementById("panel-portapapeles");
    const botonCerrarPortapapeles = document.getElementById("boton-cerrar-portapapeles");
    const areaTextoPortapapeles = document.getElementById("area-texto-portapapeles");
    const botonLeerPortapapeles = document.getElementById("boton-leer-portapapeles");
    const botonEnviarPortapapeles = document.getElementById("boton-enviar-portapapeles");
    const botonEscribirTexto = document.getElementById("boton-escribir-texto");
    const estadoPortapapeles = document.getElementById("estado-portapapeles");

    const botonTeclaWin = document.getElementById("boton-tecla-win");
    const botonCtrlAltSupr = document.getElementById("boton-ctrl-alt-supr");
    const botonPantallaCompleta = document.getElementById("boton-pantalla-completa");
    const botonDesconectar = document.getElementById("boton-desconectar");

    const lienzo = document.getElementById("lienzo-remoto");
    const contexto = lienzo.getContext("2d", { alpha: false });

    // Estado de la sesión remota
    let socket = null;
    let urlWsActual = "";
    let autenticado = false;
    let desconexionManual = false;
    let temporizadorReconexion = null;
    let temporizadorPing = null;
    let temporizadorMetricas = null;

    // Métricas en tiempo real
    let cuadrosRecibidosSegundo = 0;
    let bytesRecibidosSegundo = 0;
    let latenciaActualMs = 0;
    let renderizandoCuadro = false;
    let ultimoEnvioMovimiento = 0;

    // Mapa de respaldo de códigos KeyboardEvent.code a Virtual-Key de Windows
    const MAPA_TECLAS_VK = {
        Backspace: 0x08,
        Tab: 0x09,
        Enter: 0x0D,
        NumpadEnter: 0x0D,
        ShiftLeft: 0x10,
        ShiftRight: 0x10,
        ControlLeft: 0x11,
        ControlRight: 0x11,
        AltLeft: 0x12,
        AltRight: 0x12,
        Pause: 0x13,
        CapsLock: 0x14,
        Escape: 0x1B,
        Space: 0x20,
        PageUp: 0x21,
        PageDown: 0x22,
        End: 0x23,
        Home: 0x24,
        ArrowLeft: 0x25,
        ArrowUp: 0x26,
        ArrowRight: 0x27,
        ArrowDown: 0x28,
        PrintScreen: 0x2C,
        Insert: 0x2D,
        Delete: 0x2E,
        MetaLeft: 0x5B,
        MetaRight: 0x5C,
        ContextMenu: 0x5D,
        F1: 0x70,
        F2: 0x71,
        F3: 0x72,
        F4: 0x73,
        F5: 0x74,
        F6: 0x75,
        F7: 0x76,
        F8: 0x77,
        F9: 0x78,
        F10: 0x79,
        F11: 0x7A,
        F12: 0x7B,
        NumLock: 0x90,
        ScrollLock: 0x91,
        Semicolon: 0xBA,
        Equal: 0xBB,
        Comma: 0xBC,
        Minus: 0xBD,
        Period: 0xBE,
        Slash: 0xBF,
        Backquote: 0xC0,
        BracketLeft: 0xDB,
        Backslash: 0xDC,
        BracketRight: 0xDD,
        Quote: 0xDE
    };

    function obtenerCodigoVK(evento) {
        if (typeof evento.keyCode === "number" && evento.keyCode > 0) {
            return evento.keyCode;
        }
        if (MAPA_TECLAS_VK[evento.code]) {
            return MAPA_TECLAS_VK[evento.code];
        }
        if (evento.code && evento.code.startsWith("Key") && evento.code.length === 4) {
            return evento.code.charCodeAt(3);
        }
        if (evento.code && evento.code.startsWith("Digit") && evento.code.length === 6) {
            return evento.code.charCodeAt(5);
        }
        return 0;
    }

    function actualizarMensajeAcceso(texto, tipo = "") {
        mensajeEstadoAcceso.textContent = texto;
        mensajeEstadoAcceso.className = "mensaje-estado" + (tipo ? ` ${tipo}` : "");
    }

    function actualizarEstadoVisualConexion(conectado) {
        if (conectado) {
            indicadorEstado.textContent = "Conectado";
            indicadorEstado.className = "pildora estado-conectado";
        } else {
            indicadorEstado.textContent = "Desconectado";
            indicadorEstado.className = "pildora estado-desconectado";
        }
    }

    function enviarMensajeJson(objeto) {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(objeto));
        }
    }

    function obtenerUrlWebSocketDestino() {
        const protocoloPorDefecto = window.location.protocol === "https:" ? "wss:" : "ws:";
        let valor = (entradaServidor && entradaServidor.value ? entradaServidor.value : "").trim();
        if (!valor) {
            valor = window.location.host || "localhost:8080";
        }
        if (valor.startsWith("ws://") || valor.startsWith("wss://")) {
            return valor;
        }
        if (valor.startsWith("http://")) {
            return "ws://" + valor.slice(7).replace(/\/+$/, "");
        }
        if (valor.startsWith("https://")) {
            return "wss://" + valor.slice(8).replace(/\/+$/, "");
        }
        valor = valor.replace(/\/+$/, "");
        if (!valor.includes(":") && (valor === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(valor))) {
            valor = `${valor}:8080`;
        }
        return `${protocoloPorDefecto}//${valor}`;
    }

    function renderizarEquiposEnLinea(listaEquipos) {
        if (!listaEquiposNube) return;
        if (!Array.isArray(listaEquipos) || listaEquipos.length === 0) {
            listaEquiposNube.innerHTML = `<span class="texto-vacio-equipos">Ningún equipo registrado aún. Abre Remoto_1_Portable.exe en el PC a controlar.</span>`;
            return;
        }

        if (entradaIdEquipo && !entradaIdEquipo.value.trim()) {
            entradaIdEquipo.value = listaEquipos[0].idEquipo;
            if (listaEquipos[0].urlTunel && entradaServidor && window.location.hostname.endsWith(".vercel.app")) {
                entradaServidor.value = listaEquipos[0].urlTunel;
            }
        }

        const seleccionadoActual = entradaIdEquipo ? entradaIdEquipo.value.trim() : "";
        listaEquiposNube.innerHTML = "";

        listaEquipos.forEach((eq) => {
            const boton = document.createElement("button");
            boton.type = "button";
            boton.className = "tarjeta-equipo-online" + (eq.idEquipo === seleccionadoActual ? " seleccionado" : "");
            boton.innerHTML = `<span class="punto-online"></span><span>${eq.idEquipo}</span><small>(${eq.usuario || "PC"})</small>`;
            boton.addEventListener("click", () => {
                if (entradaIdEquipo) {
                    entradaIdEquipo.value = eq.idEquipo;
                }
                if (eq.urlTunel && entradaServidor && window.location.hostname.endsWith(".vercel.app")) {
                    entradaServidor.value = eq.urlTunel;
                    iniciarConexionWebSocket();
                }
                renderizarEquiposEnLinea(listaEquipos);
                entradaClave.focus();
            });
            listaEquiposNube.appendChild(boton);
        });
    }

    async function cargarInformacionRedLocal() {
        const paramsUrl = new URLSearchParams(window.location.search);
        const apiParam = paramsUrl.get("api") || localStorage.getItem("remoto1_servidor_api") || "";
        if (entradaServidor && !entradaServidor.value) {
            entradaServidor.value = apiParam || window.location.host || "localhost:8080";
        }
        if (!listaDireccionesRed) return;
        try {
            const respuesta = await fetch("/info-red");
            if (!respuesta.ok) {
                listaDireccionesRed.textContent = `${window.location.host || "localhost:8080"}`;
                return;
            }
            const datos = await respuesta.json();
            const lineas = [];
            if (datos.equipo) {
                lineas.push(`<div>• ID Equipo: <strong>${datos.equipo}</strong></div>`);
            }
            if (datos.urlPublica) {
                lineas.push(`<div>• Enlace Nube Directo: <strong>${datos.urlPublica}</strong></div>`);
            }
            if (datos.urlNube) {
                if (entradaUrlNube && !entradaUrlNube.value) {
                    entradaUrlNube.value = datos.urlNube;
                }
                const estadoNube = datos.conectadoANube ? "Conectado a API" : "Conectando...";
                lineas.push(`<div>• API Nube: <strong>${datos.urlNube}</strong> (${estadoNube})</div>`);
            }
            if (Array.isArray(datos.direcciones) && datos.direcciones.length > 0) {
                datos.direcciones.forEach((d) => {
                    lineas.push(`<div>• Red Local (${d.interfaz}): <strong>${d.anfitrion}</strong></div>`);
                });
            }
            listaDireccionesRed.innerHTML = lineas.join("") || `localhost:${datos.puerto || 8080}`;

            if (Array.isArray(datos.equipos)) {
                renderizarEquiposEnLinea(datos.equipos);
            }
        } catch {
            listaDireccionesRed.textContent = window.location.host || "localhost:8080";
        }
    }

    function iniciarConexionWebSocket() {
        if (temporizadorReconexion) {
            clearTimeout(temporizadorReconexion);
            temporizadorReconexion = null;
        }

        const urlWsDestino = obtenerUrlWebSocketDestino();

        if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
            if (urlWsActual === urlWsDestino) {
                return;
            }
            socket.close();
        }

        urlWsActual = urlWsDestino;

        actualizarMensajeAcceso(`Conectando con ${urlWsDestino}...`);
        socket = new WebSocket(urlWsDestino);
        socket.binaryType = "arraybuffer";

        socket.addEventListener("open", () => {
            actualizarMensajeAcceso("Conectado al servidor. Selecciona tu equipo e ingresa la clave.", "exito");
            enviarMensajeJson({ tipo: "listar_equipos" });
            if (entradaClave.value.trim().length > 0) {
                enviarAutenticacion();
            }
        });

        socket.addEventListener("message", (evento) => {
            if (typeof evento.data === "string") {
                procesarMensajeTexto(evento.data);
            } else {
                procesarCuadroBinario(evento.data);
            }
        });

        socket.addEventListener("close", () => {
            autenticado = false;
            actualizarEstadoVisualConexion(false);
            detenerTemporizadoresActivos();
            modalAutenticacion.classList.remove("oculto");

            if (!desconexionManual) {
                actualizarMensajeAcceso("Conexión cerrada. Reintentando en 2 segundos...", "error");
                temporizadorReconexion = setTimeout(iniciarConexionWebSocket, 2000);
            } else {
                actualizarMensajeAcceso("Sesión desconectada manualmente.");
            }
        });

        socket.addEventListener("error", () => {
            actualizarMensajeAcceso("Error de red al comunicar con el agente remoto.", "error");
        });
    }

    function enviarAutenticacion() {
        const clave = entradaClave.value;
        if (!clave) {
            actualizarMensajeAcceso("Por favor ingresa la clave de acceso.", "error");
            entradaClave.focus();
            return;
        }

        const urlWsDeseada = obtenerUrlWebSocketDestino();
        if (!socket || socket.readyState !== WebSocket.OPEN || urlWsActual !== urlWsDeseada) {
            desconexionManual = false;
            iniciarConexionWebSocket();
            return;
        }

        actualizarMensajeAcceso("Verificando clave de acceso...");
        enviarMensajeJson({
            tipo: "autenticar",
            idEquipo: entradaIdEquipo ? entradaIdEquipo.value.trim() : "",
            clave: clave
        });
    }

    function procesarMensajeTexto(datosTexto) {
        let mensaje;
        try {
            mensaje = JSON.parse(datosTexto);
        } catch {
            return;
        }

        switch (mensaje.tipo) {
            case "lista_equipos": {
                if (Array.isArray(mensaje.equipos)) {
                    renderizarEquiposEnLinea(mensaje.equipos);
                }
                break;
            }
            case "autenticado":
            case "autenticacion_resultado":
            case "autenticacion_exitosa":
            case "info_inicial": {
                if (mensaje.exito === false) {
                    actualizarMensajeAcceso(mensaje.mensaje || "Clave de acceso incorrecta.", "error");
                    entradaClave.select();
                    break;
                }
                autenticado = true;
                actualizarEstadoVisualConexion(true);
                modalAutenticacion.classList.add("oculto");
                actualizarMensajeAcceso("Conectado correctamente.", "exito");

                if (Array.isArray(mensaje.monitores)) {
                    poblarSelectorMonitores(mensaje.monitores, mensaje.monitorActual || mensaje.monitor_actual || 0);
                }
                if (mensaje.configuracion) {
                    sincronizarControlesConfiguracion(mensaje.configuracion);
                }

                iniciarTemporizadoresActivos();
                lienzo.focus();
                break;
            }

            case "error_autenticacion":
            case "error": {
                if (!autenticado) {
                    actualizarMensajeAcceso(mensaje.mensaje || "Clave de acceso incorrecta.", "error");
                    entradaClave.select();
                }
                break;
            }

            case "monitores": {
                if (Array.isArray(mensaje.monitores || mensaje.lista)) {
                    poblarSelectorMonitores(mensaje.monitores || mensaje.lista, mensaje.monitorActual || 0);
                }
                break;
            }

            case "pong": {
                const marca = Number(mensaje.marcaTiempo || mensaje.marca_tiempo || 0);
                if (marca > 0) {
                    latenciaActualMs = Math.max(0, Date.now() - marca);
                    indicadorLatencia.textContent = `${latenciaActualMs} ms`;
                    miniLatencia.textContent = `${latenciaActualMs} ms`;
                }
                break;
            }

            case "portapapeles": {
                if (typeof mensaje.texto === "string") {
                    areaTextoPortapapeles.value = mensaje.texto;
                    mostrarEstadoPortapapeles("Portapapeles remoto recibido.");
                }
                break;
            }

            case "configuracion_actualizada": {
                if (mensaje.configuracion) {
                    sincronizarControlesConfiguracion(mensaje.configuracion);
                }
                break;
            }
        }
    }

    function poblarSelectorMonitores(listaMonitores, indiceActivo = 0) {
        selectorMonitor.innerHTML = "";
        listaMonitores.forEach((mon, idx) => {
            const indice = mon.indice !== undefined ? mon.indice : idx;
            const ancho = mon.ancho || mon.width || 0;
            const alto = mon.alto || mon.height || 0;
            const opcion = document.createElement("option");
            opcion.value = String(indice);
            opcion.textContent = ancho && alto
                ? `Monitor ${indice + 1} (${ancho}×${alto})`
                : `Monitor ${indice + 1}`;
            if (Number(indice) === Number(indiceActivo)) {
                opcion.selected = true;
            }
            selectorMonitor.appendChild(opcion);
        });
    }

    function sincronizarControlesConfiguracion(config) {
        if (config.calidad !== undefined) {
            selectorCalidad.value = String(config.calidad);
        }
        if (config.escala !== undefined) {
            selectorEscala.value = String(config.escala);
        }
        if (config.fps !== undefined) {
            selectorFps.value = String(config.fps);
        }
        if (config.monitor !== undefined) {
            selectorMonitor.value = String(config.monitor);
        }
    }

    async function procesarCuadroBinario(bufferBinario) {
        const tamanoBytes = bufferBinario.byteLength || bufferBinario.size || 0;
        bytesRecibidosSegundo += tamanoBytes;
        cuadrosRecibidosSegundo += 1;

        if (renderizandoCuadro) {
            return;
        }
        renderizandoCuadro = true;

        try {
            const blobImagen = bufferBinario instanceof Blob
                ? bufferBinario
                : new Blob([bufferBinario], { type: "image/jpeg" });

            if (typeof createImageBitmap === "function") {
                const mapaBits = await createImageBitmap(blobImagen);
                if (lienzo.width !== mapaBits.width || lienzo.height !== mapaBits.height) {
                    lienzo.width = mapaBits.width;
                    lienzo.height = mapaBits.height;
                    indicadorResolucion.textContent = `${mapaBits.width} × ${mapaBits.height}`;
                }
                contexto.drawImage(mapaBits, 0, 0);
                mapaBits.close();
            } else {
                await dibujarConElementoImagen(blobImagen);
            }
        } catch {
            // Ignorar cuadros corruptos ocasionales
        } finally {
            renderizandoCuadro = false;
        }
    }

    function dibujarConElementoImagen(blobImagen) {
        return new Promise((resolver) => {
            const urlObjeto = URL.createObjectURL(blobImagen);
            const imagen = new Image();
            imagen.onload = () => {
                if (lienzo.width !== imagen.naturalWidth || lienzo.height !== imagen.naturalHeight) {
                    lienzo.width = imagen.naturalWidth;
                    lienzo.height = imagen.naturalHeight;
                    indicadorResolucion.textContent = `${imagen.naturalWidth} × ${imagen.naturalHeight}`;
                }
                contexto.drawImage(imagen, 0, 0);
                URL.revokeObjectURL(urlObjeto);
                resolver();
            };
            imagen.onerror = () => {
                URL.revokeObjectURL(urlObjeto);
                resolver();
            };
            imagen.src = urlObjeto;
        });
    }

    function iniciarTemporizadoresActivos() {
        detenerTemporizadoresActivos();

        temporizadorPing = setInterval(() => {
            if (autenticado) {
                enviarMensajeJson({
                    tipo: "ping",
                    marcaTiempo: Date.now()
                });
            }
        }, 2000);

        temporizadorMetricas = setInterval(() => {
            const fps = cuadrosRecibidosSegundo;
            const kbps = (bytesRecibidosSegundo / 1024).toFixed(1);

            indicadorFps.textContent = `${fps} FPS`;
            miniFps.textContent = `${fps} FPS`;
            indicadorAnchoBanda.textContent = `${kbps} KB/s`;

            cuadrosRecibidosSegundo = 0;
            bytesRecibidosSegundo = 0;
        }, 1000);
    }

    function detenerTemporizadoresActivos() {
        if (temporizadorPing) {
            clearInterval(temporizadorPing);
            temporizadorPing = null;
        }
        if (temporizadorMetricas) {
            clearInterval(temporizadorMetricas);
            temporizadorMetricas = null;
        }
    }

    // Cálculo de coordenadas normalizadas [0.0, 1.0] sobre el área del canvas
    function obtenerCoordenadasNormalizadas(eventoRaton) {
        const rectangulo = lienzo.getBoundingClientRect();
        if (rectangulo.width <= 0 || rectangulo.height <= 0) {
            return { x: 0, y: 0 };
        }
        const x = Math.min(1, Math.max(0, (eventoRaton.clientX - rectangulo.left) / rectangulo.width));
        const y = Math.min(1, Math.max(0, (eventoRaton.clientY - rectangulo.top) / rectangulo.height));
        return {
            x: Number(x.toFixed(4)),
            y: Number(y.toFixed(4))
        };
    }

    function traducirBotonRaton(codigoBoton) {
        switch (codigoBoton) {
            case 0:
                return "izquierdo";
            case 1:
                return "central";
            case 2:
                return "derecho";
            default:
                return "izquierdo";
        }
    }

    // Eventos de ratón sobre el lienzo remoto
    lienzo.addEventListener("mousemove", (evento) => {
        if (!autenticado) return;
        const ahora = performance.now();
        if (ahora - ultimoEnvioMovimiento < 25) {
            return;
        }
        ultimoEnvioMovimiento = ahora;
        const { x, y } = obtenerCoordenadasNormalizadas(evento);
        enviarMensajeJson({
            tipo: "raton_mover",
            x,
            y
        });
    });

    lienzo.addEventListener("mousedown", (evento) => {
        if (!autenticado) return;
        lienzo.focus();
        const { x, y } = obtenerCoordenadasNormalizadas(evento);
        const boton = traducirBotonRaton(evento.button);
        enviarMensajeJson({
            tipo: "raton_boton",
            boton,
            estado: "abajo",
            x,
            y
        });
    });

    lienzo.addEventListener("mouseup", (evento) => {
        if (!autenticado) return;
        const { x, y } = obtenerCoordenadasNormalizadas(evento);
        const boton = traducirBotonRaton(evento.button);
        enviarMensajeJson({
            tipo: "raton_boton",
            boton,
            estado: "arriba",
            x,
            y
        });
    });

    lienzo.addEventListener("dblclick", (evento) => {
        if (!autenticado) return;
        const { x, y } = obtenerCoordenadasNormalizadas(evento);
        enviarMensajeJson({
            tipo: "raton_boton",
            boton: "izquierdo",
            estado: "doble_clic",
            x,
            y
        });
    });

    lienzo.addEventListener("wheel", (evento) => {
        if (!autenticado) return;
        evento.preventDefault();
        enviarMensajeJson({
            tipo: "raton_rueda",
            deltaY: -evento.deltaY
        });
    }, { passive: false });

    lienzo.addEventListener("contextmenu", (evento) => {
        evento.preventDefault();
    });

    // Captura de teclado cuando el usuario no está escribiendo en un campo de formulario
    function focoEnCampoDeEntrada() {
        const elementoActivo = document.activeElement;
        if (!elementoActivo) return false;
        const etiqueta = elementoActivo.tagName;
        return etiqueta === "INPUT" || etiqueta === "TEXTAREA" || etiqueta === "SELECT" || elementoActivo.isContentEditable;
    }

    window.addEventListener("keydown", (evento) => {
        if (!autenticado || focoEnCampoDeEntrada()) {
            return;
        }
        evento.preventDefault();
        const vk = obtenerCodigoVK(evento);
        if (vk > 0) {
            enviarMensajeJson({
                tipo: "tecla",
                vk,
                estado: "abajo"
            });
        }
    });

    window.addEventListener("keyup", (evento) => {
        if (!autenticado || focoEnCampoDeEntrada()) {
            return;
        }
        evento.preventDefault();
        const vk = obtenerCodigoVK(evento);
        if (vk > 0) {
            enviarMensajeJson({
                tipo: "tecla",
                vk,
                estado: "arriba"
            });
        }
    });

    // Controles de la barra HUD
    function enviarConfiguracionActual() {
        if (!autenticado) return;
        enviarMensajeJson({
            tipo: "configurar",
            monitor: Number(selectorMonitor.value),
            calidad: Number(selectorCalidad.value),
            escala: Number(selectorEscala.value),
            fps: Number(selectorFps.value)
        });
    }

    selectorMonitor.addEventListener("change", enviarConfiguracionActual);
    selectorCalidad.addEventListener("change", enviarConfiguracionActual);
    selectorEscala.addEventListener("change", enviarConfiguracionActual);
    selectorFps.addEventListener("change", enviarConfiguracionActual);

    // Teclas especiales rápidas
    botonTeclaWin.addEventListener("click", () => {
        if (!autenticado) return;
        enviarMensajeJson({ tipo: "tecla", vk: 0x5B, estado: "abajo" });
        setTimeout(() => {
            enviarMensajeJson({ tipo: "tecla", vk: 0x5B, estado: "arriba" });
        }, 60);
        lienzo.focus();
    });

    botonCtrlAltSupr.addEventListener("click", () => {
        if (!autenticado) return;
        // Envía Ctrl+Shift+Esc (Administrador de tareas) y evento especial por si el agente lo maneja
        enviarMensajeJson({ tipo: "tecla", vk: 0x11, estado: "abajo" }); // Ctrl
        enviarMensajeJson({ tipo: "tecla", vk: 0x10, estado: "abajo" }); // Shift
        enviarMensajeJson({ tipo: "tecla", vk: 0x1B, estado: "abajo" }); // Esc
        setTimeout(() => {
            enviarMensajeJson({ tipo: "tecla", vk: 0x1B, estado: "arriba" });
            enviarMensajeJson({ tipo: "tecla", vk: 0x10, estado: "arriba" });
            enviarMensajeJson({ tipo: "tecla", vk: 0x11, estado: "arriba" });
        }, 80);
        lienzo.focus();
    });

    // Portapapeles y envío de texto directo
    function mostrarEstadoPortapapeles(mensaje) {
        estadoPortapapeles.textContent = mensaje;
    }

    botonPortapapeles.addEventListener("click", () => {
        panelPortapapeles.classList.toggle("oculto");
        if (!panelPortapapeles.classList.contains("oculto")) {
            areaTextoPortapapeles.focus();
        }
    });

    botonCerrarPortapapeles.addEventListener("click", () => {
        panelPortapapeles.classList.add("oculto");
        lienzo.focus();
    });

    botonLeerPortapapeles.addEventListener("click", () => {
        if (!autenticado) return;
        mostrarEstadoPortapapeles("Solicitando portapapeles remoto...");
        enviarMensajeJson({
            tipo: "portapapeles_leer"
        });
    });

    botonEnviarPortapapeles.addEventListener("click", () => {
        if (!autenticado) return;
        enviarMensajeJson({
            tipo: "portapapeles_escribir",
            texto: areaTextoPortapapeles.value
        });
        mostrarEstadoPortapapeles("Texto copiado al portapapeles remoto.");
    });

    botonEscribirTexto.addEventListener("click", () => {
        if (!autenticado) return;
        const texto = areaTextoPortapapeles.value;
        if (!texto) {
            mostrarEstadoPortapapeles("Escribe algún texto primero.");
            return;
        }
        enviarMensajeJson({
            tipo: "texto",
            texto: texto
        });
        mostrarEstadoPortapapeles("Texto enviado para escritura directa.");
    });

    // Pantalla completa
    botonPantallaCompleta.addEventListener("click", () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
        } else {
            document.exitFullscreen().catch(() => {});
        }
        lienzo.focus();
    });

    // Minimizar y restaurar barra superior flotante
    botonMinimizarHud.addEventListener("click", () => {
        barraHud.classList.add("oculto");
        botonRestaurarHud.classList.remove("oculto");
        lienzo.focus();
    });

    botonRestaurarHud.addEventListener("click", () => {
        botonRestaurarHud.classList.add("oculto");
        barraHud.classList.remove("oculto");
        lienzo.focus();
    });

    // Desconexión manual
    botonDesconectar.addEventListener("click", () => {
        desconexionManual = true;
        autenticado = false;
        if (socket) {
            socket.close();
        }
        actualizarEstadoVisualConexion(false);
        modalAutenticacion.classList.remove("oculto");
        actualizarMensajeAcceso("Sesión desconectada. Ingresa la clave para reconectar.");
    });

    // Eventos del modal de autenticación
    botonConectar.addEventListener("click", () => {
        desconexionManual = false;
        enviarAutenticacion();
    });

    entradaClave.addEventListener("keydown", (evento) => {
        if (evento.key === "Enter") {
            evento.preventDefault();
            desconexionManual = false;
            enviarAutenticacion();
        }
    });

    botonMostrarClave.addEventListener("click", () => {
        const esPassword = entradaClave.type === "password";
        entradaClave.type = esPassword ? "text" : "password";
        botonMostrarClave.textContent = esPassword ? "Ocultar" : "Ver";
    });

    if (entradaServidor) {
        entradaServidor.addEventListener("change", () => {
            localStorage.setItem("remoto1_servidor_api", entradaServidor.value.trim());
            iniciarConexionWebSocket();
        });
        entradaServidor.addEventListener("keydown", (evento) => {
            if (evento.key === "Enter") {
                evento.preventDefault();
                localStorage.setItem("remoto1_servidor_api", entradaServidor.value.trim());
                desconexionManual = false;
                enviarAutenticacion();
            }
        });
    }

    if (entradaIdEquipo) {
        entradaIdEquipo.addEventListener("keydown", (evento) => {
            if (evento.key === "Enter") {
                evento.preventDefault();
                desconexionManual = false;
                enviarAutenticacion();
            }
        });
    }

    if (botonRefrescarEquipos) {
        botonRefrescarEquipos.addEventListener("click", () => {
            cargarInformacionRedLocal();
            enviarMensajeJson({ tipo: "listar_equipos" });
        });
    }

    if (botonGuardarNube && entradaUrlNube) {
        botonGuardarNube.addEventListener("click", async () => {
            const urlNube = entradaUrlNube.value.trim();
            try {
                const resp = await fetch("/api/configurar-nube", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ urlNube })
                });
                const resJson = await resp.json();
                if (resJson.exito) {
                    actualizarMensajeAcceso(`Equipo vinculado con API en la nube: ${urlNube || "(desactivado)"}`, "exito");
                    setTimeout(cargarInformacionRedLocal, 1200);
                }
            } catch {
                actualizarMensajeAcceso("No se pudo guardar la URL de nube en el agente local.", "error");
            }
        });
    }

    // Cargar direcciones de red e iniciar conexión al cargar la página
    cargarInformacionRedLocal();
    setInterval(cargarInformacionRedLocal, 6000);
    iniciarConexionWebSocket();
})();
