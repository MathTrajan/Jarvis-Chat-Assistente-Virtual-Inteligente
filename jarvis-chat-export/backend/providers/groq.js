/**
 * ============================================================
 * JARVIS CHAT — Provedor Groq (Atualizado 2026)
 * ============================================================
 */

const Groq = require("groq-sdk");

// Use variáveis de ambiente! Crie um arquivo .env na pasta backend
// No seu .env coloque: GROQ_API_KEY=sua_chave_aqui
const API_KEY = process.env.GROQ_API_KEY || "GROQ_API_KEY";

let groqClient = null;

function getClient() {
  if (!groqClient) {
    groqClient = new Groq({
      apiKey: API_KEY,
    });
  }
  return groqClient;
}

/**
 * Função principal de chat
 */
async function chat(messages, options = {}) {
  const client = getClient();

  const model = options.model || "llama-3.3-70b-versatile";
  const maxTokens = options.maxTokens || 1024;
  const temperature = options.temperature ?? 0.7;

  const hasSystemMessage = messages.some((m) => m.role === "system");
  const fullMessages = hasSystemMessage
    ? messages
    : [getSystemPrompt(), ...messages];

  try {
    const response = await client.chat.completions.create({
      model,
      messages: fullMessages,
      max_tokens: maxTokens,
      temperature,
    });

    const choice = response.choices[0];
    const text = choice.message.content?.trim() || "";

    return {
      text,
      model: response.model,
      provider: "groq",
      usage: {
        promptTokens: response.usage?.prompt_tokens,
        completionTokens: response.usage?.completion_tokens,
        totalTokens: response.usage?.total_tokens,
      },
      finishReason: choice.finish_reason,
    };
  } catch (error) {
    console.error("Erro na chamada Chat (Groq):", error.message);
    throw error;
  }
}

/**
 * Verifica status da API
 * Adicionei um try/catch mais limpo para garantir que retorne false rápido em caso de erro
 */
async function healthCheck() {
  try {
    const client = getClient();
    // O ping ajuda a verificar se a chave é válida e o modelo está ativo
    const response = await client.chat.completions.create({
      model: "llama-3.1-8b-instant", 
      messages: [{ role: "user", content: "ping" }],
      max_tokens: 5,
    }).catch(() => null); // Se falhar aqui, response será null

    return !!(response && response.choices);
  } catch (error) {
    console.error("Erro no HealthCheck (Groq):", error.message);
    return false;
  }
}

function getSystemPrompt() {
  return {
    role: "system",
    content: `Você é Jarvis, um assistente virtual altamente inteligente, sofisticado e eficiente.
- Especialista em SQL, Python, Java e análise de dados para o setor B2B de colchões.
- Responda em português brasileiro de forma clara e direta.`,
  };
}

module.exports = { chat, healthCheck, getSystemPrompt };