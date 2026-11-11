
const {
  getSupabase,
  consultarPagoFlow
} = require("./_shared");

function escapar(texto) {
  return String(texto ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function pagina(titulo, mensaje, detalle = "") {
  return {
    statusCode: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    },
    body: `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport"
        content="width=device-width, initial-scale=1.0">
  <title>${escapar(titulo)}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background: #f7f2e9;
      color: #6f573a;
      font-family: Georgia, "Times New Roman", serif;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .contenedor {
      width: 100%;
      max-width: 560px;
      text-align: center;
      padding: 48px 28px;
      background: #fffdf9;
      border: 1px solid #e7dccd;
    }
    .simbolo {
      font-size: 52px;
      margin-bottom: 18px;
    }
    h1 {
      font-weight: normal;
      font-size: 38px;
      margin: 0 0 22px;
    }
    p {
      font-size: 18px;
      line-height: 1.7;
    }
    .detalle {
      margin-top: 26px;
      font-weight: bold;
    }
    a {
      display: inline-block;
      margin-top: 30px;
      padding: 15px 28px;
      background: #866b47;
      color: white;
      text-decoration: none;
      font-size: 15px;
    }
  </style>
</head>
<body>
  <main class="contenedor">
    <div class="simbolo">🎁</div>
    <h1>${escapar(titulo)}</h1>
    <p>${escapar(mensaje)}</p>
    ${detalle
      ? `<p class="detalle">${escapar(detalle)}</p>`
      : ""}
    <a href="/">Volver a la lista de regalos</a>
  </main>
</body>
</html>`
  };
}

exports.handler = async function (event) {
  try {
    const datos = new URLSearchParams(
      event.body || ""
    );

    const query = new URLSearchParams(
      event.rawQuery || ""
    );

    const token =
      datos.get("token") ||
      query.get("token");

    if (!token) {
      return pagina(
        "No pudimos verificar el pago",
        "Flow no entregó la información necesaria."
      );
    }

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
      return pagina(
        "No pudimos verificar el pago",
        "No encontramos la orden registrada."
      );
    }

    if (
      orden.flow_token !== token ||
      Number(orden.amount) !== Number(pago.amount)
    ) {
      return pagina(
        "No pudimos verificar el pago",
        "La información de la orden no coincide."
      );
    }

    if (Number(pago.status) === 2) {
      const { data: confirmado, error: errorConfirmar } =
        await supabase.rpc("confirm_gift_order", {
          p_order: orden.commerce_order
        });

      if (errorConfirmar || confirmado !== true) {
        console.error(
          "Error registrando pago aprobado:",
          errorConfirmar
        );

        return pagina(
          "Estamos verificando tu regalo",
          "El pago figura aprobado en Flow, pero aún no hemos podido confirmar su registro. Por favor, no vuelvas a pagar."
        );
      }

      const { data: regalo } = await supabase
        .from("gifts")
        .select("name")
        .eq("id", orden.gift_id)
        .single();

      const monto = Number(
        orden.amount
      ).toLocaleString("es-CL");

      return pagina(
        "¡Muchas gracias!",
        "Tu regalo fue recibido correctamente. Gracias por acompañarnos en esta nueva etapa.",
        `${regalo?.name || "Regalo de matrimonio"} — $${monto} CLP`
      );
    }

    return pagina(
      "Pago aún no confirmado",
      "Flow todavía no registra este pago como aprobado. Si realizaste el pago, espera su confirmación antes de volver a intentarlo."
    );

  } catch (error) {
    console.error("Error en resultado:", error);

    return pagina(
      "Estamos verificando tu pago",
      "No pudimos consultar el resultado en este momento. Si ya pagaste, no repitas la operación hasta verificarla."
    );
  }
};
