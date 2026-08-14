// ===== ZAI Vision — AI Chat with Live Screen Analysis =====

// --- State ---
let chats = [];
let currentChatId = null;
let isTyping = false;

// Vision state
let visionActive = false;
let displayStream = null;
let visionCanvas = null;
let visionVideo = null;
let visionInterval = null;
let visionFrameCount = 0;
let lastVisionAnalysis = 0;
let lastScreenContext = '';

// Voice state
let voiceEnabled = false;
let recognition = null;
let isListening = false;
let speechSynth = window.speechSynthesis;

// Settings
let settings = {
    provider: localStorage.getItem('zai_provider') || 'auto',
    groqKey: localStorage.getItem('zai_groq_key') || '',
    model: localStorage.getItem('zai_model') || 'llama',
    temperature: parseFloat(localStorage.getItem('zai_temp') || '0.7'),
    language: localStorage.getItem('zai_lang') || 'ar',
    voiceMode: localStorage.getItem('zai_voice') || 'ar-SA',
    visionFps: parseInt(localStorage.getItem('zai_vision_fps') || '2'),
    autoAnalyze: localStorage.getItem('zai_auto') || 'manual'
};

const GROQ_MODELS = {
    llama: 'llama-3.3-70b-versatile',
    mistral: 'mixtral-8x7b-32768',
    qwen: 'qwen-2.5-coder-32b',
    vision: 'llama-4-scout-17b-16b-instruct'
};

const SYSTEM_PROMPTS = {
    ar: 'أنت ZAI Vision — مساعد ذكي مغربي كيشوف الشاشة وكيحللها. جاو بصراحة وبالدارجة المغربية المبسطة. كون مختصر ومفيد. إذا عندك معلومة من الشاشة، استعملها فالجواب.',
    en: 'You are ZAI Vision — an AI assistant that can see the screen. Be concise and helpful.',
    fr: 'Vous êtes ZAI Vision — un assistant IA qui peut voir l\'écran. Soyez concis et utile.'
};

// --- DOM ---
const $ = id => document.getElementById(id);
const messagesEl = $('messages');
const userInputEl = $('userInput');
const sendBtnEl = $('sendBtn');
const chatListEl = $('chatList');
const sidebarEl = $('sidebar');
const menuToggleEl = $('menuToggle');
const micBtnEl = $('micBtn');
const micIconEl = $('micIcon');
const voiceStatusEl = $('voiceStatus');
const voiceStatusTextEl = $('voiceStatusText');
const visionBarEl = $('visionBar');
const visionFpsEl = $('visionFps');
const floatingOverlayEl = $('floatingOverlay');
const overlayContentEl = $('overlayContent');

// === CHAT MANAGEMENT ===
function createNewChat() {
    const chat = { id: Date.now().toString(), title: 'محادثة جديدة', messages: [], created: Date.now() };
    chats.unshift(chat);
    currentChatId = chat.id;
    saveChats(); renderChatList(); renderMessages(); closeSidebar();
}

function selectChat(id) { currentChatId = id; renderMessages(); renderChatList(); closeSidebar(); }

function getCurrentChat() { return chats.find(c => c.id === currentChatId); }

function saveChats() { localStorage.setItem('zai_chats', JSON.stringify(chats)); }

function loadChats() {
    const saved = localStorage.getItem('zai_chats');
    if (saved) { chats = JSON.parse(saved); }
    if (chats.length === 0) createNewChat();
    else { currentChatId = chats[0].id; renderMessages(); }
}

function renderChatList() {
    chatListEl.innerHTML = '';
    chats.forEach(chat => {
        const el = document.createElement('div');
        el.className = `chat-item ${chat.id === currentChatId ? 'active' : ''}`;
        el.textContent = chat.title;
        el.onclick = () => selectChat(chat.id);
        chatListEl.appendChild(el);
    });
}

function renderMessages() {
    const chat = getCurrentChat();
    if (!chat || chat.messages.length === 0) {
        messagesEl.innerHTML = `<div class="welcome-screen">
            <div class="welcome-icon">🧠</div><h2>ZAI Vision</h2>
            <p>مساعدك الذكي اللي كيشوف الشاشة وكيجاوبك بصوت</p>
            <div class="feature-cards">
                <div class="feature-card" onclick="startVisionMode()"><span class="feature-icon">👁️</span><span>تشغيل البصير</span><small>البوت كيشوف شاشتك</small></div>
                <div class="feature-card" onclick="toggleVoice()"><span class="feature-icon">🎤</span><span>محادثة صوتية</span><small>هضر مع البوت</small></div>
                <div class="feature-card" onclick="setQuickPrompt('اشرح لي اللي كاين فالشاشة')"><span class="feature-icon">🔍</span><span>تحليل الشاشة</span></div>
                <div class="feature-card" onclick="setQuickPrompt('كتب لي كود')"><span class="feature-icon">💻</span><span>برمجة</span></div>
            </div></div>`;
        return;
    }
    messagesEl.innerHTML = '';
    chat.messages.forEach(msg => appendMessage(msg.role, msg.content, msg.hasImage));
    messagesEl.scrollTop = messagesEl.scrollHeight;
}

function appendMessage(role, content, hasImage) {
    const el = document.createElement('div');
    el.className = `message ${role}`;
    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = role === 'user' ? '👤' : (role === 'vision' ? '👁️' : '🧠');
    const contentEl = document.createElement('div');
    contentEl.className = 'message-content';
    contentEl.innerHTML = formatMessage(content);
    el.appendChild(avatar);
    el.appendChild(contentEl);
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
}

function formatMessage(text) {
    return text
        .replace(/```(\w+)?\n([\s\S]*?)```/g, (m, lang, code) => `<pre><code>${escapeHtml(code.trim())}</code></pre>`)
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>')
        .replace(/\n/g, '<br>');
}

function escapeHtml(t) { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }

function showTyping() {
    const el = document.createElement('div');
    el.className = 'message assistant';
    el.id = 'typingMessage';
    el.innerHTML = `<div class="message-avatar">🧠</div><div class="message-content"><div class="typing-indicator"><span></span><span></span><span></span></div></div>`;
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
}

function hideTyping() { const el = $('typingMessage'); if (el) el.remove(); }

// === AI API ===
async function sendToAI(messages, screenImage) {
    const sysPrompt = SYSTEM_PROMPTS[settings.language] || SYSTEM_PROMPTS.ar;
    let fullMessages = [{ role: 'system', content: sysPrompt }, ...messages];

    // If we have a screen image, add it
    if (screenImage) {
        const lastMsg = fullMessages[fullMessages.length - 1];
        if (lastMsg.role === 'user') {
            fullMessages[fullMessages.length - 1] = {
                role: 'user',
                content: [
                    { type: 'text', text: lastMsg.content + '\n\n[البوت كيشوف الشاشة دابا - حلل اللي كاين فيها]' },
                    { type: 'image_url', image_url: { url: screenImage } }
                ]
            };
        }
    }

    // Use user's own Groq key if provided (power users), otherwise use our free backend proxy
    if (settings.provider === 'groq' && settings.groqKey && screenImage) {
        return await sendToGroqVision(fullMessages);
    } else if (settings.provider === 'groq' && settings.groqKey) {
        return await sendToGroq(fullMessages);
    } else {
        return await sendToBackendProxy(fullMessages, screenImage);
    }
}

async function sendToGroq(messages) {
    const model = GROQ_MODELS[settings.model] || GROQ_MODELS.llama;
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.groqKey}` },
        body: JSON.stringify({ model, messages, temperature: settings.temperature, max_tokens: 2048 })
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error?.message || `خطأ Groq (${res.status})`); }
    return (await res.json()).choices[0].message.content;
}

async function sendToGroqVision(messages) {
    const model = GROQ_MODELS.vision;
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.groqKey}` },
        body: JSON.stringify({ model, messages, temperature: settings.temperature, max_tokens: 2048 })
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error?.message || `خطأ Groq Vision (${res.status})`); }
    return (await res.json()).choices[0].message.content;
}

async function sendToBackendProxy(messages, screenImage) {
    // Our own free backend proxy — powered by Groq (Llama 3.3 70B / Llama 4 Scout vision)
    const res = await fetch('https://base44.app/api/apps/6a1082479423d64dfa027604/functions/zaiVisionChat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            messages: messages,
            vision: !!screenImage,
            temperature: settings.temperature
        })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) throw new Error(data.error || `خطأ فالسيرفر (${res.status})`);
    return data.reply || 'ما قدرتش نجاوب دابا، عاود المحاولة';
}

// === SEND MESSAGE ===
async function sendMessage(withScreen = false) {
    let text = userInputEl.value.trim();
    if (!text && !withScreen) return;
    if (!text) text = 'حلل اللي كاين فالشاشة';

    const chat = getCurrentChat();
    if (!chat) return;

    let screenImage = null;
    if (withScreen && visionActive) {
        screenImage = captureScreenFrame();
    }

    chat.messages.push({ role: 'user', content: text });
    if (chat.messages.length === 1) chat.title = text.substring(0, 30);
    saveChats(); renderChatList();

    appendMessage('user', text);
    userInputEl.value = '';
    autoResize();

    isTyping = true; sendBtnEl.disabled = true; showTyping();

    try {
        const response = await sendToAI(chat.messages, screenImage);
        hideTyping();
        chat.messages.push({ role: 'assistant', content: response });
        saveChats();
        appendMessage('assistant', response);
        speakResponse(response);
    } catch (err) {
        hideTyping();
        appendMessage('assistant', `❌ خطأ: ${err.message}`);
    } finally {
        isTyping = false; sendBtnEl.disabled = false;
    }
}

function setQuickPrompt(text) { userInputEl.value = text; userInputEl.focus(); autoResize(); }

// === VISION MODE (Live Screen Analysis) ===
async function startVisionMode() {
    try {
        // Request screen capture - prefer monitor (full screen) for persistence
        displayStream = await navigator.mediaDevices.getDisplayMedia({
            video: { frameRate: 30, displaySurface: 'monitor' },
            audio: false,
            preferCurrentTab: false
        });

        visionVideo = $('visionVideo');
        visionCanvas = $('visionCanvas');
        visionVideo.srcObject = displayStream;
        visionVideo.play();

        visionActive = true;
        visionBarEl.classList.remove('hidden');
        $('statusDot').className = 'status-dot vision';
        $('statusText').textContent = 'البصير نشط';
        floatingOverlayEl.classList.remove('hidden');
        overlayContentEl.innerHTML = '<p class="overlay-waiting">👁️ البصير نشط... كنشوف الشاشة</p>';

        // Handle user stopping screen share
        displayStream.getVideoTracks()[0].addEventListener('ended', () => {
            stopVisionMode();
        });

        // Start periodic analysis
        const intervalMs = 1000 / settings.visionFps;
        visionInterval = setInterval(() => {
            if (visionActive) analyzeScreenFrame();
        }, intervalMs);

        // Initial message
        appendMessage('vision', '👁️ البصير تفعّل! دابا كنشوف الشاشة ديالك. تقدر تسولني على أي حاجة كاينة فيها، ولا نهضر معاك بصوت.');
        speakResponse('البصير تفعل! دابا كنشوف الشاشة. تسولني على أي حاجة.');

    } catch (err) {
        alert('ما قدرتش نشغل البصير: ' + err.message + '\n\nلازم تختار "Share entire screen" باش البصير يستمر حتى منين تخرج من المتصفح.');
    }
}

function stopVisionMode() {
    visionActive = false;
    if (visionInterval) { clearInterval(visionInterval); visionInterval = null; }
    if (displayStream) { displayStream.getTracks().forEach(t => t.stop()); displayStream = null; }
    visionBarEl.classList.add('hidden');
    $('statusDot').className = 'status-dot online';
    $('statusText').textContent = 'جاهز';
    floatingOverlayEl.classList.add('hidden');
    visionFrameCount = 0;
    appendMessage('vision', '👁️ البصير توقف. نقدر نعيدو منين بغيتي.');
}

function captureScreenFrame() {
    if (!visionVideo || !visionCanvas) return null;
    try {
        const ctx = visionCanvas.getContext('2d');
        visionCanvas.width = visionVideo.videoWidth || 1280;
        visionCanvas.height = visionVideo.videoHeight || 720;
        ctx.drawImage(visionVideo, 0, 0);
        return visionCanvas.toDataURL('image/jpeg', 0.6);
    } catch (e) {
        return null;
    }
}

async function analyzeScreenFrame() {
    if (!visionActive || isTyping) return;

    const frame = captureScreenFrame();
    if (!frame) return;

    visionFrameCount++;
    visionFpsEl.textContent = visionFrameCount;

    // Throttle auto-analysis to avoid spamming
    const now = Date.now();
    const minInterval = settings.autoAnalyze === 'auto' ? 10000 : 5000; // 10s auto, 5s manual
    if (now - lastVisionAnalysis < minInterval) return;

    try {
        // Quick vision check - just describe what's on screen
        const checkMessages = [
            { role: 'user', content: 'وصف باختصار شحال كاين فالشاشة دابا. جملة وحدة فقط.' }
        ];

        const description = await sendToAI(checkMessages, frame);
        lastScreenContext = description;

        // Update overlay
        overlayContentEl.innerHTML = `<p style="font-size:13px;">👁️ ${description}</p>`;

        // If auto mode, proactively comment
        if (settings.autoAnalyze === 'auto' && now - lastVisionAnalysis > 30000) {
            lastVisionAnalysis = now;
            const chat = getCurrentChat();
            chat.messages.push({ role: 'vision', content: `👁️ ${description}` });
            saveChats();
            appendMessage('vision', description);
            speakResponse(description);
        } else {
            lastVisionAnalysis = now;
        }

    } catch (e) {
        console.log('Vision analysis error:', e);
    }
}

// === VOICE INTERACTION ===
function toggleVoice() {
    voiceEnabled = !voiceEnabled;
    if (voiceEnabled) {
        startListening();
    } else {
        stopListening();
    }
}

function startListening() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
        alert('المتصفح ديالك ما كيدعمش التعرف على الصوت. جرّب Chrome.');
        voiceEnabled = false;
        return;
    }

    recognition = new SR();
    recognition.lang = settings.language === 'ar' ? 'ar-SA' : settings.language === 'fr' ? 'fr-FR' : 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onstart = () => {
        isListening = true;
        micBtnEl.classList.add('recording');
        micIconEl.textContent = '⏹️';
        voiceStatusEl.classList.remove('hidden');
        voiceStatusTextEl.textContent = 'كنسمع...';
        $('voiceModeIndicator').textContent = 'الصوت: نشط';
    };

    recognition.onresult = (e) => {
        let finalText = '';
        let interimText = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
            if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
            else interimText += e.results[i][0].transcript;
        }

        if (interimText) {
            voiceStatusTextEl.textContent = `كنسمع: ${interimText}`;
        }

        if (finalText) {
            userInputEl.value = finalText;
            autoResize();
            // Auto-send after voice input
            setTimeout(() => {
                if (userInputEl.value.trim()) {
                    const withScreen = visionActive;
                    sendMessage(withScreen);
                }
            }, 500);
        }
    };

    recognition.onerror = (e) => {
        console.log('Speech error:', e.error);
        if (e.error === 'no-speech') {
            voiceStatusTextEl.textContent = 'ما سمعت والو... هضر دابا';
        } else if (e.error === 'not-allowed') {
            alert('سمح لـ Microphone باش نسمعك');
            stopListening();
        }
    };

    recognition.onend = () => {
        if (voiceEnabled) {
            try { recognition.start(); } catch (e) {}
        } else {
            isListening = false;
            micBtnEl.classList.remove('recording');
            micIconEl.textContent = '🎤';
            voiceStatusEl.classList.add('hidden');
            $('voiceModeIndicator').textContent = 'الصوت: مغلق';
        }
    };

    try { recognition.start(); } catch (e) {}
}

function stopListening() {
    voiceEnabled = false;
    if (recognition) { recognition.stop(); recognition = null; }
    isListening = false;
    micBtnEl.classList.remove('recording');
    micIconEl.textContent = '🎤';
    voiceStatusEl.classList.add('hidden');
    $('voiceModeIndicator').textContent = 'الصوت: مغلق';
}

function speakResponse(text) {
    if (settings.voiceMode === 'none' || !speechSynth) return;

    // Clean text for speech
    const cleanText = text.replace(/[*#`~]/g, '').replace(/```[\s\S]*?```/g, ' كود برمجي. ').substring(0, 500);

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = settings.voiceMode === 'ar-SA-female' ? 'ar-SA' : settings.voiceMode || 'ar-SA';

    // Try to find a matching voice
    const voices = speechSynth.getVoices();
    const voice = voices.find(v => v.lang === utterance.lang);
    if (voice) utterance.voice = voice;

    utterance.rate = 1.0;
    utterance.pitch = settings.voiceMode === 'ar-SA-female' ? 1.3 : 1.0;

    speechSynth.cancel();
    speechSynth.speak(utterance);
}

// === SETTINGS ===
function openSettings() {
    $('aiProvider').value = settings.provider;
    $('groqApiKey').value = settings.groqKey;
    $('modelSelect').value = settings.model;
    $('visionFpsSetting').value = settings.visionFps;
    $('fpsValue').textContent = settings.visionFps;
    $('voiceSelect').value = settings.voiceMode;
    $('language').value = settings.language;
    $('temperature').value = settings.temperature * 100;
    $('tempValue').textContent = settings.temperature;
    $('autoAnalyze').value = settings.autoAnalyze;
    toggleGroqKey();
    $('settingsModal').classList.remove('hidden');
}

function closeSettingsModal() { $('settingsModal').classList.add('hidden'); }

function toggleGroqKey() {
    $('groqKeyGroup').style.display = $('aiProvider').value === 'groq' ? 'block' : 'none';
}

function saveSettingsHandler() {
    settings.provider = $('aiProvider').value;
    settings.groqKey = $('groqApiKey').value;
    settings.model = $('modelSelect').value;
    settings.visionFps = parseInt($('visionFpsSetting').value);
    settings.voiceMode = $('voiceSelect').value;
    settings.language = $('language').value;
    settings.temperature = parseInt($('temperature').value) / 100;
    settings.autoAnalyze = $('autoAnalyze').value;

    localStorage.setItem('zai_provider', settings.provider);
    localStorage.setItem('zai_groq_key', settings.groqKey);
    localStorage.setItem('zai_model', settings.model);
    localStorage.setItem('zai_vision_fps', settings.visionFps);
    localStorage.setItem('zai_voice', settings.voiceMode);
    localStorage.setItem('zai_lang', settings.language);
    localStorage.setItem('zai_temp', settings.temperature);
    localStorage.setItem('zai_auto', settings.autoAnalyze);

    updateModelInfo();
    closeSettingsModal();
}

function updateModelInfo() {
    const p = settings.provider === 'groq' ? 'Groq API (شخصي)' : 'ZAI Cloud (مجاني)';
    const m = { llama: 'Llama 3.3 70B', mistral: 'Mistral', qwen: 'Qwen' };
    $('modelInfo').textContent = `${p} • ${m[settings.model] || 'Llama'}`;
}

// === UI ===
function toggleSidebar() { sidebarEl.classList.toggle('open'); }
function closeSidebar() { sidebarEl.classList.remove('open'); }
function autoResize() { userInputEl.style.height = 'auto'; userInputEl.style.height = Math.min(userInputEl.scrollHeight, 120) + 'px'; }

// === EVENTS ===
sendBtnEl.addEventListener('click', () => sendMessage(visionActive));
userInputEl.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(visionActive); } });
userInputEl.addEventListener('input', autoResize);
$('newChat').addEventListener('click', createNewChat);
menuToggleEl.addEventListener('click', toggleSidebar);
$('settingsBtn').addEventListener('click', openSettings);
$('closeSettings').addEventListener('click', closeSettingsModal);
$('saveSettings').addEventListener('click', saveSettingsHandler);
$('aiProvider').addEventListener('change', toggleGroqKey);
$('visionFpsSetting').addEventListener('input', e => $('fpsValue').textContent = e.target.value);
$('temperature').addEventListener('input', e => $('tempValue').textContent = (e.target.value / 100).toFixed(1));
$('stopVision').addEventListener('click', stopVisionMode);
$('closeOverlay').addEventListener('click', () => floatingOverlayEl.classList.add('hidden'));
micBtnEl.addEventListener('click', toggleVoice);
$('settingsModal').addEventListener('click', e => { if (e.target === $('settingsModal')) closeSettingsModal(); });

// === INIT ===
loadChats();
renderChatList();
updateModelInfo();

// Load voices
if (speechSynth) {
    speechSynth.onvoiceschanged = () => { speechSynth.getVoices(); };
}

// Keep screen awake during vision mode (Wake Lock API)
let wakeLock = null;
async function requestWakeLock() {
    try {
        if ('wakeLock' in navigator) {
            wakeLock = await navigator.wakeLock.request('screen');
        }
    } catch (e) {}
}

// Request wake lock when vision starts
const origStartVision = startVisionMode;
startVisionMode = async function() {
    await origStartVision();
    if (visionActive) requestWakeLock();
};
