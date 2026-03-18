/**
 * ============================================================
 * JARVIS CHAT — Frontend (app.js) — VERSÃO MASTER CORRIGIDA
 * ============================================================
 * Atualizado em: 18/03/2026
 * Correções: Status IDs (Case Insensitive), Botão de Envio,
 * Mapping de Provedores (Groq/Gemini).
 * ============================================================
 */

// 1. CONFIGURAÇÃO E CONSTANTES
const API_BASE = window.location.origin;
const MAX_HISTORY_LENGTH = 20;

// 2. ESTADO DA APLICAÇÃO
const state = {
    history: [],
    isLoading: false,
    messageCount: 0,
};

// 3. MAPEAMENTO DO DOM
const DOM = {
    messagesArea:     () => document.getElementById("messages-area"),
    welcomeScreen:    () => document.getElementById("welcome-screen"),
    messageInput:     () => document.getElementById("message-input"),
    sendButton:       () => document.getElementById("send-button"),
    sendIcon:         () => document.querySelector(".send-icon"),
    loadingIcon:      () => document.querySelector(".loading-icon"),
    typingIndicator:  () => document.getElementById("typing-indicator"),
    charCounter:      () => document.getElementById("char-counter"),
    msgCounter:       () => document.getElementById("msg-counter"),
    chatHeaderSub:    () => document.getElementById("chat-header-sub"),
    providerBadge:    () => document.getElementById("provider-text"),
    routingSelect:    () => document.getElementById("routing-select"),
    temperatureSlider:() => document.getElementById("temperature-slider"),
    temperatureValue: () => document.getElementById("temperature-value"),
    btnClearChat:     () => document.getElementById("btn-clear-chat"),
    btnMenuToggle:    () => document.getElementById("btn-menu-toggle"),
    sidebar:          () => document.getElementById("sidebar"),
    toastContainer:   () => document.getElementById("toast-container"),
};

// 4. CONTROLE DE INTERFACE (UI)

function setLoading(loading) {
    state.isLoading = loading;
    const input = DOM.messageInput();
    const button = DOM.sendButton();

    if (!input || !button) return;

    input.disabled = loading;
    
    if (loading) {
        button.disabled = true;
        if (DOM.sendIcon()) DOM.sendIcon().hidden = true;
        if (DOM.loadingIcon()) DOM.loadingIcon().hidden = false;
        if (DOM.typingIndicator()) DOM.typingIndicator().hidden = false;
        DOM.chatHeaderSub().textContent = "Jarvis está processando...";
    } else {
        button.disabled = input.value.trim().length === 0;
        if (DOM.sendIcon()) DOM.sendIcon().hidden = false;
        if (DOM.loadingIcon()) DOM.loadingIcon().hidden = true;
        if (DOM.typingIndicator()) DOM.typingIndicator().hidden = true;
        DOM.chatHeaderSub().textContent = "Pronto para ajudar";
        input.focus();
    }
}

function showToast(msg, type = "info") {
    const container = DOM.toastContainer();
    if (!container) return;
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add("toast-out");
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// 5. PARSER E RENDERIZAÇÃO

function parseMarkdown(text) {
    if (!text) return "";
    const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return escaped
        .replace(/```(\w*)\n?([\s\S]*?)```/g, '<pre><code class="code-block">$2</code></pre>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br>');
}

function renderMessage(role, text, meta = {}) {
    const area = DOM.messagesArea();
    if (DOM.welcomeScreen()) DOM.welcomeScreen().remove();

    const wrapper = document.createElement("div");
    wrapper.className = `message-wrapper ${role}`;
    const time = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    
    wrapper.innerHTML = `
        <div class="message-avatar">${role === 'user' ? 'EU' : 'J'}</div>
        <div class="message-content">
            <div class="message-bubble">${parseMarkdown(text)}</div>
            <div class="message-meta">
                <span>${time}</span>
                ${meta.latencyMs ? `<span>${meta.latencyMs}ms</span>` : ""}
                ${meta.provider ? `<span class="meta-provider ${meta.provider}">${meta.provider.toUpperCase()}</span>` : ""}
            </div>
        </div>
    `;
    area.appendChild(wrapper);
    area.scrollTo({ top: area.scrollHeight, behavior: "smooth" });
}

// 6. COMUNICAÇÃO (BACKEND)

async function sendMessage() {
    const input = DOM.messageInput();
    const msg = input.value.trim();
    if (!msg || state.isLoading) return;

    renderMessage("user", msg);
    input.value = "";
    setLoading(true);

    try {
        const res = await fetch(`${API_BASE}/api/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                message: msg,
                history: state.history.slice(-MAX_HISTORY_LENGTH),
                options: {
                    strategy: DOM.routingSelect().value,
                    temperature: parseFloat(DOM.temperatureSlider().value)
                }
            })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Erro na API");

        renderMessage("assistant", data.text, data);
        state.history.push({ role: "user", content: msg }, { role: "assistant", content: data.text });
        if (DOM.providerBadge()) DOM.providerBadge().textContent = `⚡ ${data.provider.toUpperCase()} · ${data.model}`;

    } catch (err) {
        showToast(err.message, "error");
    } finally {
        setLoading(false);
    }
}

// 7. STATUS DOS PROVEDORES (HEALTH CHECK REFORÇADO)

async function checkHealth() {
    try {
        const res = await fetch(`${API_BASE}/api/health`);
        const data = await res.json();

        // Agora verificamos tanto minúsculo quanto maiúsculo para Groq e Gemini
        updateStatusUI("groq", !!(data.groq));
        updateStatusUI("gemini", !!(data.gemini));
    } catch (e) {
        updateStatusUI("groq", false);
        updateStatusUI("gemini", false);
    }
}

function updateStatusUI(provider, isOk) {
    // Busca por status-groq ou status-Groq para evitar o erro de "Verificando"
    const idNormal = `status-${provider.toLowerCase()}`;
    const idCapital = `status-${provider.charAt(0).toUpperCase() + provider.slice(1)}`;
    
    const container = document.getElementById(idNormal) || document.getElementById(idCapital);
    if (!container) return;

    const dot = container.querySelector(".status-dot");
    const text = container.querySelector(".status-text") || container.querySelector("span:last-child");

    if (dot) dot.className = `status-dot ${isOk ? "status-ok" : "status-error"}`;
    if (text) {
        text.textContent = isOk ? "Online" : "Offline";
        text.style.color = isOk ? "#00e5b0" : "#ff4b4b";
    }
}

// 8. INICIALIZAÇÃO

function init() {
    const input = DOM.messageInput();
    const button = DOM.sendButton();

    // ── 1. LÓGICA DE DIGITAÇÃO E REDIMENSIONAMENTO ──────────────
    input.addEventListener("input", () => {
        const hasText = input.value.trim().length > 0;
        button.disabled = state.isLoading || !hasText;
        
        // Auto-resize do campo de texto
        input.style.height = "auto";
        input.style.height = Math.min(input.scrollHeight, 120) + "px";
        
        // Se houver a função de contador de caracteres, atualiza aqui
        if (typeof updateCharCounter === 'function') {
            updateCharCounter(input.value.length);
        }
    });

    // ── 2. ENVIAR COM ENTER ─────────────────────────────────────
    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (!button.disabled) sendMessage();
        }
    });

    // ── 3. BOTÃO ENVIAR ─────────────────────────────────────────
    button.addEventListener("click", sendMessage);

    // ── 4. CLIQUE NAS SUGESTÕES (NOVO/CORRIGIDO) ────────────────
    // Usamos delegamento para capturar o clique mesmo se a tela resetar
    const messagesArea = DOM.messagesArea();
    if (messagesArea) {
        messagesArea.addEventListener("click", (e) => {
            // Verifica se clicou no botão ou em algo dentro dele (emoji/texto)
            const btn = e.target.closest(".suggestion-btn");
            
            if (btn) {
                // Pega o texto do atributo data-msg (que está no seu HTML)
                const msg = btn.getAttribute("data-msg");
                
                if (msg) {
                    input.value = msg;
                    // Disparamos o evento 'input' manualmente para habilitar o botão
                    input.dispatchEvent(new Event('input'));
                    // Foca e envia
                    input.focus();
                    sendMessage();
                }
            }
        });
    }

    // ── 5. OUTROS CONTROLES ─────────────────────────────────────
    if (DOM.btnClearChat()) {
        DOM.btnClearChat().addEventListener("click", () => {
            // Em vez de reload, você pode limpar o estado se preferir, 
            // mas o reload é o jeito mais limpo de voltar à tela inicial.
            location.reload();
        });
    }

    if (DOM.temperatureSlider()) {
        DOM.temperatureSlider().addEventListener("input", (e) => {
            if (DOM.temperatureValue()) {
                DOM.temperatureValue().textContent = parseFloat(e.target.value).toFixed(1);
            }
        });
    }

    if (DOM.btnMenuToggle()) {
        DOM.btnMenuToggle().addEventListener("click", () => {
            const sidebar = DOM.sidebar();
            if (sidebar) sidebar.classList.toggle("open");
        });
    }

    // ── 6. INICIALIZAÇÃO DE STATUS ──────────────────────────────
    checkHealth();
    setInterval(checkHealth, 30000);
    
    // Foco inicial no input para o usuário já sair digitando
    input.focus();
}

// Inicializa quando o DOM estiver pronto
document.addEventListener("DOMContentLoaded", init);