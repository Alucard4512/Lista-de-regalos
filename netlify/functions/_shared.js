
const { createClient } = require("@supabase/supabase-js");
const crypto = require("node:crypto");

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Falta configurar Supabase en Netlify.");
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

function getFlowConfig() {
  const apiKey = process.env.FLOW_API_KEY;
  const secretKey = process.env.FLOW_SECRET_KEY;

  if (!apiKey || !secretKey) {
    throw new Error("Faltan las credenciales de Flow.");
  }

  return {
    apiKey,
    secretKey,
    apiUrl:
      process.env.FLOW_API_URL ||
      "https://sandbox.flow.cl/api",
    baseUrl:
      process.env.BASE_URL ||
      "https://listaregalos.netlify.app"
  };
}

function firmarFlow(params, secretKey) {
  const texto = Object.keys(params)
    .sort()
    .map((clave) => clave + String(params[clave]))
    .join("");

  return crypto
    .createHmac("sha256", secretKey)
    .update(texto)
    .digest("hex");
}

async function consultarPagoFlow(token) {
  const config = getFlowConfig();

  const params = {
    apiKey: config.apiKey,
    token
  };

  params.s = firmarFlow(params, config.secretKey);

  const query = new URLSearchParams(params).toString();

  const respuesta = await fetch(
    `${config.apiUrl}/payment/getStatus?${query}`
  );

  if (!respuesta.ok) {
    throw new Error("No se pudo consultar el pago en Flow.");
  }

  return respuesta.json();
}

function responderJSON(statusCode, datos) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify(datos)
  };
}

module.exports = {
  getSupabase,
  getFlowConfig,
  firmarFlow,
  consultarPagoFlow,
  responderJSON
};
