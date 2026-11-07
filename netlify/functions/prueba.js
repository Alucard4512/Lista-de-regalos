
exports.handler = async function () {
  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      ok: true,
      mensaje: "Las funciones de Netlify están funcionando"
    })
  };
};
