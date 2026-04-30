/**
 * ESCTRIX — Core Application Logic
 * Refactored for modularity and performance.
 */

const ESCTRIX = {
    // --- State Management ---
    state: {
        myUsername: '',
        myPassword: '',
        activeRoomName: '',
        p2p: null,
        screenHistory: [],
        isLoginMode: true,
        vanishMode: false,
        isVideoCalling: false,
        isMuted: false,
        isCamOff: false,
        isScreenSharing: false,
        localVideoStream: null,
        screenStream: null,
        callTimerInterval: null,
        callSeconds: 0,
        pingInterval: null,
        fileReceives: {}, // peerId -> { meta, buffer, size }
        adminWs: null,
        adminStatsInterval: null,
        isSpeakerMode: true,
        currentFacingMode: 'user'
    },

    // --- DOM Elements Cache ---
    elements: {},

    // --- Initialization ---
    init() {
        this.cacheElements();
        this.bindEvents();
        this.initPWA();
        this.initHistory();
        console.log('🚀 ESCTRIX Initialized');
    },

    cacheElements() {
        const ids = [
            'login-screen', 'dashboard-screen', 'admin-screen', 'chat-screen', 'back-btn', 'logout-btn',
            'toast', 'toast-msg', 'auth-title', 'auth-subtitle', 'auth-username', 'auth-password',
            'auth-submit-btn', 'auth-toggle', 'login-error', 'welcome-username', 'tab-host', 'tab-join',
            'host-setup', 'client-setup', 'host-waiting', 'start-host-btn', 'host-pin', 'host-space-name',
            'qr-code-img', 'display-pin', 'my-space-name', 'stop-host-btn', 'join-space-name', 'join-pin',
            'connect-btn', 'auth-error', 'messages-list', 'message-input', 'send-btn', 'typing-indicator',
            'smart-replies', 'voice-note-btn', 'voice-recording-bar', 'voice-rec-timer', 'file-btn', 'file-input',
            'file-upload-progress', 'progress-bar-fill', 'progress-percent', 'progress-filename', 'progress-speed',
            'video-overlay', 'video-call-btn', 'end-video-call-btn', 'mute-btn', 'cam-off-btn', 'switch-cam-btn',
            'screen-share-btn', 'incall-chat-btn', 'incall-chat-panel', 'incall-chat-close', 'incall-messages',
            'incall-message-input', 'incall-send-btn', 'call-modal', 'accept-call-btn', 'decline-call-btn',
            'caller-name', 'call-timer', 'call-type-modal', 'call-type-peer-name', 'start-audio-call-btn',
            'start-video-call-btn', 'cancel-call-type-btn', 'emoji-picker', 'e2ee-modal', 'e2ee-canvas',
            'e2ee-hash-label', 'e2ee-close-btn', 'e2ee-verify-btn', 'e2ee-chat-verify-btn', 'stat-total-users',
            'stat-active-hosts', 'stat-total-connections', 'admin-hosts-ul', 'admin-users-tbody', 'admin-chat-log',
            'admin-broadcast-msg', 'admin-broadcast-btn', 'admin-enter-app-btn', 'vanish-mode-btn', 'burn-room-btn',
            'export-chat-btn', 'ai-assist-btn', 'kicked-overlay', 'kicked-message', 'kicked-ok-btn', 'kick-admin-modal',
            'kick-modal-target', 'kick-custom-msg', 'kick-confirm-btn', 'kick-cancel-btn', 'ping-indicator',
            'connection-status', 'local-video', 'group-video-grid'
        ];
        ids.forEach(id => {
            this.elements[this.toCamelCase(id)] = document.getElementById(id);
        });
        this.elements.statusDot = document.querySelector('.dot');
        this.elements.statusText = document.querySelector('.status-text');
    },

    toCamelCase(str) {
        return str.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
    },

    bindEvents() {
        // Global
        this.elements.backBtn?.addEventListener('click', () => history.back());
        this.elements.logoutBtn?.addEventListener('click', () => this.auth.logout());
        window.addEventListener('popstate', (e) => this.navigation.handlePopState(e));

        // Auth
        this.elements.authToggle?.addEventListener('click', () => this.auth.toggleMode());
        this.elements.authSubmitBtn?.addEventListener('click', () => this.auth.submit());

        // Dashboard
        this.elements.tabHost?.addEventListener('click', () => this.dashboard.switchTab('host'));
        this.elements.tabJoin?.addEventListener('click', () => this.dashboard.switchTab('join'));
        this.elements.startHostBtn?.addEventListener('click', () => this.dashboard.startHosting());
        this.elements.stopHostBtn?.addEventListener('click', () => history.back());
        this.elements.connectBtn?.addEventListener('click', () => this.dashboard.connectToSpace());

        // Chat
        this.elements.sendBtn?.addEventListener('click', () => this.chat.sendMessage());
        this.elements.messageInput?.addEventListener('keypress', (e) => { if (e.key === 'Enter') this.chat.sendMessage(); });
        this.elements.messageInput?.addEventListener('input', () => this.chat.handleTyping());
        this.elements.fileBtn?.addEventListener('click', () => this.elements.fileInput.click());
        this.elements.fileInput?.addEventListener('change', (e) => this.chat.handleFileSelect(e));
        this.elements.vanishModeBtn?.addEventListener('click', () => this.chat.toggleVanishMode());
        this.elements.burnRoomBtn?.addEventListener('click', () => this.chat.burnRoom());
        this.elements.exportChatBtn?.addEventListener('click', () => this.chat.exportChat());
        this.elements.aiAssistBtn?.addEventListener('click', () => this.chat.toggleSmartReplies());

        // Voice
        if (this.elements.voiceNoteBtn) {
            this.elements.voiceNoteBtn.addEventListener('mousedown', () => this.voice.start());
            this.elements.voiceNoteBtn.addEventListener('touchstart', (e) => { e.preventDefault(); this.voice.start(); }, { passive: false });
            document.addEventListener('mouseup', () => this.voice.stop());
            document.addEventListener('touchend', () => this.voice.stop());
        }

        // Calls
        this.elements.videoCallBtn?.addEventListener('click', () => this.call.toggleCall());
        this.elements.endVideoCallBtn?.addEventListener('click', () => this.call.end());
        this.elements.muteBtn?.addEventListener('click', () => this.call.toggleMute());
        this.elements.camOffBtn?.addEventListener('click', () => this.call.toggleCam());
        this.elements.screenShareBtn?.addEventListener('click', () => this.call.toggleScreenShare());
        this.elements.incallChatBtn?.addEventListener('click', () => this.elements.incallChatPanel.classList.toggle('hidden'));
        this.elements.incallChatClose?.addEventListener('click', () => this.elements.incallChatPanel.classList.add('hidden'));
        this.elements.incallSendBtn?.addEventListener('click', () => this.call.sendIncallMessage());
        this.elements.incallMessageInput?.addEventListener('keypress', (e) => { if (e.key === 'Enter') this.call.sendIncallMessage(); });
        this.elements.acceptCallBtn?.addEventListener('click', () => this.call.accept());
        this.elements.declineCallBtn?.addEventListener('click', () => this.call.decline());
        this.elements.startAudioCallBtn?.addEventListener('click', () => this.call.initiate('audio'));
        this.elements.startVideoCallBtn?.addEventListener('click', () => this.call.initiate('video'));
        this.elements.cancelCallTypeBtn?.addEventListener('click', () => this.elements.callTypeModal.classList.add('hidden'));

        // Admin
        this.elements.adminBroadcastBtn?.addEventListener('click', () => this.admin.broadcast());
        this.elements.adminEnterAppBtn?.addEventListener('click', () => this.admin.enterApp());
        this.elements.kickConfirmBtn?.addEventListener('click', () => this.admin.confirmKick());
        this.elements.kickCancelBtn?.addEventListener('click', () => this.elements.kickAdminModal.classList.add('hidden'));
        this.elements.kickedOkBtn?.addEventListener('click', () => this.admin.handleKickedOk());

        // Verification
        this.elements.e2eeVerifyBtn?.addEventListener('click', () => this.verification.openModal());
        this.elements.e2eeChatVerifyBtn?.addEventListener('click', () => this.verification.openModal());
        this.elements.e2eeCloseBtn?.addEventListener('click', () => this.elements.e2eeModal.classList.add('hidden'));

        // Global Click
        document.addEventListener('click', (e) => {
            if (this.elements.emojiPicker && !e.target.closest('.emoji-picker') && !e.target.closest('.message')) {
                this.elements.emojiPicker.classList.add('hidden');
            }
        });
    },

    initPWA() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js').catch(err => console.error('SW registration failed', err));
        }
    },

    initHistory() {
        history.replaceState({ depth: 0 }, '', location.href);
    },

    // --- Navigation Module ---
    navigation: {
        showScreen(next, pushHistory = true) {
            const current = document.querySelector('.screen.active');
            if (current && current !== next) {
                current.classList.add('slide-out-left');
                setTimeout(() => current.classList.remove('active', 'slide-out-left'), 380);
                if (pushHistory) {
                    ESCTRIX.state.screenHistory.push(current);
                    history.pushState({ depth: ESCTRIX.state.screenHistory.length }, '', location.href);
                }
            }
            next.classList.add('active');
            this.updateBackBtn();
        },

        goBack() {
            if (ESCTRIX.state.screenHistory.length === 0) return;
            const prev = ESCTRIX.state.screenHistory.pop();
            const current = document.querySelector('.screen.active');
            if (current) {
                current.classList.remove('active');
                current.style.transform = 'translateX(40px)';
                setTimeout(() => { current.style.transform = ''; }, 380);
            }
            prev.classList.add('active');
            this.updateBackBtn();
        },

        updateBackBtn() {
            if (ESCTRIX.state.screenHistory.length > 0) {
                ESCTRIX.elements.backBtn.classList.remove('hidden');
            } else {
                ESCTRIX.elements.backBtn.classList.add('hidden');
            }
        },

        handlePopState() {
            const hw = ESCTRIX.elements.hostWaiting;
            if (hw && hw.style.display === 'block') {
                ESCTRIX.dashboard.stopHosting();
            } else if (ESCTRIX.elements.chatScreen.classList.contains('active')) {
                if (ESCTRIX.state.p2p) {
                    ESCTRIX.state.p2p.disconnect();
                    ESCTRIX.state.p2p = null;
                }
                ESCTRIX.call.end();
                this.goBack();
            } else if (ESCTRIX.state.screenHistory.length > 0) {
                this.goBack();
            }
        }
    },

    // --- Auth Module ---
    auth: {
        toggleMode() {
            ESCTRIX.state.isLoginMode = !ESCTRIX.state.isLoginMode;
            ESCTRIX.elements.loginError.textContent = '';
            ESCTRIX.elements.authUsername.value = '';
            ESCTRIX.elements.authPassword.value = '';
            const e = ESCTRIX.elements;
            if (ESCTRIX.state.isLoginMode) {
                e.authTitle.textContent = 'Welcome Back';
                e.authSubtitle.textContent = 'Login to access your secure space.';
                e.authSubmitBtn.innerHTML = '<i class="ph ph-sign-in"></i> Login';
                e.authToggle.innerHTML = "Don't have an account? <span class='link'>Register</span>";
            } else {
                e.authTitle.textContent = 'Create Account';
                e.authSubtitle.textContent = 'Join ESCTRIX for secure P2P messaging.';
                e.authSubmitBtn.innerHTML = '<i class="ph ph-user-plus"></i> Register';
                e.authToggle.innerHTML = "Already have an account? <span class='link'>Login</span>";
            }
        },

        async submit() {
            const username = ESCTRIX.elements.authUsername.value.trim();
            const password = ESCTRIX.elements.authPassword.value.trim();

            if (!username || !password) {
                ESCTRIX.elements.loginError.textContent = 'Please fill in both fields.';
                return;
            }

            ESCTRIX.elements.loginError.textContent = 'Please wait...';
            ESCTRIX.elements.authSubmitBtn.disabled = true;

            const endpoint = ESCTRIX.state.isLoginMode ? '/api/auth/login' : '/api/auth/register';

            try {
                const res = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });
                const data = await res.json();

                if (data.status === 'success') {
                    ESCTRIX.elements.loginError.textContent = '';
                    if (!ESCTRIX.state.isLoginMode) {
                        ESCTRIX.ui.showToast('Account created! Please log in.');
                        this.toggleMode();
                    } else {
                        ESCTRIX.state.myUsername = username;
                        ESCTRIX.state.myPassword = password;
                        ESCTRIX.elements.welcomeUsername.textContent = `Hello, ${username} 👋`;
                        ESCTRIX.state.screenHistory = [];
                        if (data.role === 'admin') {
                            ESCTRIX.navigation.showScreen(ESCTRIX.elements.adminScreen, false);
                            ESCTRIX.admin.startStatsLoop();
                        } else {
                            ESCTRIX.navigation.showScreen(ESCTRIX.elements.dashboardScreen, false);
                        }
                        ESCTRIX.elements.logoutBtn.classList.remove('hidden');
                    }
                } else {
                    ESCTRIX.elements.loginError.textContent = data.message || 'Authentication failed.';
                }
            } catch (err) {
                ESCTRIX.elements.loginError.textContent = 'Server error. Please try again.';
            } finally {
                ESCTRIX.elements.authSubmitBtn.disabled = false;
            }
        },

        logout() {
            if (ESCTRIX.state.p2p) {
                ESCTRIX.state.p2p.disconnect();
                ESCTRIX.state.p2p = null;
            }
            ESCTRIX.dashboard.stopHosting();
            ESCTRIX.admin.stopStatsLoop();
            ESCTRIX.call.end();

            ESCTRIX.state.myUsername = '';
            ESCTRIX.elements.authPassword.value = '';
            ESCTRIX.navigation.showScreen(ESCTRIX.elements.loginScreen, false);
            ESCTRIX.elements.logoutBtn.classList.add('hidden');
            ESCTRIX.ui.showToast('Logged out successfully.');
            history.replaceState({ depth: 0 }, '', location.href);
            ESCTRIX.state.screenHistory = [];
        }
    },

    // --- Dashboard Module ---
    dashboard: {
        switchTab(tab) {
            const e = ESCTRIX.elements;
            if (tab === 'host') {
                e.tabHost.classList.add('active-tab');
                e.tabJoin.classList.remove('active-tab');
                e.hostSetup.style.display = 'block';
                e.clientSetup.style.display = 'none';
                e.hostWaiting.style.display = 'none';
            } else {
                e.tabJoin.classList.add('active-tab');
                e.tabHost.classList.remove('active-tab');
                e.clientSetup.style.display = 'block';
                e.hostSetup.style.display = 'none';
                e.hostWaiting.style.display = 'none';
            }
        },

        async startHosting() {
            const pin = ESCTRIX.elements.hostPin.value.trim();
            const spaceName = ESCTRIX.elements.hostSpaceName.value.trim() || ESCTRIX.state.myUsername;
            try {
                const response = await fetch('/api/host/start', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: ESCTRIX.state.myUsername, space_name: spaceName, pin })
                });
                const data = await response.json();
                if (data.status === 'success') {
                    ESCTRIX.elements.qrCodeImg.src = 'data:image/png;base64,' + data.qr_code;
                    ESCTRIX.elements.displayPin.textContent = pin || 'None';
                    ESCTRIX.elements.mySpaceName.textContent = spaceName;

                    ESCTRIX.elements.hostSetup.style.display = 'none';
                    ESCTRIX.elements.hostWaiting.style.display = 'block';
                    ESCTRIX.elements.tabHost.style.display = 'none';
                    ESCTRIX.elements.tabJoin.style.display = 'none';

                    ESCTRIX.state.activeRoomName = spaceName;
                    this.initP2P(null, pin, ESCTRIX.state.myUsername, spaceName);
                    history.pushState({ hosting: true }, '', location.href);
                } else {
                    ESCTRIX.elements.authError.textContent = data.message || 'Failed to create space.';
                    ESCTRIX.ui.showToast(data.message || 'Space name already in use.', 'error');
                }
            } catch (err) { console.error('Host start error', err); }
        },

        async stopHosting() {
            if (!ESCTRIX.state.activeRoomName) return;
            try {
                await fetch('/api/host/stop', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ space_name: ESCTRIX.state.activeRoomName })
                });
            } catch (err) { console.error('Stop host error', err); }

            if (ESCTRIX.state.p2p) {
                ESCTRIX.state.p2p.disconnect();
                ESCTRIX.state.p2p = null;
            }

            ESCTRIX.elements.hostWaiting.style.display = 'none';
            ESCTRIX.elements.hostSetup.style.display = 'block';
            ESCTRIX.elements.tabHost.style.display = '';
            ESCTRIX.elements.tabJoin.style.display = '';
            ESCTRIX.state.activeRoomName = '';
            ESCTRIX.ui.showToast('Hosting stopped.', 'success');
        },

        connectToSpace() {
            const spaceName = ESCTRIX.elements.joinSpaceName.value.trim();
            const pin = ESCTRIX.elements.joinPin.value.trim();
            if (spaceName) {
                ESCTRIX.elements.authError.textContent = 'Connecting...';
                ESCTRIX.state.activeRoomName = spaceName;
                this.initP2P(null, pin, ESCTRIX.state.myUsername, spaceName);
            } else {
                ESCTRIX.elements.authError.textContent = 'Please enter the Space Name.';
            }
        },

        initP2P(serverIp, pin, myName, hostName) {
            ESCTRIX.state.p2p = new P2PConnection(
                (msg) => ESCTRIX.chat.handleIncoming(msg),
                (state, data) => ESCTRIX.chat.updateConnectionState(state, data),
                (stream, peerId, uname) => ESCTRIX.call.handleRemoteStream(stream, peerId, uname),
                (type, sender, d) => ESCTRIX.call.handleSignal(type, sender, d)
            );
            ESCTRIX.state.p2p.connectSignaling(serverIp, pin, myName, hostName);
        }
    },

    // --- Chat Module ---
    chat: {
        sendMessage() {
            const text = ESCTRIX.elements.messageInput.value.trim();
            if (text) {
                const msgId = ESCTRIX.utils.generateId();
                if (ESCTRIX.state.p2p?.isConnected()) {
                    ESCTRIX.state.p2p.send({ type: 'text', content: text, senderName: ESCTRIX.state.myUsername, vanish: ESCTRIX.state.vanishMode, id: msgId });
                    if (ESCTRIX.state.p2p.ws?.readyState === WebSocket.OPEN) {
                        ESCTRIX.state.p2p.ws.send(JSON.stringify({ type: 'admin_chat_log', room: ESCTRIX.state.activeRoomName, sender: ESCTRIX.state.myUsername, content: text }));
                    }
                    this.addMessage(text, 'sent', '', ESCTRIX.state.vanishMode, msgId);
                    ESCTRIX.elements.messageInput.value = '';
                } else {
                    this.sendOfflineMessage(text, msgId);
                }
            }
        },

        async sendOfflineMessage(text, msgId) {
            const recipient = ESCTRIX.state.p2p?.peerName || ESCTRIX.state.activeRoomName;
            if (!recipient) return;
            
            this.addMessage(text, 'sent', '', ESCTRIX.state.vanishMode, msgId);
            const msgDiv = document.querySelector(`.message[data-id="${msgId}"]`);
            if (msgDiv) msgDiv.style.opacity = '0.6';
            
            try {
                const res = await fetch('/api/messages/offline', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        recipient_username: recipient,
                        sender_username: ESCTRIX.state.myUsername,
                        space_name: ESCTRIX.state.activeRoomName || 'Direct',
                        payload: text
                    })
                });
                const data = await res.json();
                if (data.status === 'success') {
                    ESCTRIX.ui.showToast('Peer offline. Message stored in server queue.', 'warn');
                } else {
                    ESCTRIX.ui.showToast('Failed to queue offline message.', 'error');
                }
            } catch (err) {
                ESCTRIX.ui.showToast('Network error while queuing message.', 'error');
            }
            ESCTRIX.elements.messageInput.value = '';
        },

        async fetchOfflineMessages() {
            try {
                const res = await fetch(`/api/messages/offline?username=${encodeURIComponent(ESCTRIX.state.myUsername)}`);
                const data = await res.json();
                if (data.status === 'success' && data.messages && data.messages.length > 0) {
                    data.messages.forEach(msg => {
                        this.addMessage(msg.payload, 'received', msg.sender + ' (Offline)');
                    });
                    ESCTRIX.ui.showToast(`Received ${data.messages.length} offline messages!`, 'success');
                }
            } catch (err) {
                console.error('Failed to fetch offline messages', err);
            }
        },


        handleTyping() {
            if (ESCTRIX.state.p2p?.isConnected() && !this.typingTimer) {
                ESCTRIX.state.p2p.send({ type: 'typing' });
                this.typingTimer = setTimeout(() => { this.typingTimer = null; }, 2000);
            }
        },

        handleIncoming(msg) {
            if (msg.type === 'ping') {
                ESCTRIX.state.p2p?.sendToPeer(msg._fromPeerId, { type: 'pong', timestamp: msg.timestamp });
            } else if (msg.type === 'pong') {
                ESCTRIX.ui.updatePing(Date.now() - msg.timestamp);
            } else if (msg.type === 'text') {
                this.addMessage(msg.content, 'received', msg.senderName, msg.vanish, msg.id);
            } else if (msg.type === 'reaction') {
                this.addReaction(msg.messageId, msg.emoji);
            } else if (msg.type === 'incall_text') {
                ESCTRIX.call.addMessage(msg.content, 'received', msg.senderName);
            } else if (msg.type === 'typing') {
                ESCTRIX.ui.showTypingIndicator();
            } else if (msg.type === 'file_meta') {
                ESCTRIX.state.fileReceives[msg._fromPeerId] = { meta: msg, buffer: [], size: 0 };
            } else if (msg.type === 'file_data') {
                this.handleFileData(msg);
            } else if (msg.type === 'burn_room') {
                ESCTRIX.elements.messagesList.innerHTML = '';
                ESCTRIX.ui.showToast('Room was burned by peer.');
            }
        },

        handleFileData(msg) {
            const transfer = ESCTRIX.state.fileReceives[msg._fromPeerId];
            if (transfer) {
                transfer.buffer.push(msg.data);
                transfer.size += msg.data.byteLength;
                if (transfer.size === transfer.meta.size) {
                    const blob = new Blob(transfer.buffer, { type: transfer.meta.fileType });
                    this.addFileMessage(transfer.meta, 'received', blob, transfer.meta.vanish, transfer.meta.id);
                    delete ESCTRIX.state.fileReceives[msg._fromPeerId];
                }
            }
        },

        async handleFileSelect(e) {
            const file = e.target.files[0];
            if (!file || !ESCTRIX.state.p2p?.isConnected()) return;
            const msgId = ESCTRIX.utils.generateId();
            ESCTRIX.state.p2p.sendFileMetadata({ name: file.name, size: file.size, fileType: file.type, vanish: ESCTRIX.state.vanishMode, id: msgId });
            this.addFileMessage({ name: file.name, size: file.size, fileType: file.type }, 'sent', null, ESCTRIX.state.vanishMode, msgId);

            const reader = new FileReader();
            reader.onload = ev => this.transferFileBuffer(ev.target.result, file.name);
            reader.readAsArrayBuffer(file);
            ESCTRIX.elements.fileInput.value = '';
        },

        transferFileBuffer(buf, filename) {
            const CHUNK = 16384;
            let offset = 0;
            let lastTime = Date.now();
            const send = () => {
                while (offset < buf.byteLength) {
                    const dc = ESCTRIX.state.p2p.dataChannel;
                    if (dc && dc.bufferedAmount > 65536) {
                        dc.onbufferedamountlow = () => { dc.onbufferedamountlow = null; send(); };
                        return;
                    }
                    const chunkSize = Math.min(CHUNK, buf.byteLength - offset);
                    ESCTRIX.state.p2p.sendFileData(buf.slice(offset, offset + chunkSize));
                    const now = Date.now();
                    const elapsed = Math.max((now - lastTime) / 1000, 0.001);
                    lastTime = now;
                    offset += chunkSize;
                    ESCTRIX.ui.updateUploadProgress(offset, buf.byteLength, filename, chunkSize / elapsed);
                }
            };
            send();
        },

        addMessage(text, type = 'sent', senderName = '', isVanish = false, msgId = null) {
            const id = msgId || ESCTRIX.utils.generateId();
            const div = document.createElement('div');
            div.className = `message ${type} ${isVanish ? 'vanish-msg' : ''}`;
            div.dataset.id = id;
            this.bindMessageEvents(div, id);

            if (senderName && type === 'received') {
                div.innerHTML = `<strong class="sender-label">${senderName}</strong>${text}`;
            } else {
                div.textContent = text;
            }

            ESCTRIX.elements.messagesList.appendChild(div);
            ESCTRIX.elements.messagesList.scrollTop = ESCTRIX.elements.messagesList.scrollHeight;

            if (isVanish) {
                setTimeout(() => {
                    div.classList.add('fade-out');
                    setTimeout(() => div.remove(), 400);
                }, 10000);
            }
        },

        addFileMessage(fileMeta, type = 'sent', fileBlob = null, isVanish = false, msgId = null) {
            const id = msgId || ESCTRIX.utils.generateId();
            const div = document.createElement('div');
            div.className = `message ${type} file-message ${isVanish ? 'vanish-msg' : ''}`;
            div.dataset.id = id;
            this.bindMessageEvents(div, id);

            let html = '';
            const isVoice = fileMeta.name.endsWith('_voice_note.webm') || fileMeta.isVoiceNote;

            if (isVoice) {
                const trans = fileMeta.transcript ? `<div class="voice-transcript">AI: "${fileMeta.transcript}"</div>` : '';
                if (type === 'received' && fileBlob) {
                    const url = URL.createObjectURL(fileBlob);
                    html = `<i class="ph ph-microphone file-icon accent"></i><div class="file-info"><span class="file-name">Voice Note</span><audio controls src="${url}" class="voice-player"></audio>${trans}</div>`;
                } else {
                    html = `<i class="ph ph-microphone file-icon accent"></i><div class="file-info"><span class="file-name">Voice Note</span><span class="file-status">Sent ✓</span>${trans}</div>`;
                }
            } else if (fileMeta.fileType?.startsWith('image/')) {
                if (type === 'received' && fileBlob) {
                    const url = URL.createObjectURL(fileBlob);
                    html = `<img src="${url}" class="file-preview" onclick="window.open('${url}')"><div class="file-info"><span class="file-name mini">${fileMeta.name}</span><button class="file-download-btn" onclick="ESCTRIX.utils.download('${url}', '${fileMeta.name}')"><i class="ph ph-download-simple"></i></button></div>`;
                } else {
                    html = `<i class="ph ph-image file-icon"></i><div class="file-info"><span class="file-name">${fileMeta.name}</span><span class="file-status">Sent ✓</span></div>`;
                }
            } else {
                html = `<i class="ph ph-file file-icon"></i><div class="file-info"><span class="file-name">${fileMeta.name}</span><span class="file-size">${ESCTRIX.utils.formatBytes(fileMeta.size)}</span>`;
                if (type === 'received' && fileBlob) {
                    const url = URL.createObjectURL(fileBlob);
                    html += `<button class="file-download-action" onclick="ESCTRIX.utils.download('${url}', '${fileMeta.name}')"><i class="ph ph-download-simple"></i> Download</button>`;
                } else {
                    html += `<span class="file-status">Sent ✓</span>`;
                }
                html += `</div>`;
            }

            div.innerHTML = html;
            ESCTRIX.elements.messagesList.appendChild(div);
            ESCTRIX.elements.messagesList.scrollTop = ESCTRIX.elements.messagesList.scrollHeight;

            if (isVanish) {
                setTimeout(() => {
                    div.classList.add('fade-out');
                    setTimeout(() => div.remove(), 400);
                }, 10000);
            }
        },

        bindMessageEvents(div, id) {
            div.addEventListener('dblclick', (e) => {
                ESCTRIX.state.reactionTargetId = id;
                const picker = ESCTRIX.elements.emojiPicker;
                if (picker) {
                    picker.classList.remove('hidden');
                    picker.style.left = Math.min(e.pageX, window.innerWidth - 150) + 'px';
                    picker.style.top = (e.pageY - 50) + 'px';
                }
            });
        },

        addReaction(msgId, emoji) {
            const msgDiv = document.querySelector(`.message[data-id="${msgId}"]`);
            if (msgDiv) {
                let badge = msgDiv.querySelector('.message-reaction');
                if (!badge) {
                    badge = document.createElement('div');
                    badge.className = 'message-reaction';
                    msgDiv.appendChild(badge);
                }
                badge.textContent = emoji;
            }
        },

        toggleVanishMode() {
            ESCTRIX.state.vanishMode = !ESCTRIX.state.vanishMode;
            ESCTRIX.elements.vanishModeBtn.classList.toggle('primary-icon', ESCTRIX.state.vanishMode);
            ESCTRIX.ui.showToast(ESCTRIX.state.vanishMode ? 'Vanish Mode ON' : 'Vanish Mode OFF');
        },

        burnRoom() {
            if (confirm('Are you sure you want to burn this room? This wipes the chat for everyone.')) {
                ESCTRIX.elements.messagesList.innerHTML = '';
                if (ESCTRIX.state.p2p?.isConnected()) {
                    ESCTRIX.state.p2p.send({ type: 'burn_room' });
                }
                ESCTRIX.ui.showToast('Room securely burned.', 'success');
            }
        },

        exportChat() {
            const msgs = [...ESCTRIX.elements.messagesList.querySelectorAll('.message')].map(m => {
                let text = m.innerText || m.textContent;
                return text.replace(/Download/g, '').replace(/Sent ✓/g, '').trim();
            }).join('\n\n');
            ESCTRIX.utils.downloadText(msgs, `ESCTRIX_TEXT_Export_${new Date().toISOString().slice(0, 10)}.txt`);
            ESCTRIX.ui.showToast('Chat history exported.', 'success');
        },

        toggleSmartReplies() {
            const bar = ESCTRIX.elements.smartReplies;
            if (bar && !bar.classList.contains('hidden')) {
                bar.classList.add('hidden');
                return;
            }
            const received = [...ESCTRIX.elements.messagesList.querySelectorAll('.message.received')];
            const lastText = received[received.length - 1]?.textContent?.trim() || '';
            this.showSmartReplies(lastText);
        },

        showSmartReplies(lastMsg) {
            const bar = ESCTRIX.elements.smartReplies;
            if (!bar) return;
            const pools = [
                ['👍 Got it!', '😊 Thanks!', 'On it!'],
                ['Sure, sounds good!', 'Let me check that.', 'Can you elaborate?'],
                ['That\'s interesting!', 'Tell me more.', '100% agree!']
            ];
            const pool = pools[lastMsg.length % pools.length];
            bar.innerHTML = '';
            pool.forEach(reply => {
                const chip = document.createElement('button');
                chip.className = 'smart-reply-chip';
                chip.textContent = reply;
                chip.onclick = () => {
                    ESCTRIX.elements.messageInput.value = reply;
                    bar.classList.add('hidden');
                    ESCTRIX.elements.messageInput.focus();
                };
                bar.appendChild(chip);
            });
            // Translate option
            const trans = document.createElement('button');
            trans.className = 'smart-reply-chip translate-chip';
            trans.innerHTML = '<i class="ph ph-translate"></i> Translate';
            trans.onclick = () => this.translate(lastMsg, trans);
            bar.appendChild(trans);
            bar.classList.remove('hidden');
        },

        async translate(text, btn) {
            if (!text) return;
            btn.textContent = 'Translating...';
            btn.disabled = true;
            try {
                const target = navigator.language.split('-')[0].toUpperCase();
                const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=autodetect|${target}`;
                const res = await fetch(url);
                const json = await res.json();
                const result = json?.responseData?.translatedText;
                if (result && result !== text) {
                    this.addMessage(`🌐 [Translation] ${result}`, 'system');
                } else {
                    ESCTRIX.ui.showToast('Could not translate.', 'error');
                }
            } catch { ESCTRIX.ui.showToast('Translation failed.', 'error'); }
            ESCTRIX.elements.smartReplies.classList.add('hidden');
        },

        updateConnectionState(state, data) {
            const e = ESCTRIX.elements;
            if (state === 'connected') {
                e.statusDot.classList.add('connected');
                const cnt = ESCTRIX.state.p2p?.getPeerCount() || 1;
                e.statusText.textContent = cnt > 1 ? `Group (${cnt} peers)` : `Connected to ${data?.username || 'Peer'}`;
                if (!e.chatScreen.classList.contains('active')) ESCTRIX.navigation.showScreen(e.chatScreen);
                e.videoCallBtn.classList.remove('hidden');
                if (data?.username) this.addMessage(`${data.username} joined the room. 🎉`, 'system');
                this.startPingLoop();
                this.fetchOfflineMessages();
            } else if (state === 'peer_joining') {
                if (data?.username) this.addMessage(`${data.username} is connecting...`, 'system');
            } else if (state === 'peer_left') {
                if (data?.clientId) ESCTRIX.call.removeVideoTile(data.clientId);
                const cnt = ESCTRIX.state.p2p?.getPeerCount() || 0;
                if (cnt > 0) {
                    e.statusText.textContent = `Group (${cnt} peers)`;
                } else {
                    e.statusDot.classList.remove('connected');
                    e.statusText.textContent = 'Peer Offline';
                    e.videoCallBtn.classList.add('hidden');
                    ESCTRIX.call.end();
                }
                this.addMessage('A peer has left the room. You can send offline messages.', 'system');
            } else if (state === 'disconnected') {
                e.statusDot.classList.remove('connected');
                e.statusText.textContent = 'Disconnected';
                e.videoCallBtn.classList.add('hidden');
                this.stopPingLoop();
                ESCTRIX.call.end();
            } else if (state === 'failed_auth') {
                e.authError.textContent = ESCTRIX.state.p2p.authMessage || 'Invalid PIN or host not found.';
            } else if (state === 'kicked') {
                ESCTRIX.admin.showKickedOverlay(ESCTRIX.state.p2p.kickMessage);
            }
        },

        startPingLoop() {
            if (ESCTRIX.state.pingInterval) return;
            ESCTRIX.state.pingInterval = setInterval(() => {
                if (ESCTRIX.state.p2p?.isConnected()) {
                    const peers = ESCTRIX.state.p2p.getPeerList();
                    if (peers.length > 0) {
                        ESCTRIX.state.p2p.sendToPeer(peers[0].clientId, { type: 'ping', timestamp: Date.now() });
                    }
                }
            }, 2000);
        },

        stopPingLoop() {
            clearInterval(ESCTRIX.state.pingInterval);
            ESCTRIX.state.pingInterval = null;
            ESCTRIX.elements.pingIndicator?.classList.add('hidden');
        }
    },

    // --- Voice Module ---
    voice: {
        async start() {
            if (!ESCTRIX.state.p2p?.isConnected()) { ESCTRIX.ui.showToast('Not connected.', 'error'); return; }
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                this.recorder = new MediaRecorder(stream);
                this.chunks = [];
                this.recorder.ondataavailable = e => { if (e.data.size > 0) this.chunks.push(e.data); };
                this.recorder.onstop = () => this.handleStop(stream);
                this.recorder.start();
                this.startSpeechRec();
                ESCTRIX.ui.updateVoiceUI(true);
            } catch (err) { ESCTRIX.ui.showToast('Microphone access denied.', 'error'); }
        },

        handleStop(stream) {
            ESCTRIX.ui.updateVoiceUI(false);
            const blob = new Blob(this.chunks, { type: 'audio/webm;codecs=opus' });
            stream.getTracks().forEach(t => t.stop());
            if (blob.size > 0 && ESCTRIX.state.p2p?.isConnected()) {
                this.sendVoiceNote(blob);
            }
        },

        sendVoiceNote(blob) {
            const name = `note_${Date.now()}_voice_note.webm`;
            const id = ESCTRIX.utils.generateId();
            const trans = ESCTRIX.state.currentTranscript || '';
            ESCTRIX.state.p2p.sendFileMetadata({ name, size: blob.size, fileType: blob.type, vanish: ESCTRIX.state.vanishMode, id, transcript: trans });
            ESCTRIX.chat.addFileMessage({ name, size: blob.size, fileType: blob.type, transcript: trans }, 'sent', null, ESCTRIX.state.vanishMode, id);

            const reader = new FileReader();
            reader.onload = ev => ESCTRIX.chat.transferFileBuffer(ev.target.result, name);
            reader.readAsArrayBuffer(blob);
        },

        startSpeechRec() {
            ESCTRIX.state.currentTranscript = '';
            const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (SR) {
                this.sr = new SR();
                this.sr.continuous = true;
                this.sr.interimResults = true;
                this.sr.onresult = (e) => {
                    let text = '';
                    for (let i = 0; i < e.results.length; ++i) {
                        if (e.results[i].isFinal) text += e.results[i][0].transcript + ' ';
                    }
                    ESCTRIX.state.currentTranscript = text.trim();
                };
                this.sr.start();
            }
        },

        stop() {
            if (this.recorder?.state !== 'inactive') this.recorder?.stop();
            if (this.sr) { this.sr.stop(); this.sr = null; }
        }
    },

    // --- Call Module ---
    call: {
        toggleCall() {
            if (ESCTRIX.state.isVideoCalling) this.end();
            else {
                ESCTRIX.elements.callTypePeerName.textContent = ESCTRIX.state.p2p?.peerName || 'Peer';
                ESCTRIX.elements.callTypeModal.classList.remove('hidden');
            }
        },

        initiate(type) {
            ESCTRIX.elements.callTypeModal.classList.add('hidden');
            ESCTRIX.state.pendingCallType = type;
            ESCTRIX.state.p2p.sendSignalingMessage('call_request', { callType: type });
            ESCTRIX.chat.addMessage(type === 'audio' ? '📞 Calling (Audio)...' : '📹 Calling (Video)...', 'system');
            ESCTRIX.elements.videoCallBtn.classList.add('active');
        },

        async accept() {
            const type = ESCTRIX.elements.callModal.dataset.callType || 'video';
            ESCTRIX.elements.callModal.classList.add('hidden');
            ESCTRIX.state.p2p.sendSignalingMessage('call_accepted');
            await this.startMedia(type);
        },

        decline() {
            ESCTRIX.elements.callModal.classList.add('hidden');
            ESCTRIX.state.p2p.sendSignalingMessage('call_declined');
            ESCTRIX.chat.addMessage('You declined the call.', 'system');
        },

        async startMedia(type) {
            try {
                const constraints = { audio: true, video: type === 'video' ? { width: 1280, height: 720 } : false };
                ESCTRIX.state.localVideoStream = await navigator.mediaDevices.getUserMedia(constraints);
                ESCTRIX.elements.localVideo.srcObject = ESCTRIX.state.localVideoStream;
                ESCTRIX.elements.videoOverlay.classList.remove('hidden');
                ESCTRIX.state.isVideoCalling = true;
                ESCTRIX.state.isCamOff = (type === 'audio');
                ESCTRIX.ui.updateCallUI();
                await ESCTRIX.state.p2p.startMedia(ESCTRIX.state.localVideoStream);
            } catch (err) { ESCTRIX.ui.showToast('Camera/Mic error.', 'error'); }
        },

        end() {
            if (!ESCTRIX.state.isVideoCalling) return;
            ESCTRIX.state.isVideoCalling = false;
            ESCTRIX.elements.videoOverlay.classList.add('hidden');
            ESCTRIX.elements.groupVideoGrid.innerHTML = '';
            if (ESCTRIX.state.localVideoStream) {
                ESCTRIX.state.localVideoStream.getTracks().forEach(t => t.stop());
                ESCTRIX.state.localVideoStream = null;
            }
            ESCTRIX.elements.localVideo.srcObject = null;
            ESCTRIX.ui.stopCallTimer();
            ESCTRIX.elements.videoCallBtn.classList.remove('active');
            ESCTRIX.chat.addMessage('Call ended.', 'system');
            ESCTRIX.state.p2p?.sendSignalingMessage('call_declined');
        },

        toggleMute() {
            ESCTRIX.state.isMuted = !ESCTRIX.state.isMuted;
            ESCTRIX.state.localVideoStream?.getAudioTracks().forEach(t => t.enabled = !ESCTRIX.state.isMuted);
            ESCTRIX.ui.updateMuteBtn();
        },

        toggleCam() {
            ESCTRIX.state.isCamOff = !ESCTRIX.state.isCamOff;
            ESCTRIX.state.localVideoStream?.getVideoTracks().forEach(t => t.enabled = !ESCTRIX.state.isCamOff);
            ESCTRIX.ui.updateCamBtn();
        },

        async toggleScreenShare() {
            if (!ESCTRIX.state.isScreenSharing) {
                try {
                    ESCTRIX.state.screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
                    const track = ESCTRIX.state.screenStream.getVideoTracks()[0];
                    track.onended = () => this.toggleScreenShare();
                    await ESCTRIX.state.p2p.replaceVideoTrack(track);
                    ESCTRIX.elements.localVideo.srcObject = ESCTRIX.state.screenStream;
                    ESCTRIX.state.isScreenSharing = true;
                    ESCTRIX.elements.screenShareBtn.classList.add('muted-active');
                } catch {}
            } else {
                ESCTRIX.state.isScreenSharing = false;
                ESCTRIX.elements.screenShareBtn.classList.remove('muted-active');
                ESCTRIX.state.screenStream?.getTracks().forEach(t => t.stop());
                const localTrack = ESCTRIX.state.localVideoStream?.getVideoTracks()[0];
                if (localTrack) await ESCTRIX.state.p2p.replaceVideoTrack(localTrack);
                ESCTRIX.elements.localVideo.srcObject = ESCTRIX.state.localVideoStream;
            }
        },

        sendIncallMessage() {
            const text = ESCTRIX.elements.incallMessageInput.value.trim();
            if (text && ESCTRIX.state.p2p?.isConnected()) {
                ESCTRIX.state.p2p.send({ type: 'incall_text', content: text, senderName: ESCTRIX.state.myUsername });
                this.addMessage(text, 'sent');
                ESCTRIX.elements.incallMessageInput.value = '';
            }
        },

        addMessage(text, type, sender = '') {
            const div = document.createElement('div');
            div.className = `message ${type} incall-msg`;
            div.innerHTML = sender ? `<strong>${sender}</strong>: ${text}` : text;
            ESCTRIX.elements.incallMessages.appendChild(div);
            ESCTRIX.elements.incallMessages.scrollTop = ESCTRIX.elements.incallMessages.scrollHeight;
        },

        handleRemoteStream(stream, peerId, username) {
            if (stream.getVideoTracks().length > 0) this.addVideoTile(stream, peerId, username);
            else { const a = document.getElementById('remote-audio'); if (a) a.srcObject = stream; }
        },

        addVideoTile(stream, peerId, username) {
            this.removeVideoTile(peerId);
            const grid = ESCTRIX.elements.groupVideoGrid;
            const tile = document.createElement('div');
            tile.className = 'video-tile';
            tile.dataset.peerId = peerId;
            const v = document.createElement('video');
            v.autoplay = true; v.playsInline = true; v.srcObject = stream;
            const l = document.createElement('div');
            l.className = 'video-tile-label';
            l.textContent = username || 'Peer';
            tile.append(v, l);
            grid.appendChild(tile);
            grid.dataset.count = grid.children.length;
        },

        removeVideoTile(peerId) {
            const tile = document.querySelector(`.video-tile[data-peer-id="${peerId}"]`);
            tile?.remove();
            ESCTRIX.elements.groupVideoGrid.dataset.count = ESCTRIX.elements.groupVideoGrid.children.length;
        },

        handleSignal(type, sender, data) {
            if (type === 'call_request') {
                ESCTRIX.elements.callerName.textContent = ESCTRIX.state.p2p?.peerName || 'Peer';
                ESCTRIX.elements.callModal.classList.remove('hidden');
                ESCTRIX.elements.callModal.dataset.callType = data?.callType || 'video';
            } else if (type === 'call_accepted') {
                this.startMedia(ESCTRIX.state.pendingCallType || 'video');
            } else if (type === 'call_declined') {
                if (ESCTRIX.state.isVideoCalling) this.end();
                else ESCTRIX.ui.showToast('Call declined.', 'error');
            }
        }
    },

    // --- Admin Module ---
    admin: {
        startStatsLoop() {
            this.fetchStats();
            ESCTRIX.state.adminStatsInterval = setInterval(() => this.fetchStats(), 5000);
            this.initWebSocket();
        },

        stopStatsLoop() {
            clearInterval(ESCTRIX.state.adminStatsInterval);
            ESCTRIX.state.adminWs?.close();
        },

        async fetchStats() {
            try {
                const res = await fetch(`/api/admin/stats?username=${ESCTRIX.state.myUsername}`);
                const data = await res.json();
                if (data.status === 'success') {
                    ESCTRIX.elements.statTotalUsers.textContent = data.total_users;
                    ESCTRIX.elements.statActiveHosts.textContent = data.active_hosts;
                    ESCTRIX.elements.statTotalConnections.textContent = data.total_connections;
                    this.renderHosts(data.active_hosts_list);
                    this.renderUsers(data.user_list);
                }
            } catch (e) { console.error('Admin stats error', e); }
        },

        renderHosts(list) {
            const ul = ESCTRIX.elements.adminHostsUl;
            ul.innerHTML = list.length === 0 ? '<li class="muted-li">No active spaces.</li>' : list.map(h => `
                <li class="admin-host-item">
                    <div class="host-info"><strong>${h.hostname}</strong> (${h.clients})</div>
                    <div class="host-users">${(h.users || []).map(u => `
                        <button onclick="ESCTRIX.admin.openKickModal('${h.hostname}','${u.username}')" class="admin-kick-btn">${u.username}${u.is_host ? ' ★' : ''}</button>
                    `).join('')}</div>
                </li>
            `).join('');
        },

        renderUsers(list) {
            const tbody = ESCTRIX.elements.adminUsersTbody;
            const protected = ['ESCTRIX_Admin', 'Gayathri'];
            tbody.innerHTML = list.map(u => `
                <tr>
                    <td>${u.id}</td>
                    <td>${u.username}</td>
                    <td align="right">${protected.includes(u.username) ? '<span class="prot">Protected</span>' : `
                        <button onclick="ESCTRIX.admin.deleteUser('${u.username}')" class="admin-del-btn"><i class="ph ph-trash"></i></button>
                    `}</td>
                </tr>
            `).join('');
        },

        initWebSocket() {
            const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
            ESCTRIX.state.adminWs = new WebSocket(`${protocol}//${location.host}/ws/admin_${Math.random().toString(36).substr(7)}`);
            ESCTRIX.state.adminWs.onopen = () => ESCTRIX.state.adminWs.send(JSON.stringify({ type: 'admin_auth', data: { username: ESCTRIX.state.myUsername, password: ESCTRIX.state.myPassword } }));
            ESCTRIX.state.adminWs.onmessage = (e) => {
                const msg = JSON.parse(e.data);
                if (msg.type === 'admin_chat_log') this.appendChatLog(msg);
            };
        },

        appendChatLog(msg) {
            const log = ESCTRIX.elements.adminChatLog;
            const span = document.createElement('span');
            span.innerHTML = `[<span class="room">${msg.room}</span>] <span class="sender">${msg.sender}</span>: ${msg.content}<br>`;
            log.appendChild(span);
            log.scrollTop = log.scrollHeight;
        },

        openKickModal(room, user) {
            ESCTRIX.state.kickTarget = { room, user };
            ESCTRIX.elements.kickModalTarget.textContent = user;
            ESCTRIX.elements.kickAdminModal.classList.remove('hidden');
        },

        async confirmKick() {
            const { room, user } = ESCTRIX.state.kickTarget;
            const msg = ESCTRIX.elements.kickCustomMsg.value.trim() || 'Removed by administrator.';
            ESCTRIX.elements.kickAdminModal.classList.add('hidden');
            const res = await fetch('/api/admin/kick', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ admin_username: ESCTRIX.state.myUsername, target_username: user, space_name: room, kick_message: msg })
            });
            const data = await res.json();
            ESCTRIX.ui.showToast(data.status === 'success' ? `Kicked ${user}!` : data.message);
            this.fetchStats();
        },

        async deleteUser(user) {
            if (!confirm(`Delete user "${user}"?`)) return;
            const res = await fetch('/api/admin/delete_user', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ admin_username: ESCTRIX.state.myUsername, target_username: user })
            });
            ESCTRIX.ui.showToast((await res.json()).status === 'success' ? `Deleted ${user}!` : 'Failed');
            this.fetchStats();
        },

        async broadcast() {
            const inp = ESCTRIX.elements.adminBroadcastMsg;
            const msg = inp.value.trim();
            if (!msg) return;
            const res = await fetch('/api/admin/broadcast', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ admin_username: ESCTRIX.state.myUsername, message: msg })
            });
            if ((await res.json()).status === 'success') {
                inp.value = '';
                ESCTRIX.ui.showToast('Broadcast sent.');
            }
        },

        enterApp() {
            this.stopStatsLoop();
            ESCTRIX.navigation.showScreen(ESCTRIX.elements.dashboardScreen);
        },

        showKickedOverlay(msg) {
            ESCTRIX.elements.kickedMessage.textContent = msg;
            ESCTRIX.elements.kickedOverlay.classList.remove('hidden');
        },

        handleKickedOk() {
            ESCTRIX.elements.kickedOverlay.classList.add('hidden');
            ESCTRIX.navigation.showScreen(ESCTRIX.elements.dashboardScreen, false);
            history.replaceState({ depth: 0 }, '', location.href);
            ESCTRIX.state.screenHistory = [];
        }
    },

    // --- UI & Utilities ---
    ui: {
        showToast(msg, type = 'success') {
            const t = ESCTRIX.elements.toast;
            ESCTRIX.elements.toastMsg.textContent = msg;
            t.classList.remove('hidden');
            t.className = `toast show ${type === 'success' ? 'success' : 'error'}`;
            t.style.background = type === 'success' ? 'linear-gradient(135deg, #10b981, #059669)' : 'linear-gradient(135deg, #f04a4a, #c53030)';
            setTimeout(() => {
                t.classList.remove('show');
                setTimeout(() => t.classList.add('hidden'), 400);
            }, 3000);
        },

        updatePing(rtt) {
            const p = ESCTRIX.elements.pingIndicator;
            if (!p) return;
            p.classList.remove('hidden');
            const color = rtt > 150 ? '#f04a4a' : (rtt > 80 ? '#ffcc00' : '#10b981');
            p.innerHTML = `<span style="color:${color}">${rtt}ms</span>`;
        },

        showTypingIndicator() {
            const ind = ESCTRIX.elements.typingIndicator;
            if (!ind) return;
            ind.classList.remove('hidden');
            clearTimeout(this.typingTimeout);
            this.typingTimeout = setTimeout(() => ind.classList.add('hidden'), 3000);
        },

        updateUploadProgress(sent, total, name, speed) {
            const pct = Math.round((sent / total) * 100);
            const kbps = (speed / 1024).toFixed(1);
            const disp = kbps > 1024 ? (kbps / 1024).toFixed(2) + ' MB/s' : kbps + ' KB/s';
            ESCTRIX.elements.fileUploadProgress.classList.remove('hidden');
            ESCTRIX.elements.progressBarFill.style.width = pct + '%';
            ESCTRIX.elements.progressPercent.textContent = pct + '%';
            ESCTRIX.elements.progressFilename.textContent = name;
            ESCTRIX.elements.progressSpeed.textContent = disp;
            if (pct >= 100) setTimeout(() => ESCTRIX.elements.fileUploadProgress.classList.add('hidden'), 1500);
        },

        updateVoiceUI(isRecording) {
            ESCTRIX.elements.voiceRecordingBar.classList.toggle('hidden', !isRecording);
            ESCTRIX.elements.voiceNoteBtn.classList.toggle('recording', isRecording);
            if (isRecording) {
                ESCTRIX.state.voiceSeconds = 0;
                this.voiceTimer = setInterval(() => {
                    const s = ++ESCTRIX.state.voiceSeconds;
                    ESCTRIX.elements.voiceRecTimer.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
                }, 1000);
            } else {
                clearInterval(this.voiceTimer);
            }
        },

        updateCallUI() {
            ESCTRIX.state.callSeconds = 0;
            ESCTRIX.state.callTimerInterval = setInterval(() => {
                const s = ++ESCTRIX.state.callSeconds;
                ESCTRIX.elements.callTimer.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
            }, 1000);
            this.updateMuteBtn();
            this.updateCamBtn();
        },

        stopCallTimer() {
            clearInterval(ESCTRIX.state.callTimerInterval);
        },

        updateMuteBtn() {
            ESCTRIX.elements.muteBtn.innerHTML = ESCTRIX.state.isMuted ? '<i class="ph ph-microphone-slash"></i>' : '<i class="ph ph-microphone"></i>';
            ESCTRIX.elements.muteBtn.classList.toggle('muted-active', ESCTRIX.state.isMuted);
        },

        updateCamBtn() {
            ESCTRIX.elements.camOffBtn.innerHTML = ESCTRIX.state.isCamOff ? '<i class="ph ph-video-camera-slash"></i>' : '<i class="ph ph-video-camera"></i>';
            ESCTRIX.elements.camOffBtn.classList.toggle('muted-active', ESCTRIX.state.isCamOff);
        }
    },

    verification: {
        async openModal() {
            const seed = ESCTRIX.state.activeRoomName + (ESCTRIX.state.pin || '');
            const encoder = new TextEncoder();
            const data = encoder.encode(seed);
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

            ESCTRIX.elements.e2eeHashLabel.textContent = hashHex;
            const ctx = ESCTRIX.elements.e2eeCanvas.getContext('2d');
            ctx.clearRect(0, 0, 200, 200);
            ctx.fillStyle = '#0d1117'; ctx.fillRect(0, 0, 200, 200);
            ctx.fillStyle = '#' + hashHex.substr(0, 6);
            for (let i = 0; i < 15; i++) {
                if (hashArray[i] % 2 === 0) {
                    const r = Math.floor(i / 3), c = i % 3;
                    ctx.fillRect(c * 40 + 44, r * 40 + 4, 32, 32);
                    ctx.fillRect((4 - c) * 40 + 44, r * 40 + 4, 32, 32);
                }
            }
            ESCTRIX.elements.e2eeModal.classList.remove('hidden');
        }
    },

    utils: {
        generateId: () => Math.random().toString(36).substr(2, 9),
        formatBytes: (b) => {
            if (b === 0) return '0 Bytes';
            const i = Math.floor(Math.log(b) / Math.log(1024));
            return parseFloat((b / Math.pow(1024, i)).toFixed(2)) + ' ' + ['Bytes', 'KB', 'MB', 'GB'][i];
        },
        download: (url, name) => {
            const a = document.createElement('a'); a.href = url; a.download = name; a.click();
        },
        downloadText: (text, name) => {
            const b = new Blob([text], { type: 'text/plain' });
            const url = URL.createObjectURL(b);
            const a = document.createElement('a'); a.href = url; a.download = name; a.click();
        }
    }
};

document.addEventListener('DOMContentLoaded', () => ESCTRIX.init());
