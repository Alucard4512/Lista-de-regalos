
const { createClient } = require("@supabase/supabase-js");

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      body: JSON.stringify({
        error: "Método no permitido"
      })
    };
  }

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false
        }
      }
    );

    const { data, error } = await supabase
      .from("gifts")
      .select("id, name, price, status")
      .order("id");

    if (error) {
      throw error;
    }

    const regalos = {};

    for (const regalo of data) {
      regalos[regalo.id] = {
        nombre: regalo.name,
        precio: regalo.price,
        estado:
          regalo.status === "gifted"
            ? "regalado"
            : regalo.status === "pending"
              ? "reservado"
              : "disponible"
      };
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      },
      body: JSON.stringify(regalos)
    };

  } catch (error) {
    console.error("Error consultando regalos:", error);

    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        error: "No se pudo consultar la lista de regalos"
      })
    };
  }
};
