const express = require("express");
const path = require("path");
const crypto = require("node:crypto");
const querystring = require("node:querystring");
const axios = require("axios");
const fs = require("fs");

require("dotenv").config({
    path: path.join(__dirname, ".env")
});

const app = express();
const PORT = process.env.PORT || 3000;


// =====================================================
// CONFIGURACIÓN FLOW
// =====================================================

const FLOW_API_URL =
    process.env.FLOW_API_URL ||
    "https://sandbox.flow.cl/api";

const FLOW_API_KEY =
    process.env.FLOW_API_KEY;

const FLOW_SECRET_KEY =
    process.env.FLOW_SECRET_KEY;

const BASE_URL =
    process.env.BASE_URL ||
    `http://localhost:${PORT}`;


// =====================================================
// ARCHIVO DE REGALOS
// =====================================================

const REGALOS_FILE =
    path.join(__dirname, "regalos.json");


// =====================================================
// MIDDLEWARE
// =====================================================

app.use(express.json());

app.use(
    express.urlencoded({
        extended: true
    })
);


// =====================================================
// CARPETA PUBLIC
// =====================================================

const carpetaPublica =
    path.join(__dirname, "Public");

app.use(
    express.static(carpetaPublica)
);


// =====================================================
// FUNCIONES REGALOS
// =====================================================

function leerRegalos() {

    try {

        const contenido =
            fs.readFileSync(
                REGALOS_FILE,
                "utf8"
            );

        return JSON.parse(contenido);

    } catch (error) {

        console.error(
            "Error leyendo regalos.json:",
            error.message
        );

        return {};
    }
}


function guardarRegalos(regalos) {

    try {

        fs.writeFileSync(
            REGALOS_FILE,
            JSON.stringify(
                regalos,
                null,
                2
            ),
            "utf8"
        );

        return true;

    } catch (error) {

        console.error(
            "Error guardando regalos.json:",
            error.message
        );

        return false;
    }
}


// =====================================================
// OBTENER ID DEL REGALO DESDE COMMERCE ORDER
// =====================================================

function obtenerRegaloId(commerceOrder) {

    const regalos =
        leerRegalos();

    return Object.keys(regalos).find(
        id =>
            commerceOrder.startsWith(
                `${id}-`
            )
    );
}


// =====================================================
// MARCAR REGALO COMO REGALADO
// =====================================================

function marcarRegaloComoRegalado(
    commerceOrder
) {

    const regalos =
        leerRegalos();

    const regaloId =
        Object.keys(regalos).find(
            id =>
                commerceOrder.startsWith(
                    `${id}-`
                )
        );


    if (!regaloId) {

        console.log(
            "No se encontró un regalo para:",
            commerceOrder
        );

        return false;
    }


    // El regalo especial puede recibirse
    // todas las veces que quieran.

    if (
        regaloId ===
        "regalo-especial"
    ) {

        console.log(
            "🎁 Aporte especial recibido."
        );

        return true;
    }


    // Si ya estaba regalado,
    // no necesitamos volver a escribir.

    if (
        regalos[regaloId].estado ===
        "regalado"
    ) {

        console.log(
            `🎁 ${regaloId} ya estaba marcado como regalado.`
        );

        return true;
    }


    regalos[regaloId].estado =
        "regalado";


    const guardado =
        guardarRegalos(regalos);


    if (guardado) {

        console.log(
            `🎁 ${regaloId} marcado como REGALADO`
        );

    }


    return guardado;
}


// =====================================================
// PÁGINA PRINCIPAL
// =====================================================

app.get("/", (req, res) => {

    res.sendFile(
        path.join(
            carpetaPublica,
            "Lista.html"
        )
    );

});


// =====================================================
// API - ESTADO DE LOS REGALOS
// =====================================================

app.get(
    "/api/regalos",
    (req, res) => {

        const regalos =
            leerRegalos();

        res.json(regalos);

    }
);


// =====================================================
// FIRMA FLOW
// =====================================================

function firmarParametros(params) {

    const claves =
        Object.keys(params).sort();

    let stringFirma = "";


    for (const clave of claves) {

        stringFirma +=
            clave + params[clave];

    }


    return crypto
        .createHmac(
            "sha256",
            FLOW_SECRET_KEY
        )
        .update(stringFirma)
        .digest("hex");
}


// =====================================================
// CONSULTAR ESTADO DEL PAGO EN FLOW
// =====================================================

async function obtenerEstadoPago(token) {

    const params = {

        apiKey:
            FLOW_API_KEY,

        token:
            token

    };


    params.s =
        firmarParametros(params);


    const query =
        querystring.stringify(params);


    const respuesta =
        await axios.get(
            `${FLOW_API_URL}/payment/getStatus?${query}`
        );


    return respuesta.data;
}


// =====================================================
// CREAR PAGO
// =====================================================

app.post(
    "/api/crear-pago",
    async (req, res) => {

        try {

            const {
                regaloId,
                monto,
                correo
            } = req.body;


            // =========================================
            // VALIDACIÓN BÁSICA
            // =========================================

            if (
                !regaloId ||
                !correo
            ) {

                return res.status(400).json({
                    error:
                        "Faltan datos para crear el pago."
                });

            }


            // =========================================
            // COMPROBAR FLOW
            // =========================================

            if (
                !FLOW_API_KEY ||
                !FLOW_SECRET_KEY
            ) {

                return res.status(500).json({
                    error:
                        "Flow no está configurado."
                });

            }


            // =========================================
            // BUSCAR REGALO REAL EN EL SERVIDOR
            // =========================================

            const regalos =
                leerRegalos();


            const regaloServidor =
                regalos[regaloId];


            if (!regaloServidor) {

                return res.status(404).json({
                    error:
                        "El regalo seleccionado no existe."
                });

            }


            // =========================================
            // COMPROBAR SI YA FUE REGALADO
            // =========================================

            if (
                regaloId !==
                    "regalo-especial" &&
                regaloServidor.estado ===
                    "regalado"
            ) {

                return res.status(409).json({
                    error:
                        "Este regalo ya fue regalado."
                });

            }


            // =========================================
            // NOMBRE DEL REGALO
            // =========================================

            const nombreRegalo =
                regaloServidor.nombre ||
                regaloId;


            // =========================================
            // DETERMINAR MONTO
            // =========================================

            let montoNumero;


            // REGALO ESPECIAL:
            // usamos el monto ingresado
            // por el invitado.

            if (
                regaloId ===
                "regalo-especial"
            ) {

                montoNumero =
                    Number(monto);


                if (
                    !Number.isInteger(
                        montoNumero
                    ) ||
                    montoNumero < 1000
                ) {

                    return res
                        .status(400)
                        .json({
                            error:
                                "El monto del regalo especial no es válido."
                        });

                }

            } else {

                // REGALO NORMAL:
                // el precio viene del servidor,
                // NO del navegador.

                montoNumero =
                    Number(
                        regaloServidor.precio
                    );


                if (
                    !Number.isInteger(
                        montoNumero
                    ) ||
                    montoNumero < 1000
                ) {

                    return res
                        .status(500)
                        .json({
                            error:
                                "El precio del regalo no está configurado correctamente."
                        });

                }


                if (
                    montoNumero > 50000
                ) {

                    return res
                        .status(500)
                        .json({
                            error:
                                "El precio del regalo supera el máximo permitido."
                        });

                }

            }


            // =========================================
            // CREAR NÚMERO DE ORDEN
            // =========================================

            const commerceOrder =
                `${regaloId}-${Date.now()}`;


            // =========================================
            // PARÁMETROS PARA FLOW
            // =========================================

            const params = {

                apiKey:
                    FLOW_API_KEY,

                commerceOrder:
                    commerceOrder,

                subject:
                    `Regalo matrimonio - ${nombreRegalo}`,

                currency:
                    "CLP",

                amount:
                    montoNumero,

                email:
                    correo,

                urlConfirmation:
                    `${BASE_URL}/api/flow-confirmacion`,

                urlReturn:
                    `${BASE_URL}/resultado`

            };


            // =========================================
            // FIRMAR
            // =========================================

            params.s =
                firmarParametros(params);


            // =========================================
            // CONVERTIR PARÁMETROS
            // =========================================

            const body =
                querystring.stringify(params);


            // =========================================
            // CREAR PAGO EN FLOW
            // =========================================

            const respuestaFlow =
                await axios.post(

                    `${FLOW_API_URL}/payment/create`,

                    body,

                    {
                        headers: {

                            "Content-Type":
                                "application/x-www-form-urlencoded"

                        }
                    }

                );


            const {
                url,
                token,
                flowOrder
            } = respuestaFlow.data;


            const checkoutUrl =
                `${url}?token=${token}`;


            console.log("");
            console.log("==============================");
            console.log(" ORDEN FLOW CREADA");
            console.log("==============================");

            console.log(
                "Regalo:",
                nombreRegalo
            );

            console.log(
                "ID:",
                regaloId
            );

            console.log(
                "Monto:",
                montoNumero
            );

            console.log(
                "Orden:",
                commerceOrder
            );

            console.log(
                "Flow Order:",
                flowOrder
            );

            console.log("");


            // =========================================
            // RESPUESTA AL NAVEGADOR
            // =========================================

            res.json({

                ok: true,

                checkoutUrl:
                    checkoutUrl,

                flowOrder:
                    flowOrder,

                commerceOrder:
                    commerceOrder

            });


        } catch (error) {

            console.error(
                "Error creando pago en Flow:",
                error.response?.data ||
                error.message
            );


            res.status(500).json({

                error:
                    "No se pudo crear el pago en Flow.",

                detalle:
                    error.response?.data ||
                    error.message

            });

        }

    }
);


// =====================================================
// CONFIRMACIÓN AUTOMÁTICA DESDE FLOW
// =====================================================

app.post(
    "/api/flow-confirmacion",
    async (req, res) => {

        try {

            const token =
                req.body.token;


            if (!token) {

                console.log(
                    "Flow llamó la confirmación sin token."
                );

                return res.sendStatus(400);

            }


            // Siempre consultamos directamente
            // a Flow para verificar el pago.

            const pago =
                await obtenerEstadoPago(
                    token
                );


            console.log("");
            console.log("==============================");
            console.log(" CONFIRMACIÓN FLOW");
            console.log("==============================");

            console.log(
                "Estado:",
                pago.status
            );

            console.log(
                "Orden:",
                pago.commerceOrder
            );

            console.log(
                "Monto:",
                pago.amount
            );


            // =========================================
            // PAGO APROBADO
            // =========================================

            if (
                Number(pago.status) === 2
            ) {

                console.log(
                    "✅ PAGO CONFIRMADO"
                );


                marcarRegaloComoRegalado(
                    pago.commerceOrder
                );

            } else {

                console.log(
                    "Pago todavía no confirmado."
                );

            }


            console.log("");


            res.sendStatus(200);


        } catch (error) {

            console.error(
                "Error verificando confirmación:",
                error.response?.data ||
                error.message
            );


            res.sendStatus(500);

        }

    }
);


// =====================================================
// RETORNO DEL INVITADO DESDE FLOW
// =====================================================

app.all(
    "/resultado",
    async (req, res) => {

        try {

            const token =
                req.body.token ||
                req.query.token;


            console.log("");
            console.log("==============================");
            console.log(" REGRESO DESDE FLOW");
            console.log("==============================");

            console.log(
                "¿Token recibido?",
                token ? "SÍ" : "NO"
            );


            // =========================================
            // NO HAY TOKEN
            // =========================================

            if (!token) {

                return res.send(`
                    <!DOCTYPE html>

                    <html lang="es">

                    <head>

                        <meta charset="UTF-8">

                        <meta
                            name="viewport"
                            content="width=device-width, initial-scale=1.0"
                        >

                        <title>
                            No pudimos verificar el pago
                        </title>

                    </head>


                    <body style="
                        margin:0;
                        background:#F7F2E9;
                        color:#6F573A;
                        font-family:Georgia, 'Times New Roman', serif;
                    ">

                        <div style="
                            max-width:520px;
                            margin:80px auto;
                            padding:40px 25px;
                            text-align:center;
                        ">

                            <h1>
                                No pudimos verificar el pago
                            </h1>

                            <p>
                                Flow no entregó el token necesario.
                            </p>

                            <a href="/">
                                Volver a la lista
                            </a>

                        </div>

                    </body>

                    </html>
                `);

            }


            // =========================================
            // CONSULTAR FLOW
            // =========================================

            const pago =
                await obtenerEstadoPago(
                    token
                );


            console.log(
                "Estado del pago:",
                pago.status
            );


            // =========================================
            // PAGO APROBADO
            // =========================================

            if (
                Number(pago.status) === 2
            ) {

                console.log(
                    "✅ PAGO APROBADO"
                );


                // IMPORTANTE:
                // Como estamos probando en localhost,
                // marcamos aquí también el regalo.

                marcarRegaloComoRegalado(
                    pago.commerceOrder
                );


                return res.send(`
                    <!DOCTYPE html>

                    <html lang="es">

                    <head>

                        <meta charset="UTF-8">

                        <meta
                            name="viewport"
                            content="width=device-width, initial-scale=1.0"
                        >

                        <title>
                            Regalo recibido
                        </title>

                    </head>


                    <body style="
                        margin:0;
                        background:#F7F2E9;
                        color:#6F573A;
                        font-family:Georgia, 'Times New Roman', serif;
                    ">

                        <div style="
                            max-width:520px;
                            margin:80px auto;
                            padding:40px 25px;
                            text-align:center;
                        ">

                            <div style="
                                font-size:50px;
                                margin-bottom:20px;
                            ">
                                🎁
                            </div>


                            <h1 style="
                                font-weight:normal;
                                margin-bottom:25px;
                            ">
                                ¡Muchas gracias!
                            </h1>


                            <p style="
                                font-size:18px;
                                line-height:1.6;
                            ">
                                Tu regalo fue recibido correctamente.
                            </p>


                            <p style="
                                font-size:18px;
                                margin-top:30px;
                            ">

                                <strong>
                                    ${pago.subject}
                                </strong>

                            </p>


                            <p style="
                                font-size:22px;
                                margin-top:15px;
                            ">

                                $${Number(
                                    pago.amount
                                ).toLocaleString(
                                    "es-CL"
                                )}

                            </p>


                            <a
                                href="/"
                                style="
                                    display:inline-block;
                                    margin-top:35px;
                                    padding:14px 30px;
                                    background:#866B47;
                                    color:white;
                                    text-decoration:none;
                                    border-radius:4px;
                                "
                            >
                                Volver a la lista
                            </a>

                        </div>

                    </body>

                    </html>
                `);

            }


            // =========================================
            // PAGO NO APROBADO
            // =========================================

            return res.send(`
                <!DOCTYPE html>

                <html lang="es">

                <head>

                    <meta charset="UTF-8">

                    <meta
                        name="viewport"
                        content="width=device-width, initial-scale=1.0"
                    >

                    <title>
                        Pago no completado
                    </title>

                </head>


                <body style="
                    margin:0;
                    background:#F7F2E9;
                    color:#6F573A;
                    font-family:Georgia, 'Times New Roman', serif;
                ">

                    <div style="
                        max-width:520px;
                        margin:80px auto;
                        padding:40px 25px;
                        text-align:center;
                    ">

                        <h1>
                            Pago no completado
                        </h1>

                        <p>
                            El pago todavía no aparece como aprobado.
                        </p>

                        <p>
                            Estado Flow:
                            ${pago.status}
                        </p>

                        <a href="/">
                            Volver a la lista
                        </a>

                    </div>

                </body>

                </html>
            `);


        } catch (error) {

            console.error(
                "Error verificando retorno:",
                error.response?.data ||
                error.message
            );


            res.status(500).send(`
                <!DOCTYPE html>

                <html lang="es">

                <head>
                    <meta charset="UTF-8">

                    <meta
                        name="viewport"
                        content="width=device-width, initial-scale=1.0"
                    >

                    <title>Error</title>
                </head>

                <body style="
                    background:#F7F2E9;
                    color:#6F573A;
                    font-family:Georgia, serif;
                    text-align:center;
                    padding:60px 20px;
                ">

                    <h1>
                        No pudimos verificar el pago
                    </h1>

                    <p>
                        Revisa la terminal del servidor.
                    </p>

                    <a href="/">
                        Volver a la lista
                    </a>

                </body>

                </html>
            `);

        }

    }
);


// =====================================================
// PRUEBA DEL SERVIDOR
// =====================================================

app.get(
    "/api/prueba",
    (req, res) => {

        res.json({

            ok: true,

            mensaje:
                "Express funcionando correctamente"

        });

    }
);


// =====================================================
// INICIAR SERVIDOR
// =====================================================

app.listen(PORT, () => {

    console.log("");
    console.log("==============================");
    console.log(" SERVIDOR ACTIVO");
    console.log("==============================");
    console.log("");

    console.log(
        `http://localhost:${PORT}`
    );

    console.log("");

    console.log(
        "FLOW_API_KEY:",
        FLOW_API_KEY
            ? "CARGADA ✓"
            : "NO ENCONTRADA ✗"
    );

    console.log(
        "FLOW_SECRET_KEY:",
        FLOW_SECRET_KEY
            ? "CARGADA ✓"
            : "NO ENCONTRADA ✗"
    );

    console.log("");

    console.log(
        "REGALOS:",
        Object.keys(
            leerRegalos()
        ).length,
        "cargados"
    );

    console.log("");

});