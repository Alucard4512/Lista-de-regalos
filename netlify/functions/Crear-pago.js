
const crypto = require("node:crypto");

const {
  getSupabase,
  getFlowConfig,
  firmarFlow,
  responderJSON
} = require("./_shared");

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return responderJSON(405, {
      error: "Método no permitido"
    });
  }

  let commerceOrder = null;
  let supabase = null;

  try {
    const datos = JSON.parse(event.body || "{}");

    const regaloId = String(datos.regaloId || "").trim();
    const correo = String(datos.correo || "").trim();
    const montoSolicitado = Number(datos.monto);

    if (!regaloId || !correo) {
      return responderJSON(400, {
        error: "Faltan datos para crear el pago."
      });
    }

    if (
      correo.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)
    ) {
      return responderJSON(400, {
        error: "Ingresa un correo electrónico válido."
      });
    }

    supabase = getSupabase();
    const flow = getFlowConfig();

    // El precio se consulta desde Supabase,
    // nunca se acepta el precio del navegador
    // para las experiencias normales.
    const { data: regalo, error: errorRegalo } =
      await supabase
        .from("gifts")
        .select("id, name, price, status")
        .eq("id", regaloId)
        .single();

    if (errorRegalo || !regalo) {
      return responderJSON(404, {
        error: "El regalo seleccionado no existe."
      });
    }

    if (
      regaloId !== "regalo-especial" &&
      regalo.status !== "available"
    ) {
      return responderJSON(409, {
        error: "Esta experiencia ya no está disponible."
      });
    }

    const monto =
      regaloId === "regalo-especial"
        ? montoSolicitado
        : Number(regalo.price);

    if (
      !Number.isSafeInteger(monto) ||
      monto < 1000 ||
      monto > 1000000
    ) {
      return responderJSON(400, {
        error: "El monto del regalo no es válido."
      });
    }

    commerceOrder =
      `${regaloId}-${crypto.randomUUID()}`;

    // Reserva atómica mediante la función SQL.
    const { data: reservado, error: errorReserva } =
      await supabase.rpc("reserve_gift", {
        p_gift_id: regaloId,
        p_order: commerceOrder,
        p_amount: monto,
        p_email: correo
      });

    if (errorReserva) {
      console.error("Error reservando:", errorReserva);
      commerceOrder = null;
      return responderJSON(500, {
        error: "No se pudo reservar el regalo."
      });
    }

    if (reservado !== true) {
      commerceOrder = null;
      return responderJSON(409, {
        error: "La experiencia ya está reservada o regalada."
      });
    }

    const params = {
      apiKey: flow.apiKey,
      commerceOrder,
      subject: `Regalo matrimonio - ${regalo.name}`,
      currency: "CLP",
      amount: monto,
      email: correo,
      urlConfirmation:
        `${flow.baseUrl}/api/flow-confirmacion`,
      urlReturn:
        `${flow.baseUrl}/resultado`
    };

    params.s = firmarFlow(params, flow.secretKey);

    const respuesta = await fetch(
      `${flow.apiUrl}/payment/create`,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams(params).toString()
      }
    );

    const resultado = await respuesta.json();

    if (
      !respuesta.ok ||
      !resultado.url ||
      !resultado.token
    ) {
      throw new Error(
        "Flow no pudo crear el pago."
      );
    }

    // Guardamos el token de Flow para poder
    // verificar posteriormente la misma orden.
    const { error: errorGuardar } = await supabase
      .from("gift_orders")
      .update({
        flow_token: resultado.token,
        flow_order: String(resultado.flowOrder || "")
      })
      .eq("commerce_order", commerceOrder)
      .eq("status", "pending");

    if (errorGuardar) {
      // No liberamos automáticamente una orden
      // cuyo pago ya fue creado en Flow.
      console.error(
        "Pago creado, pero no se guardó su token:",
        errorGuardar
      );

      return responderJSON(500, {
        error:
          "El pago fue creado, pero no pudimos completar su registro. Contacta a los novios antes de reintentar."
      });
    }

    return responderJSON(200, {
      ok: true,
      checkoutUrl:
        `${resultado.url}${resultado.url.includes("?") ? "&" : "?"}` +
        new URLSearchParams({
          token: resultado.token
        }).toString(),
      commerceOrder,
      flowOrder: resultado.flowOrder
    });

  } catch (error) {
    console.error("Error creando pago:", error);

    // Solo liberamos automáticamente cuando
    // no se ha confirmado la creación del pago.
    // La conciliación de errores inciertos
    // se realizará antes de producción.
    if (commerceOrder && supabase) {
      console.error(
        "Revisar orden pendiente:",
        commerceOrder
      );
    }

    return responderJSON(500, {
      error:
        "No se pudo iniciar el pago. Inténtalo más tarde."
    });
  }
};
