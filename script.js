/**
 * AetherAI - Core Logic
 * Author: Antigravity
 */

class AetherAI {
    constructor() {
        this.chatHistory = JSON.parse(localStorage.getItem('aether_chat_history')) || [];
        this.config = JSON.parse(localStorage.getItem('aether_config')) || {
            openRouterKey: '',
            huggingFaceKey: '',
            theme: 'dark'
        };
        
        this.initElements();
        this.initEventListeners();
        this.renderHistory();
        this.applyTheme();
    }

    initElements() {
        this.chatContainer = document.getElementById('chat-history');
        this.userInput = document.getElementById('user-input');
        this.sendBtn = document.getElementById('send-btn');
        this.generateImageBtn = document.getElementById('generate-image-btn');
        this.typingIndicator = document.getElementById('typing-indicator');
        this.welcomeScreen = document.querySelector('.welcome-screen');
        
        // Modal elements
        this.settingsBtn = document.getElementById('settings-btn');
        this.settingsModal = document.getElementById('settings-modal');
        this.closeSettings = document.getElementById('close-settings');
        this.saveSettings = document.getElementById('save-settings');
        this.openRouterInput = document.getElementById('openrouter-key');
        this.huggingFaceInput = document.getElementById('huggingface-key');
        
        // Actions
        this.themeToggle = document.getElementById('theme-toggle');
        this.clearChatBtn = document.getElementById('clear-chat');

        // Populate modal inputs
        this.openRouterInput.value = this.config.openRouterKey;
        this.huggingFaceInput.value = this.config.huggingFaceKey;
    }

    initEventListeners() {
        this.sendBtn.addEventListener('click', () => this.handleSendMessage());
        this.generateImageBtn.addEventListener('click', () => this.handleGenerateImage());
        
        this.userInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.handleSendMessage();
            }
        });

        this.userInput.addEventListener('input', () => {
            this.userInput.style.height = 'auto';
            this.userInput.style.height = this.userInput.scrollHeight + 'px';
        });

        // Settings Modal
        this.settingsBtn.addEventListener('click', () => this.settingsModal.classList.remove('hidden'));
        this.closeSettings.addEventListener('click', () => this.settingsModal.classList.add('hidden'));
        this.saveSettings.addEventListener('click', () => this.saveConfig());
        window.addEventListener('click', (e) => {
            if (e.target === this.settingsModal) this.settingsModal.classList.add('hidden');
        });

        // Other actions
        this.themeToggle.addEventListener('click', () => this.toggleTheme());
        this.clearChatBtn.addEventListener('click', () => this.clearChat());

        // Suggestions
        document.querySelectorAll('.suggest-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.userInput.value = btn.innerText.replace(/"/g, '');
                this.userInput.focus();
            });
        });
    }

    async handleSendMessage() {
        const text = this.userInput.value.trim();
        if (!text) return;

        if (!this.config.openRouterKey) {
            this.addMessage('bot', 'Please configure your OpenRouter API key in settings first.');
            this.settingsModal.classList.remove('hidden');
            return;
        }

        this.userInput.value = '';
        this.userInput.style.height = 'auto';
        this.addMessage('user', text);
        
        // Smart Intent Detection: If the user asks for an image/photo via the send button, redirect to image gen
        const imageKeywords = ['generate image', 'create image', 'photo of', 'picture of', 'draw', 'paint', 'image of', 'give me a photo'];
        const isRequestingImage = imageKeywords.some(keyword => text.toLowerCase().includes(keyword));

        if (isRequestingImage) {
            await this.generateImageResponse(text);
        } else {
            await this.generateTextResponse(text);
        }
    }

    async handleGenerateImage() {
        const prompt = this.userInput.value.trim();
        if (!prompt) {
            this.addMessage('bot', 'Please enter a prompt to generate an image.');
            return;
        }

        if (!this.config.huggingFaceKey) {
            this.addMessage('bot', 'Please configure your Hugging Face API key in settings first.');
            this.settingsModal.classList.remove('hidden');
            return;
        }

        this.userInput.value = '';
        this.userInput.style.height = 'auto';
        this.addMessage('user', `Generate image: ${prompt}`);
        
        await this.generateImageResponse(prompt);
    }

    async addMessage(role, content, isImage = false) {
        if (this.welcomeScreen) this.welcomeScreen.remove();

        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        // Handle image persistence
        let finalContent = content;
        if (isImage && content instanceof Blob) {
            finalContent = await this.blobToBase64(content);
        }

        const messageObj = { role, content: finalContent, isImage, timestamp };
        
        this.chatHistory.push(messageObj);
        this.saveHistory();
        this.renderMessage(messageObj);
    }

    blobToBase64(blob) {
        return new Promise((resolve, _) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
        });
    }

    renderMessage(msg) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${msg.role}`;
        
        let contentHtml = `<div class="bubble">${msg.content}</div>`;
        if (msg.isImage) {
            contentHtml = `<div class="bubble">
                <p>Generating your masterpiece...</p>
                <img src="${msg.content}" class="message-image" alt="Generated AI Art" onload="this.previousElementSibling.remove()">
            </div>`;
        }
        
        messageDiv.innerHTML = `
            ${contentHtml}
            <div class="timestamp">${msg.timestamp}</div>
        `;
        
        this.chatContainer.appendChild(messageDiv);
        this.scrollToBottom();
    }

    async generateTextResponse(userInput) {
        this.showTyping(true);
        
        try {
            const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${this.config.openRouterKey}`,
                    "Content-Type": "application/json",
                    "HTTP-Referer": window.location.href,
                    "X-Title": "AetherAI"
                },
                body: JSON.stringify({
                    "model": "openai/gpt-3.5-turbo", 
                    "messages": [
                        {"role": "system", "content": "You are AetherAI, a sophisticated and helpful AI assistant. Keep responses professional, creative, and concise."},
                        ...this.chatHistory.filter(m => !m.isImage).slice(-5).map(m => ({
                            role: m.role === 'user' ? 'user' : 'assistant',
                            content: m.content
                        })),
                        {"role": "user", "content": userInput}
                    ]
                })
            });

            const data = await response.json();
            
            if (data.error) {
                this.addMessage('bot', `Nexus Error: ${data.error.message || 'Unknown provider error'}`);
                return;
            }

            const botResponse = data.choices?.[0]?.message?.content || "I'm having trouble connecting to the nexus right now.";
            this.addMessage('bot', botResponse);
        } catch (error) {
            console.error("OpenRouter Error:", error);
            this.addMessage('bot', `Nexus Connection Error: ${error.message || 'Please check your OpenRouter key.'}`);
        } finally {
            this.showTyping(false);
        }
    }

    async generateImageResponse(prompt) {
        this.showTyping(true, "Aether is painting...");
        
        try {
            const response = await fetch(
                "https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0",
                {
                    headers: { Authorization: `Bearer ${this.config.huggingFaceKey}` },
                    method: "POST",
                    body: JSON.stringify({ inputs: prompt }),
                }
            );

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error || "Image API rejected the request. Check your Hugging Face key.");
            }

            const blob = await response.blob();
            await this.addMessage('bot', blob, true);
        } catch (error) {
            console.error("Hugging Face Error:", error);
            this.addMessage('bot', `Canvas Error: ${error.message}`);
        } finally {
            this.showTyping(false);
        }
    }

    showTyping(show, text = "Aether is thinking...") {
        this.typingIndicator.querySelector('p').innerText = text;
        if (show) {
            this.typingIndicator.classList.remove('hidden');
        } else {
            this.typingIndicator.classList.add('hidden');
        }
        this.scrollToBottom();
    }

    scrollToBottom() {
        this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
    }

    saveConfig() {
        this.config.openRouterKey = this.openRouterInput.value.trim();
        this.config.huggingFaceKey = this.huggingFaceInput.value.trim();
        localStorage.setItem('aether_config', JSON.stringify(this.config));
        this.settingsModal.classList.add('hidden');
        this.addMessage('bot', 'API configuration updated successfully.');
    }

    saveHistory() {
        // Only save last 50 messages to prevent storage bloat
        const historyToSave = this.chatHistory.slice(-50);
        localStorage.setItem('aether_chat_history', JSON.stringify(historyToSave));
    }

    renderHistory() {
        if (this.chatHistory.length > 0) {
            if (this.welcomeScreen) this.welcomeScreen.remove();
            this.chatHistory.forEach(msg => this.renderMessage(msg));
        }
    }

    clearChat() {
        if (confirm('Are you sure you want to delete all transmissions?')) {
            this.chatHistory = [];
            localStorage.removeItem('aether_chat_history');
            location.reload();
        }
    }

    toggleTheme() {
        this.config.theme = this.config.theme === 'dark' ? 'light' : 'dark';
        localStorage.setItem('aether_config', JSON.stringify(this.config));
        this.applyTheme();
    }

    applyTheme() {
        document.body.className = this.config.theme === 'dark' ? 'dark-theme' : 'light-theme';
        const icon = this.themeToggle.querySelector('i');
        icon.className = this.config.theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.aether = new AetherAI();
});
