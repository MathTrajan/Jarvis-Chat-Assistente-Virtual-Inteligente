/**
 * ============================================================
 * JARVIS CHAT — Camada do Agente (Roteamento e Lógica)
 * ============================================================
 * Esta camada é o "cérebro" do Jarvis.
 * Responsabilidades:
 * - Decidir qual provedor usar para cada requisição
 * - Gerenciar fallback automático entre provedores
 * - Manter o system prompt consistente
 * - Registrar logs de uso e erros (Groq & Gemini)
 * ============================================================
 */

const groqProvider = require("./providers/groq"); // Alterado de openaiProvider
const geminiProvider = require("./providers/gemini");

// ─────────────────────────────────────────────────────────────
// CONFIGURAÇÃO DE ROTEAMENTO
// ─────────────────────────────────────────────────────────────

/**
 * Estratégias de roteamento disponíveis:
 * - "groq"   → Sempre usa Groq; fallback para Gemini se falhar
 * - "gemini" → Sempre usa Gemini; fallback para Groq se falhar
 * - "auto"   → Tenta Groq primeiro; fallback para Gemini
 * - "round-robin" → Alterna entre os dois provedores a cada requisição
 */
const STRATEGIES = {
  GROQ: "groq", // Alterado de OPENAI
  GEMINI: "gemini",
  AUTO: "auto",
  ROUND_ROBIN: "round-robin",
};

// Contador interno para round-robin
let requestCount = 0;

/**
 * Determina qual provedor deve ser o principal para esta requisição
 */
function resolveRouting(strategy) {
  switch (strategy) {
    case STRATEGIES.GEMINI:
      return {
        primary: geminiProvider,
        primaryName: "gemini",
        fallback: groqProvider,
        fallbackName: "groq",
      };

    case STRATEGIES.ROUND_ROBIN: {
      requestCount++;
      const useGroq = requestCount % 2 !== 0;
      return useGroq
        ? { primary: groqProvider, primaryName: "groq", fallback: geminiProvider, fallbackName: "gemini" }
        : { primary: geminiProvider, primaryName: "gemini", fallback: groqProvider, fallbackName: "groq" };
    }

    // "groq" e "auto" usam Groq como primário
    case STRATEGIES.GROQ:
    case STRATEGIES.AUTO:
    default:
      return {
        primary: groqProvider,
        primaryName: "groq",
        fallback: geminiProvider,
        fallbackName: "gemini",
      };
  }
}

// ─────────────────────────────────────────────────────────────
// SYSTEM PROMPT DO JARVIS
// ─────────────────────────────────────────────────────────────

function getJarvisSystemPrompt() {
  return {
    role: "system",
    content: `Você é Jarvis, um assistente virtual altamente inteligente, sofisticado e eficiente... (seu prompt original)`,
  };
}

// ─────────────────────────────────────────────────────────────
// FUNÇÃO PRINCIPAL DO AGENTE
// ─────────────────────────────────────────────────────────────

async function processMessage(userMessage, conversationHistory = [], options = {}) {
  const strategy = options.strategy || process.env.AGENT_ROUTING_STRATEGY || STRATEGIES.AUTO;
  const routing = resolveRouting(strategy);

  const systemPrompt = getJarvisSystemPrompt();
  const newUserMessage = { role: "user", content: userMessage };

  const filteredHistory = conversationHistory.filter((m) => m.role !== "system");
  const messages = [systemPrompt, ...filteredHistory, newUserMessage];

  const startTime = Date.now();

  // ── Tentativa com o provedor PRIMÁRIO ──────────────────────
  try {
    console.log(`[Jarvis] Roteando para provedor primário: ${routing.primaryName} | Estratégia: ${strategy}`);

    const result = await routing.primary.chat(messages, {
      maxTokens: options.maxTokens,
      temperature: options.temperature,
    });

    const latency = Date.now() - startTime;
    console.log(`[Jarvis] ✓ Resposta de ${routing.primaryName} em ${latency}ms`);

    return buildResponse(result, routing.primaryName, false, latency);

  } catch (primaryError) {
    const primaryLatency = Date.now() - startTime;
    console.error(`[Jarvis] ✗ Falha no provedor primário (${routing.primaryName}) após ${primaryLatency}ms:`, primaryError.message);

    // ── Fallback para o provedor SECUNDÁRIO ────────────────────
    try {
      console.log(`[Jarvis] ↩ Iniciando fallback para: ${routing.fallbackName}`);

      const fallbackStart = Date.now();
      const result = await routing.fallback.chat(messages, {
        maxTokens: options.maxTokens,
        temperature: options.temperature,
      });

      const fallbackLatency = Date.now() - fallbackStart;
      const totalLatency = Date.now() - startTime;
      console.log(`[Jarvis] ✓ Fallback bem-sucedido com ${routing.fallbackName} em ${fallbackLatency}ms`);

      return buildResponse(result, routing.fallbackName, true, totalLatency, {
        primaryProvider: routing.primaryName,
        primaryError: primaryError.message,
      });

    } catch (fallbackError) {
      const totalLatency = Date.now() - startTime;
      console.error(`[Jarvis] ✗ Falha também no fallback (${routing.fallbackName}):`, fallbackError.message);

      throw new AgentError(
        "Todos os provedores de IA estão temporariamente indisponíveis. Tente novamente em alguns instantes.",
        {
          primaryProvider: routing.primaryName,
          primaryError: primaryError.message,
          fallbackProvider: routing.fallbackName,
          fallbackError: fallbackError.message,
          totalLatencyMs: totalLatency,
        }
      );
    }
  }
}

// ─────────────────────────────────────────────────────────────
// HEALTH CHECK DOS PROVEDORES (Interface de Status)
// ─────────────────────────────────────────────────────────────

async function checkProvidersHealth() {
  const [groqOk, geminiOk] = await Promise.allSettled([
    groqProvider.healthCheck(), // Alterado de openaiProvider
    geminiProvider.healthCheck(),
  ]);

  return {
    groq: groqOk.status === "fulfilled" && groqOk.value === true, // Agora retorna 'groq'
    gemini: geminiOk.status === "fulfilled" && geminiOk.value === true,
    anyAvailable:
      (groqOk.status === "fulfilled" && groqOk.value) ||
      (geminiOk.status === "fulfilled" && geminiOk.value),
  };
}

// ─────────────────────────────────────────────────────────────
// HELPERS E TIPOS
// ─────────────────────────────────────────────────────────────

function buildResponse(providerResult, providerName, usedFallback, latencyMs, fallbackInfo = null) {
  return {
    text: providerResult.text,
    provider: providerName,
    model: providerResult.model,
    usedFallback,
    fallbackInfo,
    latencyMs,
    usage: providerResult.usage || null,
    timestamp: new Date().toISOString(),
  };
}

class AgentError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "AgentError";
    this.details = details;
    this.timestamp = new Date().toISOString();
  }
}

module.exports = {
  processMessage,
  checkProvidersHealth,
  getJarvisSystemPrompt,
  STRATEGIES,
  AgentError,
};