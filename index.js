const axios = require("axios")
const express = require("express")
const JSONdb = require("simple-json-db")
require('dotenv').config() // Carrega as variáveis do arquivo .env

const dailydb = {}
const oneday = 1000 * 60 * 60 * 24

const generateRandomNumber = (a, b) => {
    return Math.floor(Math.random() * (b - a + 1)) + a
}

const app = express()

app.use(express.json())
app.use(express.static(__dirname + "/public"))

// --- ROTAS DE PÁGINAS ---
app.get("/", async (req, res) => res.sendFile(__dirname + "/public/index.html"))
app.get("/daily", async (req, res) => res.sendFile(__dirname + "/public/daily.html"))
app.get("/vips", async (req, res) => res.sendFile(__dirname + "/public/vips.html"))
app.get("/comandos", async (req, res) => res.sendFile(__dirname + "/public/comandos.html"))
app.get("/termos", async (req, res) => res.sendFile(__dirname + "/public/termos.html"))
app.get("/logincallback", async (req, res) => res.sendFile(__dirname + "/public/logincallback.html"))

// --- LÓGICA DE LOGIN ---
app.post("/logincallback", async (req, res) => {
    if (!req.body?.code) return res.status(404).json({ "error": "No code in body" })

    const { code } = req.body

    try {
        // Usando variável de ambiente para o Webhook
        const responsewebhook = await axios.get(process.env.WEBHOOK_AUTH_URL)

        const params = new URLSearchParams()
        params.append("client_id", process.env.CLIENT_ID)
        params.append("client_secret", process.env.CLIENT_SECRET)
        params.append("grant_type", "authorization_code")
        params.append("redirect_uri", responsewebhook.data.name)
        params.append("code", code)

        const response = await axios.post("https://discord.com", params, {
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
        })

        return res.send(response.data)
    } catch (e) {
        return res.status(404).json({ "error": "Error on exchanging token process" })
    }
})

// --- RESGATE DO DAILY ---
app.post("/daily/claim", async (req, res) => {
    if (!req.body.access_token) return res.status(404).json({ "error": "Faça login!" })
    if (!req.body.captcha) return res.status(404).json({ "error": "Resolva o captcha!" })

    const { access_token, captcha } = req.body

    try {
        const captcharesponse = await axios.post("https://www.google.com", {
            secret: process.env.CAPTCHA_SECRET,
            response: captcha,
        }, {
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
        })

        if (!captcharesponse.data.success) return res.status(404).json({ "error": "Captcha inválido!" })

        const response = await axios.get("https://discord.com", {
            headers: { Authorization: `${access_token}` },
        })

        const json = response.data
        if (!json.id) return res.status(404).json({ "error": "User not found" })

        const userid = json.id.toString()
        if (dailydb[userid]) return res.status(404).json({ "status": "Já resgatado hoje!" })

        const valor = generateRandomNumber(5000, 20000)
        dailydb[userid] = { date: Date.now(), claimedonbot: false, amount: valor }

        setTimeout(() => delete dailydb[userid], oneday)

        return res.json({ "success": true, "amount": valor })
    } catch (e) {
        return res.status(404).json({ "error": "Error on claiming daily" })
    }
})

// --- STATUS E BOT ---
app.post("/daily/statusbot", async (req, res) => {
    if (req.body.token !== process.env.CLIENT_SECRET) return res.status(403).json({ "error": "Unauthorized" })
    const userid = req.body.id?.toString()
    
    if (!dailydb[userid]) return res.json({ "status": "not_claimed_on_site" })
    if (dailydb[userid].claimedonbot) return res.json({ "status": "already_claimed" })
    return res.json({ "status": "ready_to_claim" })
})

app.post("/daily/claimbot", async (req, res) => {
    if (req.body.token !== process.env.CLIENT_SECRET) return res.status(403).json({ "error": "Unauthorized" })
    const userid = req.body.id?.toString()

    if (!dailydb[userid]) return res.json({ "status": "not_claimed_on_site" })
    if (dailydb[userid].claimedonbot) return res.json({ "status": "already_claimed" })

    dailydb[userid].claimedonbot = true
    return res.json({ "status": "claimed", "amount": dailydb[userid].amount })
})

// --- REDIRECTS ---
app.get("/redirects", async (req, res) => {
    try {
        const response = await axios.get(process.env.WEBHOOK_REDIRECT_URL)
        const response2 = await axios.get(process.env.WEBHOOK_AUTH_URL)

        res.json({
            "authorize": `https://discord.com{process.env.CLIENT_ID}&redirect_uri=${response.data.name}&response_type=code&scope=identify`,
            "apiauthorize": response2.data.name,
        })
    } catch (e) {
        res.status(500).send("Error fetching redirects")
    }
})

app.listen(process.env.PORT || 8080, () => {
    console.log("App rodando!")
})
