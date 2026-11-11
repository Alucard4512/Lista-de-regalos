
const {
  getSupabase,
  consultarPagoFlow
} = require("./_shared");

function responder(statusCode, mensaje) {
  return {
    statusCode,
    headers: {
      "Content-Type": "text/plain; charset=utf-8"
    },
    body: mensaje
  };
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return responder(405, "Método no permitido");
  }

  try {
    const datos = new URLSearchParams(
      event.body || ""
    );

    const token = datos.get("token");

    if (!token) {
      return responder(400, "Falta token");
    }

    // Nunca confiamos en un estado enviado
    // directamente por el navegador o por terceros.
    // Consultamos el pago en la API de Flow.
    const pago = await consultarPagoFlow(token);

    const supabase = getSupabase();

    const { data: orden, error } = await supabase
      .from("gift_orders")
      .select(
        "commerce_order, gift_id, amount, flow_token, status"
      )
      .eq("commerce_order", pago.commerceOrder)
      .single();

    if (error || !orden) {
      console.error("Orden no encontrada");
      return responder(500, "Orden no encontrada");
    }

    // Comprobamos que la confirmación corresponde
    // exactamente a la orden que creamos.
    if (
      orden.flow_token !== token ||
      Number(orden.amount) !== Number(pago.amount)
    ) {
      console.error(
        "No coinciden token o monto de la orden"
      );
      return responder(400, "Datos de pago no coinciden");
    }

    if (Number(pago.status) === 2) {
      const { data: confirmado, error: errorConfirmar } =
        await supabase.rpc("confirm_gift_order", {
          p_order: orden.commerce_order
        });

      if (errorConfirmar || confirmado !== true) {
        console.error(
          "Error confirmando regalo:",
          errorConfirmar
        );
        return responder(
          500,
          "No se pudo confirmar el regalo"
        );
      }

      console.log(
        "Pago aprobado:",
        orden.commerce_order
      );

      return responder(200, "OK");
    }

    // Un pago pendiente NO es un pago rechazado.
    // No liberamos la reserva prematuramente.
    console.log(
      "Pago sin aprobación todavía:",
      orden.commerce_order,
      "Estado:",
      pago.status
    );

    return responder(200, "Estado recibido");

  } catch (error) {
    console.error(
      "Error verificando confirmación Flow:",
      error
    );

    // Flow podrá reintentar una notificación
    // que no se haya procesado correctamente.
    return responder(500, "Error de verificación");
  }
};
