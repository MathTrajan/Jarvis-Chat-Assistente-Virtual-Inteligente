/**
 * ============================================================
 * JARVIS CHAT — Provedor Google Gemini (Versão Universal)
 * ============================================================
 */

const { GoogleGenerativeAI } = require("@google/generative-ai");

// ============================================================
// ⚠️ USE UMA CHAVE DE UM GMAIL PESSOAL (@GMAIL.COM)
// ============================================================
const MINHA_CHAVE_API = "GEMINI_API_KEY";
// ============================================================

let geminiClient = null;

function getClient() {
  if (!geminiClient) {
    geminiClient = new GoogleGenerativeAI(MINHA_CHAVE_API);
  }
  return geminiClient;
}

function convertMessagesToGeminiFormat(messages) {
  return messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));
}

async function chat(messages, options = {}) {
  const client = getClient();
  
  // O modelo 'gemini-pro' é o mais compatível com todas as regiões
  const modelName = "gemini-pro"; 
  const maxTokens = options.maxTokens || 1024;
  const temperature = options.temperature ?? 0.7;

  const model = client.getGenerativeModel({
    model: modelName,
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature,
    },
  });

  const geminiHistory = convertMessagesToGeminiFormat(messages);
  const lastMessage = geminiHistory.pop();

  // Injetamos a personalidade do Jarvis diretamente no texto
  const systemText = "Você é Jarvis, um assistente virtual sofisticado. Responda em Português Brasileiro.";
  const promptFinal = `[PERSONALIDADE: ${systemText}]\n\nPergunta: ${lastMessage.parts[0].text}`;

  const chatSession = model.startChat({
    history: geminiHistory,
  });

  try {
    const result = await chatSession.sendMessage(promptFinal);
    const text = result.response.text()?.trim() || "";

    return {
      text,
      model: modelName,
      provider: "gemini",
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      finishReason: "STOP",
    };
  } catch (error) {
    console.error("Erro na chamada do Gemini:", error.message);
    throw new Error("O Gemini falhou. Verifique sua cota ou chave.");
  }
}

async function healthCheck() {
  // Se houver chave, liberamos o Jarvis para tentar a conexão
  return !!MINHA_CHAVE_API && !MINHA_CHAVE_API.includes("COLE_SUA");
}

function getDefaultSystemInstruction() {
  return "Você é Jarvis, um assistente sofisticado.";
}

module.exports = { chat, healthCheck, getDefaultSystemInstruction };