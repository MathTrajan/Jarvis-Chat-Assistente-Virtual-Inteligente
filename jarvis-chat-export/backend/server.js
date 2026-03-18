/**
 * ============================================================
 * JARVIS CHAT — Servidor Express (Entry Point do Backend)
 * ============================================================
 * Responsabilidades:
 * - Inicializar o servidor HTTP
 * - Configurar middlewares de segurança (Helmet, CORS, Rate Limit)
 * - Expor endpoints REST para o frontend (Groq + Gemini)
 * ============================================================
 */

// Carrega variáveis de ambiente do arquivo .env (DEVE ser o primeiro require)
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");

const agent = require("./agent");

// ─────────────────────────────────────────────────────────────
// INICIALIZAÇÃO DO APP
// ─────────────────────────────────────────────────────────────

const app = express();
const PORT = process.env.PORT || 3000;

// ─────────────────────────────────────────────────────────────
// MIDDLEWARES DE SEGURANÇA
// ─────────────────────────────────────────────────────────────

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
      },
    },
  })
);

app.use(
  cors({
    origin: process.env.ALLOWED_ORIGIN || "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
  })
);

const chatRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Muitas requisições. Aguarde um momento.",
    code: "RATE_LIMIT_EXCEEDED",
  },
});

app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "../frontend")));

// ─────────────────────────────────────────────────────────────
// ENDPOINTS DA API
// ─────────────────────────────────────────────────────────────

/**
 * POST /api/chat
 * Processa mensagens via Groq ou Gemini
 */
app.post("/api/chat", chatRateLimiter, async (req, res) => {
  const { message, history = [], options = {} } = req.body;

  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "Mensagem inválida.", code: "INVALID_MESSAGE" });
  }

  const trimmedMessage = message.trim();
  if (trimmedMessage.length === 0 || trimmedMessage.length > 8000) {
    return res.status(400).json({ error: "Tamanho de mensagem inválido.", code: "BAD_SIZE" });
  }

  try {
    const response = await agent.processMessage(trimmedMessage, history, options);

    return res.json({
      text: response.text,
      provider: response.provider,
      model: response.model,
      usedFallback: response.usedFallback,
      latencyMs: response.latencyMs,
      timestamp: response.timestamp,
    });

  } catch (err) {
    console.error("[/api/chat] Erro:", err.message);
    if (err.name === "AgentError") {
      return res.status(503).json({ error: err.message, code: "AGENT_UNAVAILABLE" });
    }
    return res.status(500).json({ error: "Erro interno no Jarvis.", code: "INTERNAL_ERROR" });
  }
});

/**
 * GET /api/health
 * Endpoint que as bolinhas de status do seu Frontend consultam.
 */
app.get("/api/health", async (req, res) => {
  try {
    const status = await agent.checkProvidersHealth();

    // Retornamos exatamente o que o app.js espera: { groq, gemini }
    return res.json({
      status: status.anyAvailable ? "healthy" : "degraded",
      groq: status.groq, // Isso fará a bolinha da Groq ficar verde
      gemini: status.gemini,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(503).json({ status: "error", groq: false, gemini: false });
  }
});

/**
 * GET /api/info
 */
app.get("/api/info", (req, res) => {
  res.json({
    name: "Jarvis Chat API",
    version: "1.1.0",
    routing: {
      strategy: process.env.AGENT_ROUTING_STRATEGY || "auto",
      providers: ["groq", "gemini"],
    },
  });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

// ─────────────────────────────────────────────────────────────
// INICIALIZAÇÃO E LOGS
// ─────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log("\n╔══════════════════════════════════════════════╗");
  console.log("║         🤖  JARVIS CHAT — INICIADO           ║");
  console.log("╠══════════════════════════════════════════════╣");
  console.log(`║  Servidor:    http://localhost:${PORT.toString().padEnd(14)}║`);
  console.log(`║  Estratégia:  ${(process.env.AGENT_ROUTING_STRATEGY || "auto").padEnd(28)}║`);
  console.log(`║  Groq Key:    ${process.env.GROQ_API_KEY ? "✓ Configurada" : "✗ NÃO ENCONTRADA"}            ║`);
  console.log(`║  Gemini Key:  ${process.env.GEMINI_API_KEY ? "✓ Configurada" : "✗ NÃO ENCONTRADA"}            ║`);
  console.log("╚══════════════════════════════════════════════╝\n");
});

module.exports = app;