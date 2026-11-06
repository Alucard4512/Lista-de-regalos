
document.addEventListener("DOMContentLoaded", () => {

    // ==========================================
    // ELEMENTOS DEL FORMULARIO
    // ==========================================

    const modal = document.getElementById("modalRegalo");
    const cerrarModal = document.getElementById("cerrarModal");
    const modalNombre = document.getElementById("modalNombre");
    const modalPrecio = document.getElementById("modalPrecio");
    const formPago = document.getElementById("formPago");
    const correoInvitado = document.getElementById("correoInvitado");
    const mensajePago = document.getElementById("mensajePago");
    const campoMontoEspecial = document.getElementById("campoMontoEspecial");
    const montoEspecial = document.getElementById("montoEspecial");

    let regaloSeleccionado = null;
    let estadosRegalos = {};

    // ==========================================
    // COMPROBAR ELEMENTOS
    // ==========================================

    const elementos = {
        modalRegalo: modal,
        cerrarModal,
        modalNombre,
        modalPrecio,
        formPago,
        correoInvitado,
        mensajePago,
        campoMontoEspecial,
        montoEspecial
    };

    const faltantes = Object.entries(elementos)
        .filter(([nombre, elemento]) => !elemento)
        .map(([nombre]) => nombre);

    if (faltantes.length > 0) {
        console.error(
            "Faltan elementos en Lista.html:",
            faltantes.join(", ")
        );
        return;
    }

    console.log("Sistema de regalos iniciado correctamente.");

    // ==========================================
    // FORMATEAR PRECIOS
    // ==========================================

    function formatearPrecio(valor) {
        return new Intl.NumberFormat("es-CL", {
            style: "currency",
            currency: "CLP",
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(valor);
    }

    // ==========================================
    // CONSULTAR REGALOS
    // ==========================================

    async function cargarEstadoRegalos() {
        try {
            const respuesta = await fetch("/api/regalos", {
                cache: "no-store"
            });

            if (!respuesta.ok) {
                throw new Error("No se pudo consultar la lista de regalos.");
            }

            estadosRegalos = await respuesta.json();

            actualizarTarjetas();

        } catch (error) {
            console.error("Error cargando regalos:", error);
        }
    }

    // ==========================================
    // ACTUALIZAR TARJETAS
    // ==========================================

    function actualizarTarjetas() {
        document.querySelectorAll(".regalo").forEach(tarjeta => {

            const id = tarjeta.dataset.id;
            const boton = tarjeta.querySelector(".btn-regalar");

            if (!id || !boton) return;

            if (id === "regalo-especial") {
                tarjeta.classList.remove("regalado");
                boton.disabled = false;
                boton.textContent = "Elegir monto";
                boton.classList.remove("btn-regalado");
                return;
            }

            const datos = estadosRegalos[id];

            if (!datos) {
                console.warn("Regalo no encontrado en regalos.json:", id);
                return;
            }

            if (datos.estado === "regalado") {
                tarjeta.classList.add("regalado");
                boton.disabled = true;
                boton.textContent = "✓ Ya fue regalado";
                boton.classList.add("btn-regalado");
            } else {
                tarjeta.classList.remove("regalado");
                boton.disabled = false;
                boton.textContent = "Regalar";
                boton.classList.remove("btn-regalado");
            }
        });
    }

    // ==========================================
    // COMPROBAR DISPONIBILIDAD
    // ==========================================

    async function regaloDisponible(id) {

        if (id === "regalo-especial") {
            return true;
        }

        try {
            const respuesta = await fetch("/api/regalos", {
                cache: "no-store"
            });

            if (!respuesta.ok) {
                throw new Error("No se pudo verificar el regalo.");
            }

            estadosRegalos = await respuesta.json();
            actualizarTarjetas();

            const regalo = estadosRegalos[id];

            if (!regalo) {
                throw new Error(
                    "Este regalo no está registrado en el servidor."
                );
            }

            return regalo.estado === "disponible";

        } catch (error) {
            console.error("Error comprobando regalo:", error);
            throw error;
        }
    }

    // ==========================================
    // ABRIR FORMULARIO DE REGALO
    // ==========================================

    document.addEventListener("click", async evento => {

        const boton = evento.target.closest(".btn-regalar");

        if (!boton || boton.disabled) return;

        const tarjeta = boton.closest(".regalo");

        if (!tarjeta) return;

        const id = tarjeta.dataset.id;

        if (!id) {
            console.error("La tarjeta no tiene data-id.");
            return;
        }

        boton.disabled = true;

        try {
            const disponible = await regaloDisponible(id);

            if (!disponible) {
                alert("Este regalo ya no está disponible.");
                return;
            }

            const nombre = tarjeta.querySelector("h3")
                ?.textContent.trim() || "Regalo";

            const esEspecial =
                id === "regalo-especial" ||
                tarjeta.dataset.especial === "true";

            const precio = esEspecial
                ? null
                : Number(tarjeta.dataset.precio);

            if (!esEspecial && (!Number.isInteger(precio) || precio <= 0)) {
                throw new Error("El precio del regalo no es válido.");
            }

            regaloSeleccionado = {
                id,
                nombre,
                precio,
                esEspecial
            };

            modalNombre.textContent = nombre;

            if (esEspecial) {
                modalPrecio.textContent = "Monto libre";
                campoMontoEspecial.classList.add("activo");
                campoMontoEspecial.style.display = "block";
                montoEspecial.value = "";
            } else {
                modalPrecio.textContent = formatearPrecio(precio);
                campoMontoEspecial.classList.remove("activo");
                campoMontoEspecial.style.display = "none";
                montoEspecial.value = "";
            }

            correoInvitado.value = "";
            mensajePago.textContent = "";

            modal.classList.add("activo");
            modal.style.visibility = "visible";
            modal.style.opacity = "1";
            modal.style.pointerEvents = "auto";

            document.body.style.overflow = "hidden";

            setTimeout(() => correoInvitado.focus(), 200);

            console.log("Formulario abierto para:", id);

        } catch (error) {
            console.error("Error abriendo formulario:", error);
            alert(error.message || "No se pudo abrir el formulario.");
        } finally {
            if (!tarjeta.classList.contains("regalado")) {
                boton.disabled = false;
            }
        }
    });

    // ==========================================
    // CERRAR FORMULARIO
    // ==========================================

    function cerrarVentana() {
        modal.classList.remove("activo");

        modal.style.visibility = "";
        modal.style.opacity = "";
        modal.style.pointerEvents = "";

        document.body.style.overflow = "";

        mensajePago.textContent = "";
        regaloSeleccionado = null;
    }

    cerrarModal.addEventListener("click", cerrarVentana);

    modal.addEventListener("click", evento => {
        if (evento.target === modal) {
            cerrarVentana();
        }
    });

    document.addEventListener("keydown", evento => {
        if (
            evento.key === "Escape" &&
            modal.classList.contains("activo")
        ) {
            cerrarVentana();
        }
    });

    // ==========================================
    // ACTUALIZAR MONTO ESPECIAL
    // ==========================================

    montoEspecial.addEventListener("input", () => {

        if (!regaloSeleccionado?.esEspecial) return;

        const monto = Number(montoEspecial.value);

        modalPrecio.textContent = monto > 0
            ? formatearPrecio(monto)
            : "Monto libre";
    });

    // ==========================================
    // VALIDAR CORREO
    // ==========================================

    function emailValido(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    // ==========================================
    // ENVIAR PAGO A FLOW
    // ==========================================

    formPago.addEventListener("submit", async evento => {

        evento.preventDefault();

        if (!regaloSeleccionado) {
            mensajePago.textContent =
                "Primero debes seleccionar un regalo.";
            return;
        }

        const botonPago = formPago.querySelector(
            ".btn-flow, button[type='submit']"
        );

        if (!botonPago) {
            console.error("No se encontró el botón de pago.");
            mensajePago.textContent =
                "No se encontró el botón para continuar.";
            return;
        }

        const correo = correoInvitado.value.trim();

        if (!emailValido(correo)) {
            mensajePago.textContent =
                "Ingresa un correo electrónico válido.";
            correoInvitado.focus();
            return;
        }

        let montoFinal;

        if (regaloSeleccionado.esEspecial) {
            montoFinal = Number(montoEspecial.value);

            if (!Number.isInteger(montoFinal) || montoFinal < 1000) {
                mensajePago.textContent =
                    "El monto mínimo del regalo especial es $1.000.";
                montoEspecial.focus();
                return;
            }
        } else {
            montoFinal = regaloSeleccionado.precio;
        }

        const datosPago = {
            regaloId: regaloSeleccionado.id,
            monto: montoFinal,
            correo
        };

        botonPago.disabled = true;
        botonPago.textContent = "Preparando pago...";
        mensajePago.textContent = "Conectando con Flow...";

        try {
            const disponible = await regaloDisponible(
                regaloSeleccionado.id
            );

            if (!disponible) {
                mensajePago.textContent =
                    "Este regalo ya fue elegido por otra persona.";
                return;
            }

            console.log("Solicitando pago para:", datosPago.regaloId);

            const respuesta = await fetch("/api/crear-pago", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(datosPago)
            });

            const tipoRespuesta =
                respuesta.headers.get("content-type") || "";

            if (!tipoRespuesta.includes("application/json")) {
                throw new Error(
                    "El servidor no devolvió una respuesta válida."
                );
            }

            const resultado = await respuesta.json();

            if (respuesta.status === 409) {
                await cargarEstadoRegalos();
                throw new Error(
                    "Este regalo acaba de ser elegido por otra persona."
                );
            }

            if (!respuesta.ok) {
                throw new Error(
                    resultado.error ||
                    "No se pudo crear el pago."
                );
            }

            if (!resultado.checkoutUrl) {
                throw new Error(
                    "Flow no entregó el enlace de pago."
                );
            }

            const urlPago = new URL(
                resultado.checkoutUrl,
                window.location.origin
            );

            if (!["https:", "http:"].includes(urlPago.protocol)) {
                throw new Error("El enlace de pago no es válido.");
            }

            mensajePago.textContent =
                "Redirigiendo a Flow...";

            window.location.assign(urlPago.href);

        } catch (error) {
            console.error("Error creando pago:", error);

            mensajePago.textContent =
                error.message ||
                "Ocurrió un problema al conectar con Flow.";

        } finally {
            botonPago.disabled = false;
            botonPago.textContent = "Pagar con Flow";
        }
    });

    // ==========================================
    // CARGAR ESTADOS AL INICIAR
    // ==========================================

    cargarEstadoRegalos();

});
