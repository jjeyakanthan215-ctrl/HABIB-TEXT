document.addEventListener('DOMContentLoaded', () => {
    // ── PWA Service Worker ──
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/static/sw.js').catch(err => console.error('SW sync error', err));
    }

    // ── Screens ──
    const loginScreen     = document.getElementById('login-screen');
    const dashboardScreen = document.getElementById('dashboard-screen');
    const adminScreen     = document.getElementById('admin-screen');
    const chatScreen      = document.getElementById('chat-screen');
    const backBtn         = document.getElementById('back-btn');

    // ── Mobile Back Button Support ──
    history.replaceState({ depth: 0 }, '', location.href);

    // Screen history stack for back-navigation
    let screenHistory = [];

    function showScreen(next, pushHistory = true) {
        const current = document.querySelector('.screen.active');
        if (current && current !== next) {
            current.classList.add('slide-out-left');
            setTimeout(() => current.classList.remove('active', 'slide-out-left'), 380);
            if (pushHistory) {
                screenHistory.push(current);
                history.pushState({ depth: screenHistory.length }, '', location.href);
            }
        }
        next.classList.add('active');
        updateBackBtn();
    }

    function goBackUI() {
        if (screenHistory.length === 0) return;
        const prev = screenHistory.pop();
        const current = document.querySelector('.screen.active');
        if (current) {
            current.classList.remove('active');
            current.style.transform = 'translateX(40px)';
            setTimeout(() => { current.style.transform = ''; }, 380);
        }
        prev.classList.add('active');
        updateBackBtn();
    }

    function updateBackBtn() {
        if (screenHistory.length > 0) {
            backBtn.classList.remove('hidden');
        } else {
            backBtn.classList.add('hidden');
        }
    }

    window.addEventListener('popstate', (e) => {
        const hw = document.getElementById('host-waiting');
        if (hw && hw.style.display === 'block') {
            if (typeof stopHostingLogic === 'function') stopHostingLogic();
        } else if (chatScreen.classList.contains('active')) {
            if (typeof p2p !== 'undefined' && p2p) {
                if (p2p.ws) p2p.ws.close();
                p2p = null;
                if (typeof endVideoCall === 'function') endVideoCall();
            }
            goBackUI();
        } else if (screenHistory.length > 0) {
            goBackUI();
        }
    });

    backBtn.addEventListener('click', () => {
        history.back();
    });

    // ── Logout ──
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            if (typeof p2p !== 'undefined' && p2p) {
                if (p2p.ws) p2p.ws.close();
                p2p = null;
                if (typeof endVideoCall === 'function') endVideoCall();
            }
            const hw = document.getElementById('host-waiting');
            if (hw && hw.style.display === 'block') {
                if (typeof stopHostingLogic === 'function') stopHostingLogic();
            }
            
            // Disconnect admin websocket if present
            if (typeof adminWs !== 'undefined' && adminWs) {
                adminWs.close();
                adminWs = null;
            }
            if (typeof adminStatsInterval !== 'undefined' && adminStatsInterval) {
                clearInterval(adminStatsInterval);
                adminStatsInterval = null;
            }

            myUsername = '';
            const authPasswordInput = document.getElementById('auth-password');
            if (authPasswordInput) authPasswordInput.value = '';
            
            showScreen(loginScreen, false);
            logoutBtn.classList.add('hidden');
            showToast('Logged out successfully.');
            history.replaceState({ depth: 0 }, '', location.href);
            screenHistory = [];
        });
    }

    // ── Toast ──
    function showToast(msg, type = 'success') {
        const toast = document.getElementById('toast');
        const toastMsg = document.getElementById('toast-msg');
        const toastIcon = toast.querySelector('.toast-icon');

        toast.classList.remove('hidden');
        toastMsg.textContent = msg;
        toastIcon.className = type === 'success'
            ? 'ph ph-check-circle toast-icon'
            : 'ph ph-warning-circle toast-icon';
        toast.style.background = type === 'success'
            ? 'linear-gradient(135deg, #10b981, #059669)'
            : 'linear-gradient(135deg, #f04a4a, #c53030)';

        requestAnimationFrame(() => {
            requestAnimationFrame(() => toast.classList.add('show'));
        });

        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.classList.add('hidden'), 400);
        }, 3000);
    }

    // Removed Particles Background to prevent device heating

    // ── Auth Elements ──
    const authTitle       = document.getElementById('auth-title');
    const authSubtitle    = document.getElementById('auth-subtitle');
    const authUsernameInput = document.getElementById('auth-username');
    const authPasswordInput = document.getElementById('auth-password');
    const authSubmitBtn   = document.getElementById('auth-submit-btn');
    const authToggle      = document.getElementById('auth-toggle');
    const loginError      = document.getElementById('login-error');
    const authSubmitIcon  = authSubmitBtn.querySelector('i');

    let isLoginMode = true;

    authToggle.addEventListener('click', () => {
        isLoginMode = !isLoginMode;
        loginError.textContent = '';
        authUsernameInput.value = '';
        authPasswordInput.value = '';
        if (isLoginMode) {
            authTitle.textContent = 'Welcome Back';
            authSubtitle.textContent = 'Login to access your secure space.';
            authSubmitBtn.innerHTML = '<i class="ph ph-sign-in"></i> Login';
            authToggle.innerHTML = "Don't have an account? <span class='link'>Register</span>";
        } else {
            authTitle.textContent = 'Create Account';
            authSubtitle.textContent = 'Join HABIB TEXT for secure P2P messaging.';
            authSubmitBtn.innerHTML = '<i class="ph ph-user-plus"></i> Register';
            authToggle.innerHTML = "Already have an account? <span class='link'>Login</span>";
        }
    });

    authSubmitBtn.addEventListener('click', async () => {
        const username = authUsernameInput.value.trim();
        const password = authPasswordInput.value.trim();

        if (!username || !password) {
            loginError.textContent = 'Please fill in both fields.';
            return;
        }

        loginError.textContent = 'Please wait...';
        authSubmitBtn.disabled = true;

        const endpoint = isLoginMode ? '/api/auth/login' : '/api/auth/register';

        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();

            if (data.status === 'success') {
                loginError.textContent = '';

                if (!isLoginMode) {
                    // ✅ Registration: show toast, switch to login mode
                    showToast('Account created! Please log in.');
                    authUsernameInput.value = '';
                    authPasswordInput.value = '';
                    // Auto-switch back to login mode
                    isLoginMode = true;
                    authTitle.textContent = 'Welcome Back';
                    authSubtitle.textContent = 'Account created! Now login to continue.';
                    authSubmitBtn.innerHTML = '<i class="ph ph-sign-in"></i> Login';
                    authToggle.innerHTML = "Don't have an account? <span class='link'>Register</span>";
                } else {
                    // ✅ Login success
                    myUsername = username;
                    myPassword = password;
                    document.getElementById('welcome-username').textContent = `Hello, ${username} 👋`;
                    screenHistory = []; // Reset history at login
                    if (data.role === 'admin') {
                        showScreen(adminScreen, false);
                        startAdminStatsLoop();
                    } else {
                        showScreen(dashboardScreen, false);
                    }
                    const lBtn = document.getElementById('logout-btn');
                    if (lBtn) lBtn.classList.remove('hidden');
                }
            } else {
                loginError.textContent = data.message || 'Authentication failed.';
            }
        } catch (err) {
            loginError.textContent = 'Server error. Please try again.';
        } finally {
            authSubmitBtn.disabled = false;
        }
    });

    // ── Admin ──
    let adminStatsInterval = null;
    let adminWs = null;

    const startAdminStatsLoop = async () => {
        fetchAdminStats();
        adminStatsInterval = setInterval(fetchAdminStats, 5000);

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        adminWs = new WebSocket(`${protocol}//${window.location.host}/ws/admin_${Math.random().toString(36).substring(7)}`);
        adminWs.onopen = () => adminWs.send(JSON.stringify({ type: 'admin_auth', data: { username: myUsername, password: myPassword } }));
        adminWs.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            if (msg.type === 'admin_chat_log') {
                const logDiv = document.getElementById('admin-chat-log');
                const span = document.createElement('span');
                span.innerHTML = `[<span style="color:#ffcc00">${msg.room}</span>] <span style="color:#00ccff">${msg.sender}</span>: ${msg.content}<br>`;
                logDiv.appendChild(span);
                logDiv.scrollTop = logDiv.scrollHeight;
            }
        };
    };

    const fetchAdminStats = async () => {
        try {
            const res = await fetch(`/api/admin/stats?username=${myUsername}`);
            const data = await res.json();
            if (data.status === 'success') {
                document.getElementById('stat-total-users').textContent       = data.total_users;
                document.getElementById('stat-active-hosts').textContent      = data.active_hosts;
                document.getElementById('stat-total-connections').textContent = data.total_connections;

                const ul = document.getElementById('admin-hosts-ul');
                ul.innerHTML = data.active_hosts_list.length === 0
                    ? '<li class="muted-li">No active spaces.</li>'
                    : data.active_hosts_list.map(h => {
                        const userBtns = (h.users || []).map(u =>
                            `<button onclick="openKickModal('${h.hostname}','${u.username}')" class="admin-kick-btn" style="margin:2px 2px 0 0"><i class="ph ph-user-minus"></i> ${u.username}${u.is_host ? ' ★' : ''}</button>`
                        ).join('');
                        return `<li style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05)"><div style="display:flex;align-items:center;justify-content:space-between"><span><i class="ph ph-shield-check" style="color:var(--success)"></i> <strong>${h.hostname}</strong> <span style="opacity:0.5;font-size:0.8em">(${h.clients})</span></span></div><div style="margin-top:6px;flex-wrap:wrap;display:flex">${userBtns}</div></li>`;
                    }).join('');

                const tbody = document.getElementById('admin-users-tbody');
                tbody.innerHTML = (data.user_list || []).map(u =>
                    `<tr>
                        <td style="padding:7px 0">${u.id}</td>
                        <td style="padding:7px 0">${u.username}</td>
                        <td style="padding:7px 0;text-align:right">
                            ${['HABIB_Admin', 'Gayathri'].includes(u.username) ? '<span style="opacity:0.3;font-size:0.8em">Protected</span>' : `<button onclick="deleteRegisteredUser('${u.username}')" class="admin-delete-btn"><i class="ph ph-trash"></i></button>`}
                        </td>
                    </tr>`
                ).join('');
            }
        } catch (e) { console.error('Admin stats error', e); }
    };

    window.openKickModal = (spaceName, username) => {
        kickTargetUsername = username;
        kickTargetRoom = spaceName;
        document.getElementById('kick-modal-target').textContent = username;
        document.getElementById('kick-custom-msg').value = '';
        document.querySelectorAll('.kick-reason-btn').forEach(b => b.classList.remove('selected'));
        document.getElementById('kick-admin-modal').classList.remove('hidden');
    };

    window.kickUserFromRoom = async (spaceName, username) => {
        openKickModal(spaceName, username);
    };

    window.deleteRegisteredUser = async (username) => {
        if (!confirm(`Permanently delete user "${username}"? This cannot be undone.`)) return;
        const res = await fetch('/api/admin/delete_user', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ admin_username: myUsername, target_username: username })
        });
        const data = await res.json();
        showToast(data.status === 'success' ? `Deleted ${username}!` : data.message, data.status === 'success' ? 'success' : 'error');
        fetchAdminStats();
    };

    document.getElementById('admin-enter-app-btn')?.addEventListener('click', () => {
        if (adminStatsInterval) clearInterval(adminStatsInterval);
        if (adminWs) adminWs.close();
        showScreen(dashboardScreen);
    });


    // ── Dashboard Tabs ──
    const tabHost     = document.getElementById('tab-host');
    const tabJoin     = document.getElementById('tab-join');
    const hostSetup   = document.getElementById('host-setup');
    const clientSetup = document.getElementById('client-setup');
    const hostWaiting = document.getElementById('host-waiting');

    tabHost.addEventListener('click', () => {
        tabHost.classList.add('active-tab');
        tabJoin.classList.remove('active-tab');
        hostSetup.style.display   = 'block';
        clientSetup.style.display = 'none';
        hostWaiting.style.display = 'none';
    });

    tabJoin.addEventListener('click', () => {
        tabJoin.classList.add('active-tab');
        tabHost.classList.remove('active-tab');
        clientSetup.style.display = 'block';
        hostSetup.style.display   = 'none';
        hostWaiting.style.display = 'none';
    });

    // ── Host ──
    document.getElementById('start-host-btn').addEventListener('click', async () => {
        const pin = document.getElementById('host-pin').value.trim();
        const spaceName = document.getElementById('host-space-name').value.trim() || myUsername;
        try {
            const response = await fetch('/api/host/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: myUsername, space_name: spaceName, pin })
            });
            const data = await response.json();
            if (data.status === 'success') {
                document.getElementById('qr-code-img').src    = 'data:image/png;base64,' + data.qr_code;
                document.getElementById('display-pin').textContent = pin || 'None';
                document.getElementById('my-space-name').textContent = spaceName;

                hostSetup.style.display   = 'none';
                hostWaiting.style.display = 'block';
                tabHost.style.display     = 'none';
                tabJoin.style.display     = 'none';

                activeRoomName = spaceName;
                initWebRTC(null, pin, myUsername, spaceName);
                history.pushState({ hosting: true }, '', location.href);
            } else {
                const hostError = document.getElementById('host-error');
                if (hostError) hostError.textContent = data.message || 'Failed to create space.';
                showToast(data.message || 'Space name already in use.', 'error');
            }
        } catch (err) { console.error('Host start error', err); }
    });

    window.stopHostingLogic = async () => {
        try {
            await fetch('/api/host/stop', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ space_name: activeRoomName })
            });
        } catch (err) { console.error('Stop host error', err); }

        if (p2p && p2p.ws) {
            p2p.ws.close();
            p2p = null;
        }

        hostWaiting.style.display = 'none';
        hostSetup.style.display   = 'block';
        tabHost.style.display     = '';
        tabJoin.style.display     = '';
        activeRoomName = '';
        showToast('Hosting stopped.', 'success');
    };

    document.getElementById('stop-host-btn')?.addEventListener('click', () => {
        history.back();
    });

    // ── Join ──
    const joinError = document.getElementById('auth-error');
    document.getElementById('connect-btn').addEventListener('click', () => {
        const hostUsername = document.getElementById('join-space-name').value.trim();
        const pin          = document.getElementById('join-pin').value.trim();
        if (hostUsername) {
            joinError.textContent = 'Connecting...';
            activeRoomName = hostUsername;
            initWebRTC(null, pin, myUsername, hostUsername);
        } else {
            joinError.textContent = 'Please enter the Space Name.';
        }
    });

    // ── State ──
    let p2p             = null;
    let myUsername      = '';
    let myPassword      = '';
    let activeRoomName  = '';
    const fileReceives = {}; // Maps _fromPeerId to { meta, buffer, size }
    let localVideoStream = null;
    let isVideoCalling  = false;
    let isMuted         = false;
    let isCamOff        = false;
    let callTimerInterval = null;
    let callSeconds     = 0;
    
    // ── Ping System ──
    let pingInterval = null;
    const updatePingUI = (rtt) => {
        const pingEl = document.getElementById('ping-indicator');
        if (pingEl) {
            pingEl.classList.remove('hidden');
            let color = '#10b981'; // Green
            if (rtt > 150) color = '#f04a4a'; // Red
            else if (rtt > 80) color = '#ffcc00'; // Yellow
            pingEl.innerHTML = `<span style="color:${color}">${rtt}ms</span>`;
        }
    };

    // ── Connection State ──
    const statusDot  = document.querySelector('.dot');
    const statusText = document.querySelector('.status-text');

    const setConnectionState = (state, data = null) => {
        const videoCallBtn = document.getElementById('video-call-btn');
        if (state === 'connected') {
            statusDot.classList.add('connected');
            const cnt = p2p?.getPeerCount() || 1;
            statusText.textContent = cnt > 1 ? `Group (${cnt} peers)` : `Connected to ${data?.username || p2p?.peerName || 'Peer'}`;
            if (!chatScreen.classList.contains('active')) showScreen(chatScreen);
            videoCallBtn.classList.remove('hidden');
            if (data?.username) addMessage(`${data.username} joined the room. 🎉`, 'system');
            
            // Start Ping
            if (!pingInterval) {
                pingInterval = setInterval(() => {
                    if (p2p && p2p.isConnected()) {
                        const peerList = p2p.getPeerList();
                        if (peerList.length > 0) {
                            p2p.sendToPeer(peerList[0].clientId, { type: 'ping', timestamp: Date.now() });
                        }
                    }
                }, 2000);
            }
        } else if (state === 'peer_joining') {
            if (data?.username) addMessage(`${data.username} is connecting...`, 'system');
        } else if (state === 'peer_left') {
            if (data?.clientId) removeRemoteVideoTile(data.clientId);
            const cnt = p2p?.getPeerCount() || 0;
            if (cnt > 0) {
                statusText.textContent = `Group (${cnt} peer${cnt > 1 ? 's' : ''})`;
            } else {
                statusDot.classList.remove('connected');
                statusText.textContent = 'Offline';
                videoCallBtn.classList.add('hidden');
                if (isVideoCalling) endVideoCall();
                if (chatScreen.classList.contains('active')) goBackUI();
            }
            addMessage('A peer has left the room.', 'system');
        } else if (state === 'disconnected') {
            statusDot.classList.remove('connected');
            statusText.textContent = 'Offline';
            videoCallBtn.classList.add('hidden');
            if (pingInterval) { clearInterval(pingInterval); pingInterval = null; }
            document.getElementById('ping-indicator')?.classList.add('hidden');
            if (isVideoCalling) endVideoCall();
            if (chatScreen.classList.contains('active')) goBackUI();
        } else if (state === 'failed_auth') {
            const reason = p2p?.authReason;
            joinError.textContent = p2p?.authMessage || (reason === 'full' ? 'Room is full! Max 4 people.' : reason === 'host_taken' ? 'Space name already taken by another host.' : 'Invalid PIN or host not found.');
            document.getElementById('join-pin').value = '';
        } else if (state === 'kicked') {
            showKickedOverlay(p2p?.kickMessage || 'You have been removed by the administrator.');
            if (p2p) { p2p.disconnect(); p2p = null; }
            if (chatScreen.classList.contains('active')) goBackUI();
        } else if (state === 'admin_broadcast') {
            const overlay = document.createElement('div');
            overlay.className = 'kicked-overlay';
            overlay.innerHTML = `<div class="kicked-card" style="background:rgba(240,180,0,0.1); border-color:rgba(240,180,0,0.3)">
                <div class="kicked-icon" style="background:#ffcc00; color:#000; box-shadow:0 0 40px rgba(240,180,0,0.4)"><i class="ph ph-megaphone"></i></div>
                <h2 style="color:#ffcc00">System Broadcast</h2>
                <p>${data?.message || 'Important update.'}</p>
                <button class="btn" style="background:#ffcc00; color:#000; width:100%; margin-top:20px; font-weight:bold" onclick="this.parentElement.parentElement.remove()">Acknowledge</button>
            </div>`;
            document.body.appendChild(overlay);
        }
    };

    // ── Messages ──
    const messagesList = document.getElementById('messages-list');
    
    // ── Reactions ──
    const generateId = () => Math.random().toString(36).substr(2, 9);
    const emojiPicker = document.getElementById('emoji-picker');
    let reactionTargetId = null;

    if (emojiPicker) {
        document.querySelectorAll('.emoji-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const emoji = e.target.textContent;
                if (reactionTargetId && p2p?.dataChannel?.readyState === 'open') {
                    p2p.send({ type: 'reaction', messageId: reactionTargetId, emoji: emoji });
                    addReactionToMessage(reactionTargetId, emoji);
                }
                emojiPicker.classList.add('hidden');
                reactionTargetId = null;
            });
        });

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.emoji-picker') && !e.target.closest('.message')) {
                emojiPicker.classList.add('hidden');
            }
        });
    }

    const addReactionToMessage = (msgId, emoji) => {
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
    };
    
    const bindMessageEvents = (div, id) => {
        div.dataset.id = id;
        div.style.position = 'relative'; // ensure badge positioning
        div.addEventListener('dblclick', (e) => {
            reactionTargetId = id;
            if (emojiPicker) {
                emojiPicker.classList.remove('hidden');
                emojiPicker.style.left = Math.min(e.pageX, window.innerWidth - 150) + 'px';
                emojiPicker.style.top = (e.pageY - 50) + 'px';
            }
        });
    };

    // ── Vanish Mode ──
    let vanishMode = false;
    const vanishModeBtn = document.getElementById('vanish-mode-btn');
    if (vanishModeBtn) {
        vanishModeBtn.addEventListener('click', () => {
            vanishMode = !vanishMode;
            vanishModeBtn.classList.toggle('primary-icon', vanishMode);
            showToast(vanishMode ? 'Vanish Mode ON' : 'Vanish Mode OFF');
        });
    }

    const addMessage = (text, type = 'sent', senderName = '', isVanish = false, msgId = null) => {
        const id = msgId || generateId();
        const div = document.createElement('div');
        div.className = `message ${type}`;
        bindMessageEvents(div, id);
        if (isVanish) div.classList.add('vanish-msg');
        if (senderName && type === 'received') {
            div.innerHTML = `<strong style="font-size:0.75em; opacity:0.7; display:block; margin-bottom:3px">${senderName}</strong>${text}`;
        } else {
            div.textContent = text;
        }
        messagesList.appendChild(div);
        messagesList.scrollTop = messagesList.scrollHeight;
        
        if (isVanish) {
            setTimeout(() => {
                div.classList.add('fade-out');
                setTimeout(() => div.remove(), 400);
            }, 10000);
        }
    };

    const addFileMessage = (fileMeta, type = 'sent', fileBlob = null, isVanish = false, msgId = null) => {
        const id = msgId || generateId();
        const div = document.createElement('div');
        div.className = `message ${type} file-message`;
        bindMessageEvents(div, id);
        if (isVanish) div.classList.add('vanish-msg');
        
        let html = '';
        if (fileMeta.name.endsWith('_voice_note.webm') || fileMeta.isVoiceNote) {
            const transcriptHtml = fileMeta.transcript ? `<div class="voice-transcript">AI: "${fileMeta.transcript}"</div>` : '';
            if (type === 'received' && fileBlob) {
                const url = URL.createObjectURL(fileBlob);
                html = `<i class="ph ph-microphone file-icon" style="color:var(--accent)"></i><div class="file-info"><span class="file-name">Voice Note</span><audio controls src="${url}" style="height:36px; margin-top:6px; max-width:200px;"></audio>${transcriptHtml}</div>`;
            } else {
                html = `<i class="ph ph-microphone file-icon" style="color:var(--accent)"></i><div class="file-info"><span class="file-name">Voice Note</span><span class="file-size" style="margin-top:4px">Sent ✓</span>${transcriptHtml}</div>`;
            }
        } else if (fileMeta.fileType?.startsWith('image/')) {
            if (type === 'received' && fileBlob) {
                const url = URL.createObjectURL(fileBlob);
                html = `<img src="${url}" style="max-width:100%; max-height:200px; border-radius:8px; cursor:pointer;" onclick="window.open('${url}')"><div class="file-info" style="margin-top:4px"><span class="file-name" style="font-size:0.7rem">${fileMeta.name}</span><button class="file-download" style="margin-top:2px; padding:2px 8px" onclick="const a=document.createElement('a');a.href='${url}';a.download='${fileMeta.name}';a.click()"><i class="ph ph-download-simple"></i></button></div>`;
            } else {
                html = `<i class="ph ph-image file-icon"></i><div class="file-info"><span class="file-name">${fileMeta.name}</span><span class="file-size">Sent ✓</span></div>`;
            }
        } else if (fileMeta.fileType?.startsWith('video/')) {
            if (type === 'received' && fileBlob) {
                const url = URL.createObjectURL(fileBlob);
                html = `<video controls src="${url}" style="max-width:100%; max-height:200px; border-radius:8px;"></video><div class="file-info" style="margin-top:4px"><span class="file-name" style="font-size:0.7rem">${fileMeta.name}</span><button class="file-download" style="margin-top:2px; padding:2px 8px" onclick="const a=document.createElement('a');a.href='${url}';a.download='${fileMeta.name}';a.click()"><i class="ph ph-download-simple"></i></button></div>`;
            } else {
                html = `<i class="ph ph-video file-icon"></i><div class="file-info"><span class="file-name">${fileMeta.name}</span><span class="file-size">Sent ✓</span></div>`;
            }
        } else {
            let icon = 'ph-file';
            html = `<i class="ph ${icon} file-icon"></i><div class="file-info"><span class="file-name">${fileMeta.name}</span><span class="file-size">${formatBytes(fileMeta.size)}</span>`;
            if (type === 'received' && fileBlob) {
                const url = URL.createObjectURL(fileBlob);
                html += `<button class="file-download" onclick="const a=document.createElement('a');a.href='${url}';a.download='${fileMeta.name}';a.click()"><i class="ph ph-download-simple"></i> Download</button>`;
            } else {
                html += `<span class="file-size" style="margin-top:4px">Sent ✓</span>`;
            }
            html += `</div>`;
        }
        
        div.innerHTML = html;
        messagesList.appendChild(div);
        messagesList.scrollTop = messagesList.scrollHeight;
        
        if (isVanish) {
            setTimeout(() => {
                div.classList.add('fade-out');
                setTimeout(() => div.remove(), 400);
            }, 10000);
        }
    };


    const formatBytes = (bytes, dec = 2) => {
        if (!+bytes) return '0 Bytes';
        const k = 1024, dm = dec < 0 ? 0 : dec;
        const sizes = ['Bytes','KB','MB','GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
    };

    const addIncallMessage = (text, type = 'sent', senderName = '') => {
        const div = document.createElement('div');
        div.className = `message ${type}`;
        div.style.padding = '8px 12px';
        div.style.fontSize = '0.85rem';
        if (senderName && type === 'received') {
            div.innerHTML = `<strong style="font-size:0.8em; opacity:0.7; display:block; margin-bottom:2px">${senderName}</strong>${text}`;
        } else {
            div.textContent = text;
        }
        document.getElementById('incall-messages').appendChild(div);
        document.getElementById('incall-messages').scrollTop = document.getElementById('incall-messages').scrollHeight;
    };

    // ── WebRTC Init ──
    const initWebRTC = (serverIp, pin, myName, hostName) => {
        p2p = new P2PConnection(
            (msg)                   => handleIncomingData(msg),
            (state, data)           => setConnectionState(state, data),
            (stream, peerId, uname) => {
                if (stream.getVideoTracks().length > 0) addRemoteVideoTile(stream, peerId, uname);
                else { const a = document.getElementById('remote-audio'); if (a) a.srcObject = stream; }
            },
            (type, sender, d)       => handleCallSignal(type, sender, d)
        );
        p2p.connectSignaling(serverIp, pin, myName, hostName);
    };

    const handleIncomingData = (msg) => {
        if (msg.type === 'ping') {
            if (p2p?.dataChannel?.readyState === 'open' || p2p?.isConnected()) {
                p2p.sendToPeer(msg._fromPeerId, { type: 'pong', timestamp: msg.timestamp });
            }
        } else if (msg.type === 'pong') {
            const rtt = Date.now() - msg.timestamp;
            updatePingUI(rtt);
        } else if (msg.type === 'text') {
            addMessage(msg.content, 'received', msg.senderName, msg.vanish, msg.id);
        } else if (msg.type === 'reaction') {
            addReactionToMessage(msg.messageId, msg.emoji);
        } else if (msg.type === 'incall_text') {
            addIncallMessage(msg.content, 'received', msg.senderName);
        } else if (msg.type === 'file_meta') {
            const peerId = msg._fromPeerId || 'unknown';
            fileReceives[peerId] = { meta: msg, buffer: [], size: 0 };
        } else if (msg.type === 'file_data') {
            const peerId = msg._fromPeerId || 'unknown';
            const transfer = fileReceives[peerId];
            if (transfer && transfer.meta) {
                transfer.buffer.push(msg.data);
                transfer.size += msg.data.byteLength;
                if (transfer.size === transfer.meta.size) {
                    const blob = new Blob(transfer.buffer, { type: transfer.meta.fileType });
                    addFileMessage(transfer.meta, 'received', blob, transfer.meta.vanish, transfer.meta.id);
                    delete fileReceives[peerId];
                }
            }
        } else if (msg.type === 'typing') {
            const ind = document.getElementById('typing-indicator');
            if (ind) {
                ind.classList.remove('hidden');
                clearTimeout(ind.typingTimeout);
                ind.typingTimeout = setTimeout(() => ind.classList.add('hidden'), 3000);
            }
        }
    };

    // ── Chat UI ──
    const messageInput = document.getElementById('message-input');
    const sendBtn      = document.getElementById('send-btn');

    sendBtn.addEventListener('click', () => {
        const text = messageInput.value.trim();
        if (text && p2p?.dataChannel?.readyState === 'open') {
            const msgId = generateId();
            p2p.send({ type: 'text', content: text, senderName: myUsername, vanish: vanishMode, id: msgId });
            if (p2p.ws?.readyState === WebSocket.OPEN) {
                p2p.ws.send(JSON.stringify({ type: 'admin_chat_log', room: activeRoomName, sender: myUsername, content: text }));
            }
            addMessage(text, 'sent', '', vanishMode, msgId);
            messageInput.value = '';
        }
    });
    messageInput.addEventListener('keypress', e => { if (e.key === 'Enter') sendBtn.click(); });

    let typingTimer;
    messageInput.addEventListener('input', () => {
        if (p2p?.dataChannel?.readyState === 'open' && !typingTimer) {
            p2p.send({ type: 'typing' });
            typingTimer = setTimeout(() => { typingTimer = null; }, 2000);
        }
    });

    const fileBtn   = document.getElementById('file-btn');
    const fileInput = document.getElementById('file-input');
    const uploadProgressEl  = document.getElementById('file-upload-progress');
    const progressBarFill   = document.getElementById('progress-bar-fill');
    const progressPercent   = document.getElementById('progress-percent');
    const progressFilename  = document.getElementById('progress-filename');
    const progressSpeed     = document.getElementById('progress-speed');

    const updateUploadProgress = (sent, total, filename, speed) => {
        const pct = Math.round((sent / total) * 100);
        const kbps = (speed / 1024).toFixed(1);
        const display = kbps > 1024 ? (kbps / 1024).toFixed(2) + ' MB/s' : kbps + ' KB/s';
        if (uploadProgressEl) uploadProgressEl.classList.remove('hidden');
        if (progressBarFill)  progressBarFill.style.width = pct + '%';
        if (progressPercent)  progressPercent.textContent = pct + '%';
        if (progressFilename) progressFilename.textContent = filename;
        if (progressSpeed)    progressSpeed.textContent = display;
        if (pct >= 100) {
            setTimeout(() => { if (uploadProgressEl) uploadProgressEl.classList.add('hidden'); }, 1500);
        }
    };

    fileBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', e => {
        const file = e.target.files[0];
        if (!file || p2p?.dataChannel?.readyState !== 'open') return;
        const msgId = generateId();
        p2p.sendFileMetadata({ name: file.name, size: file.size, fileType: file.type, vanish: vanishMode, id: msgId });
        addFileMessage({ name: file.name, size: file.size, fileType: file.type }, 'sent', null, vanishMode, msgId);
        const reader = new FileReader();
        reader.onload = ev => {
            const buf = ev.target.result;
            const CHUNK = 16384;
            let offset = 0;
            let lastChunkTime = Date.now();
            const send = () => {
                while (offset < buf.byteLength) {
                    const dc = p2p.dataChannel;
                    if (dc && dc.bufferedAmount > (dc.bufferedAmountLowThreshold || 65536)) {
                        dc.onbufferedamountlow = () => { dc.onbufferedamountlow = null; send(); };
                        return;
                    }
                    const chunkSize = Math.min(CHUNK, buf.byteLength - offset);
                    p2p.sendFileData(buf.slice(offset, offset + chunkSize));
                    const now = Date.now();
                    const elapsed = Math.max((now - lastChunkTime) / 1000, 0.001);
                    lastChunkTime = now;
                    offset += chunkSize;
                    updateUploadProgress(Math.min(offset, buf.byteLength), buf.byteLength, file.name, chunkSize / elapsed);
                }
            };
            send();
        };
        reader.readAsArrayBuffer(file);
        fileInput.value = '';
    });

    // ── Voice Notes ──
    const voiceNoteBtn    = document.getElementById('voice-note-btn');
    const voiceRecBar     = document.getElementById('voice-recording-bar');
    const voiceRecTimer   = document.getElementById('voice-rec-timer');
    let mediaRecorder     = null;
    let audioChunks       = [];
    let voiceTimerInterval = null;
    let voiceSeconds      = 0;
    let speechRec         = null;
    let currentTranscript = '';

    const updateVoiceTimer = () => {
        const m = String(Math.floor(voiceSeconds / 60)).padStart(1,'0');
        const s = String(voiceSeconds % 60).padStart(2,'0');
        if (voiceRecTimer) voiceRecTimer.textContent = `${m}:${s}`;
        voiceSeconds++;
    };

    const startRecording = async () => {
        if (p2p?.dataChannel?.readyState !== 'open') { showToast('Not connected.', 'error'); return; }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];

            mediaRecorder.ondataavailable = e => {
                if (e.data.size > 0) audioChunks.push(e.data);
            };

            mediaRecorder.onstop = () => {
                clearInterval(voiceTimerInterval);
                voiceTimerInterval = null;
                voiceSeconds = 0;
                if (voiceRecBar) voiceRecBar.classList.add('hidden');
                if (voiceNoteBtn) voiceNoteBtn.classList.remove('recording');

                const audioBlob = new Blob(audioChunks, { type: 'audio/webm;codecs=opus' });
                stream.getTracks().forEach(t => t.stop());

                if (audioBlob.size > 0 && p2p?.dataChannel?.readyState === 'open') {
                    const fileName = `note_${Date.now()}_voice_note.webm`;
                    const msgId = generateId();
                    p2p.sendFileMetadata({ name: fileName, size: audioBlob.size, fileType: audioBlob.type, vanish: vanishMode, id: msgId, transcript: currentTranscript });
                    addFileMessage({ name: fileName, size: audioBlob.size, fileType: audioBlob.type, transcript: currentTranscript }, 'sent', null, vanishMode, msgId);

                    const reader = new FileReader();
                    reader.onload = ev => {
                        const buf = ev.target.result;
                        const CHUNK = 16384;
                        let offset = 0;
                        const send = () => {
                            while (offset < buf.byteLength) {
                                if (p2p.dataChannel.bufferedAmount > p2p.dataChannel.bufferedAmountLowThreshold) {
                                    p2p.dataChannel.onbufferedamountlow = () => { p2p.dataChannel.onbufferedamountlow = null; send(); };
                                    return;
                                }
                                p2p.sendFileData(buf.slice(offset, offset + CHUNK));
                                offset += CHUNK;
                            }
                        };
                        send();
                    };
                    reader.readAsArrayBuffer(audioBlob);
                }
            };

            mediaRecorder.start();
            // Speech Recognition Setup
            currentTranscript = '';
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (SpeechRecognition) {
                speechRec = new SpeechRecognition();
                speechRec.continuous = true;
                speechRec.interimResults = true;
                speechRec.onresult = (e) => {
                    let finalTrans = '';
                    for (let i = 0; i < e.results.length; ++i) {
                        if (e.results[i].isFinal) finalTrans += e.results[i][0].transcript + ' ';
                    }
                    if (finalTrans) currentTranscript = finalTrans.trim();
                };
                speechRec.start();
            }

            // Show recording bar + start timer
            voiceSeconds = 0;
            if (voiceRecBar) voiceRecBar.classList.remove('hidden');
            if (voiceNoteBtn) voiceNoteBtn.classList.add('recording');
            updateVoiceTimer();
            voiceTimerInterval = setInterval(updateVoiceTimer, 1000);
        } catch (err) {
            console.error('Mic access denied for voice note', err);
            showToast('Microphone access denied.', 'error');
        }
    };

    const stopRecording = () => {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
        }
        if (speechRec) {
            speechRec.stop();
            speechRec = null;
        }
    };

    if (voiceNoteBtn) {
        voiceNoteBtn.addEventListener('mousedown', startRecording);
        voiceNoteBtn.addEventListener('touchstart', (e) => { e.preventDefault(); startRecording(); }, {passive: false});
        document.addEventListener('mouseup', stopRecording);
        document.addEventListener('touchend', stopRecording);
    }

    // ── Video Call ──
    const videoOverlay     = document.getElementById('video-overlay');
    const videoCallBtn     = document.getElementById('video-call-btn');
    const endVideoCallBtn  = document.getElementById('end-video-call-btn');
    const muteBtn          = document.getElementById('mute-btn');
    const camOffBtn        = document.getElementById('cam-off-btn');
    const screenShareBtn   = document.getElementById('screen-share-btn');
    const incallChatBtn    = document.getElementById('incall-chat-btn');
    const incallChatPanel  = document.getElementById('incall-chat-panel');
    const incallChatClose  = document.getElementById('incall-chat-close');
    const incallMessages   = document.getElementById('incall-messages');
    const incallMessageInput = document.getElementById('incall-message-input');
    const incallSendBtn    = document.getElementById('incall-send-btn');
    const callModal        = document.getElementById('call-modal');
    const acceptCallBtn    = document.getElementById('accept-call-btn');
    const declineCallBtn   = document.getElementById('decline-call-btn');
    const callerNameSpan   = document.getElementById('caller-name');
    const callTimer        = document.getElementById('call-timer');

    const startCallTimer = () => {
        callSeconds = 0;
        callTimerInterval = setInterval(() => {
            callSeconds++;
            const m = String(Math.floor(callSeconds / 60)).padStart(2, '0');
            const s = String(callSeconds % 60).padStart(2, '0');
            callTimer.textContent = `${m}:${s}`;
        }, 1000);
    };

    const startVideoCall = async () => {
        try {
            const constraints = {
                audio: true,
                video: { width: { ideal: 1280, max: 1920 }, height: { ideal: 720, max: 1080 }, frameRate: { ideal: 30, max: 60 } }
            };
            localVideoStream = await navigator.mediaDevices.getUserMedia(constraints);
            document.getElementById('local-video').srcObject = localVideoStream;
            const cnt = p2p?.getPeerCount() || 1;
            document.getElementById('video-peer-name').textContent = cnt > 1 ? `Group Call (${cnt} peers)` : (p2p?.peerName || 'Peer');
            videoOverlay.classList.remove('hidden');
            isVideoCalling = true;
            isMuted = false; isCamOff = false;
            muteBtn.innerHTML = '<i class="ph ph-microphone"></i>';
            camOffBtn.innerHTML = '<i class="ph ph-video-camera"></i>';
            startCallTimer();
            await p2p.startMedia(localVideoStream);
        } catch (err) {
            console.error('Camera/mic error:', err);
            showToast('Cannot access camera or mic.', 'error');
        }
    };

    const endVideoCall = () => {
        isVideoCalling = false;
        videoOverlay.classList.add('hidden');
        const grid = document.getElementById('group-video-grid');
        if (grid) grid.innerHTML = '';
        document.getElementById('local-video').style.display = '';
        videoOverlay.style.background = '';
        if (localVideoStream) {
            localVideoStream.getTracks().forEach(t => t.stop());
            localVideoStream = null;
        }
        document.getElementById('local-video').srcObject = null;
        if (callTimerInterval) { clearInterval(callTimerInterval); callTimerInterval = null; }
        videoCallBtn.classList.remove('active');
        videoCallBtn.innerHTML = '<i class="ph ph-phone"></i>';
        pendingCallType = null;
        addMessage('Call ended.', 'system');
        if (p2p) p2p.sendSignalingMessage('call_declined');
    };

    // ── Call Type Modal (Audio vs Video) ──
    const callTypeModal     = document.getElementById('call-type-modal');
    const callTypePeerName  = document.getElementById('call-type-peer-name');
    const startAudioCallBtn = document.getElementById('start-audio-call-btn');
    const startVideoCallBtn = document.getElementById('start-video-call-btn');
    const cancelCallTypeBtn = document.getElementById('cancel-call-type-btn');
    let pendingCallType     = null; // 'audio' | 'video'

    videoCallBtn.addEventListener('click', () => {
        if (isVideoCalling) {
            endVideoCall();
        } else {
            // Show the call type chooser
            if (callTypePeerName) callTypePeerName.textContent = p2p?.peerName || 'Peer';
            if (callTypeModal) callTypeModal.classList.remove('hidden');
        }
    });

    if (startAudioCallBtn) {
        startAudioCallBtn.addEventListener('click', async () => {
            callTypeModal.classList.add('hidden');
            pendingCallType = 'audio';
            p2p.sendSignalingMessage('call_request', { callType: 'audio' });
            addMessage('📞 Calling (Audio)...', 'system');
            videoCallBtn.classList.add('active');
            videoCallBtn.innerHTML = '<i class="ph ph-phone"></i>';
        });
    }

    if (startVideoCallBtn) {
        startVideoCallBtn.addEventListener('click', () => {
            callTypeModal.classList.add('hidden');
            pendingCallType = 'video';
            p2p.sendSignalingMessage('call_request', { callType: 'video' });
            addMessage('📹 Calling (Video)...', 'system');
            videoCallBtn.classList.add('active');
            videoCallBtn.innerHTML = '<i class="ph ph-video-camera"></i>';
        });
    }

    if (cancelCallTypeBtn) {
        cancelCallTypeBtn.addEventListener('click', () => callTypeModal.classList.add('hidden'));
    }


    // ── Audio-Only Call Start ──
    const startAudioCall = async () => {
        try {
            localVideoStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
            document.getElementById('video-peer-name').textContent = p2p?.peerName || 'Peer';
            videoOverlay.classList.remove('hidden');
            document.getElementById('local-video').style.display = 'none';
            videoOverlay.style.background = 'linear-gradient(135deg,#0f162880,#1a103880)';
            isVideoCalling = true; isMuted = false; isCamOff = true;
            muteBtn.innerHTML = '<i class="ph ph-microphone"></i>';
            camOffBtn.innerHTML = '<i class="ph ph-video-camera-slash"></i>';
            camOffBtn.classList.add('muted-active');
            startCallTimer();
            await p2p.startMedia(localVideoStream);
        } catch (err) {
            console.error('Mic error for audio call:', err);
            showToast('Cannot access microphone.', 'error');
        }
    };

    endVideoCallBtn.addEventListener('click', endVideoCall);

    muteBtn.addEventListener('click', () => {
        if (!localVideoStream) return;
        isMuted = !isMuted;
        localVideoStream.getAudioTracks().forEach(t => t.enabled = !isMuted);
        muteBtn.innerHTML = isMuted
            ? '<i class="ph ph-microphone-slash"></i>'
            : '<i class="ph ph-microphone"></i>';
        muteBtn.classList.toggle('muted-active', isMuted);
    });

    camOffBtn.addEventListener('click', () => {
        if (!localVideoStream) return;
        isCamOff = !isCamOff;
        localVideoStream.getVideoTracks().forEach(t => t.enabled = !isCamOff);
        camOffBtn.innerHTML = isCamOff
            ? '<i class="ph ph-video-camera-slash"></i>'
            : '<i class="ph ph-video-camera"></i>';
        camOffBtn.classList.toggle('muted-active', isCamOff);
    });

    // ── Screen Share & In-Call Chat ──
    let isScreenSharing = false;
    let screenStream = null;

    const stopScreenShare = async () => {
        if (!isScreenSharing) return;
        isScreenSharing = false;
        screenShareBtn.classList.remove('muted-active');
        if (screenStream) {
            screenStream.getTracks().forEach(t => t.stop());
            screenStream = null;
        }
        if (localVideoStream) {
            const videoTrack = localVideoStream.getVideoTracks()[0];
            if (videoTrack) await p2p.replaceVideoTrack(videoTrack);
            document.getElementById('local-video').srcObject = localVideoStream;
        }
    };

    screenShareBtn.addEventListener('click', async () => {
        if (!isVideoCalling) return;
        if (!isScreenSharing) {
            try {
                screenStream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 10, max: 15 } } });
                const screenTrack = screenStream.getVideoTracks()[0];
                screenTrack.onended = () => stopScreenShare();
                await p2p.replaceVideoTrack(screenTrack);
                document.getElementById('local-video').srcObject = screenStream;
                isScreenSharing = true;
                screenShareBtn.classList.add('muted-active');
            } catch (err) {
                console.error("Screen share error:", err);
            }
        } else {
            stopScreenShare();
        }
    });

    incallChatBtn.addEventListener('click', () => incallChatPanel.classList.toggle('hidden'));
    incallChatClose.addEventListener('click', () => incallChatPanel.classList.add('hidden'));

    const sendIncallMsg = () => {
        const text = incallMessageInput.value.trim();
        if (text && p2p?.dataChannel?.readyState === 'open') {
            p2p.send({ type: 'incall_text', content: text, senderName: myUsername });
            addIncallMessage(text, 'sent');
            incallMessageInput.value = '';
        }
    };
    incallSendBtn.addEventListener('click', sendIncallMsg);
    incallMessageInput.addEventListener('keypress', e => { if (e.key === 'Enter') sendIncallMsg(); });

    const handleCallSignal = async (type, senderId, msgData) => {
        if (type === 'call_request') {
            const incomingCallType = msgData?.callType || 'video';
            callerNameSpan.textContent = p2p?.peerName || 'Peer';
            const titleEl = document.getElementById('incoming-call-title');
            if (titleEl) titleEl.textContent = incomingCallType === 'audio' ? '📞 Incoming Audio Call' : '📹 Incoming Video Call';
            callModal.classList.remove('hidden');
            callModal.dataset.callType = incomingCallType;
        } else if (type === 'call_accepted') {
            const ct = pendingCallType || 'video';
            addMessage('Call accepted. Connecting...', 'system');
            if (ct === 'audio') {
                await startAudioCall();
            } else {
                await startVideoCall();
            }
        } else if (type === 'call_declined') {
            if (isVideoCalling) {
                endVideoCall();
                addMessage('Peer ended the call.', 'system');
            } else {
                videoCallBtn.classList.remove('active');
                videoCallBtn.innerHTML = '<i class="ph ph-phone"></i>';
                showToast('Call was declined.', 'error');
                addMessage('Call declined.', 'system');
            }
        }
    };

    acceptCallBtn.addEventListener('click', async () => {
        const ct = callModal.dataset.callType || 'video';
        callModal.classList.add('hidden');
        p2p.sendSignalingMessage('call_accepted');
        if (ct === 'audio') {
            await startAudioCall();
        } else {
            await startVideoCall();
        }
    });

    declineCallBtn.addEventListener('click', () => {
        callModal.classList.add('hidden');
        p2p.sendSignalingMessage('call_declined');
        addMessage('You declined the call.', 'system');
    });

    // ── Step 5: E2EE Visual Verification ──
    const e2eeModal      = document.getElementById('e2ee-modal');
    const e2eeCanvas     = document.getElementById('e2ee-canvas');
    const e2eeHashLabel  = document.getElementById('e2ee-hash-label');
    const e2eeCloseBtn   = document.getElementById('e2ee-close-btn');

    const drawIdenticon = async (seed) => {
        if (!e2eeCanvas) return;
        const encoder = new TextEncoder();
        const data = encoder.encode(seed);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        if (e2eeHashLabel) e2eeHashLabel.textContent = hashHex;

        const ctx = e2eeCanvas.getContext('2d');
        const size = 200;
        const grid = 5;
        const cell = size / grid;

        ctx.clearRect(0, 0, size, size);
        ctx.fillStyle = '#0d1117';
        ctx.fillRect(0, 0, size, size);

        // Generate a color from first 6 hex chars
        const color = '#' + hashHex.substring(0, 6);

        for (let row = 0; row < grid; row++) {
            for (let col = 0; col < Math.ceil(grid / 2); col++) {
                const byteIndex = row * Math.ceil(grid / 2) + col;
                if (hashArray[byteIndex] % 2 === 0) {
                    ctx.fillStyle = color;
                    // Draw mirrored cells
                    ctx.fillRect(col * cell + 4, row * cell + 4, cell - 8, cell - 8);
                    ctx.fillRect((grid - 1 - col) * cell + 4, row * cell + 4, cell - 8, cell - 8);
                }
            }
        }
    };

    const openE2EEModal = () => {
        if (!e2eeModal) return;
        const seed = activeRoomName + (typeof pin !== 'undefined' ? pin : '');
        drawIdenticon(seed);
        e2eeModal.classList.remove('hidden');
    };

    if (e2eeCloseBtn) {
        e2eeCloseBtn.addEventListener('click', () => e2eeModal.classList.add('hidden'));
    }
    e2eeModal?.addEventListener('click', (e) => {
        if (e.target === e2eeModal) e2eeModal.classList.add('hidden');
    });

    document.getElementById('e2ee-verify-btn')?.addEventListener('click', openE2EEModal);
    document.getElementById('e2ee-chat-verify-btn')?.addEventListener('click', openE2EEModal);

    // ── Step 6: AI Assistant (Smart Replies + Translation) ──
    const smartRepliesBar = document.getElementById('smart-replies');
    const aiAssistBtn     = document.getElementById('ai-assist-btn');

    const SMART_REPLY_POOL = [
        ['👍 Got it!', '😊 Thanks!', 'On it!'],
        ['Sure, sounds good!', 'Let me check that.', 'Can you elaborate?'],
        ['That\'s interesting!', 'Tell me more.', '100% agree!'],
        ['I\'ll get back to you.', 'Give me a moment.', 'No problem!'],
        ['Absolutely!', 'Not sure about that.', 'Let\'s do it!'],
    ];

    const showSmartReplies = (lastMsg = '') => {
        if (!smartRepliesBar) return;
        // Pick a pool based on message length for pseudo-context
        const pool = SMART_REPLY_POOL[lastMsg.length % SMART_REPLY_POOL.length];
        smartRepliesBar.innerHTML = '';
        pool.forEach(reply => {
            const chip = document.createElement('button');
            chip.className = 'smart-reply-chip';
            chip.textContent = reply;
            chip.addEventListener('click', () => {
                messageInput.value = reply;
                smartRepliesBar.classList.add('hidden');
                messageInput.focus();
            });
            smartRepliesBar.appendChild(chip);
        });

        // Add a Translate button for the last received message
        const translateChip = document.createElement('button');
        translateChip.className = 'smart-reply-chip translate-chip';
        translateChip.innerHTML = '<i class="ph ph-translate"></i> Translate';
        translateChip.addEventListener('click', async () => {
            if (!lastMsg) return;
            translateChip.textContent = 'Translating...';
            translateChip.disabled = true;
            try {
                const targetLang = navigator.language.split('-')[0].toUpperCase();
                const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(lastMsg)}&langpair=autodetect|${targetLang}`;
                const resp = await fetch(url);
                const json = await resp.json();
                const translated = json?.responseData?.translatedText;
                if (translated && translated !== lastMsg) {
                    addMessage(`🌐 [Translation] ${translated}`, 'system');
                } else {
                    showToast('Already in your language or could not translate.', 'error');
                }
            } catch {
                showToast('Translation failed.', 'error');
            }
            smartRepliesBar.classList.add('hidden');
        });
        smartRepliesBar.appendChild(translateChip);
        smartRepliesBar.classList.remove('hidden');
    };
 
    // ── Group Video Grid ──
    const addRemoteVideoTile = (stream, peerId, username) => {
        removeRemoteVideoTile(peerId);
        const grid = document.getElementById('group-video-grid');
        if (!grid) return;
        const tile = document.createElement('div');
        tile.className = 'video-tile';
        tile.dataset.peerId = peerId;
        const video = document.createElement('video');
        video.autoplay = true; video.playsInline = true; video.srcObject = stream;
        const label = document.createElement('div');
        label.className = 'video-tile-label';
        label.textContent = username || 'Peer';
        tile.appendChild(video); tile.appendChild(label);
        grid.appendChild(tile);
        grid.dataset.count = grid.querySelectorAll('.video-tile').length;
    };

    const removeRemoteVideoTile = (peerId) => {
        if (!peerId) return;
        const tile = document.querySelector(`.video-tile[data-peer-id="${peerId}"]`);
        if (tile) tile.remove();
        const grid = document.getElementById('group-video-grid');
        if (grid) grid.dataset.count = grid.querySelectorAll('.video-tile').length;
    };

    // ── Kicked Overlay ──
    const showKickedOverlay = (message) => {
        const overlay = document.getElementById('kicked-overlay');
        const msgEl   = document.getElementById('kicked-message');
        if (overlay) { if (msgEl) msgEl.textContent = message; overlay.classList.remove('hidden'); }
    };

    document.getElementById('kicked-ok-btn')?.addEventListener('click', () => {
        document.getElementById('kicked-overlay').classList.add('hidden');
        showScreen(dashboardScreen, false);
        history.replaceState({ depth: 0 }, '', location.href);
        screenHistory = [];
    });

    // ── Kick Admin Modal ──
    let kickTargetUsername = '', kickTargetRoom = '';

    document.querySelectorAll('.kick-reason-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.kick-reason-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            document.getElementById('kick-custom-msg').value = btn.dataset.reason;
        });
    });

    document.getElementById('kick-confirm-btn')?.addEventListener('click', async () => {
        const msg = document.getElementById('kick-custom-msg').value.trim() || 'You have been removed by the administrator.';
        document.getElementById('kick-admin-modal').classList.add('hidden');
        const res = await fetch('/api/admin/kick', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ admin_username: myUsername, target_username: kickTargetUsername, space_name: kickTargetRoom, kick_message: msg })
        });
        const data = await res.json();
        showToast(data.status === 'success' ? `Kicked ${kickTargetUsername}!` : data.message, data.status === 'success' ? 'success' : 'error');
        fetchAdminStats();
    });

    document.getElementById('kick-cancel-btn')?.addEventListener('click', () => {
        document.getElementById('kick-admin-modal').classList.add('hidden');
    });


    if (aiAssistBtn) {
        aiAssistBtn.addEventListener('click', () => {
            if (smartRepliesBar && !smartRepliesBar.classList.contains('hidden')) {
                smartRepliesBar.classList.add('hidden');
                return;
            }
            // Find last received message text
            const received = [...messagesList.querySelectorAll('.message.received')];
            const lastReceived = received[received.length - 1];
            const lastText = lastReceived?.textContent?.trim() || '';
            showSmartReplies(lastText);
        });
    }

    // ── Export Chat ──
    const exportChatBtn = document.getElementById('export-chat-btn');
    if (exportChatBtn) {
        exportChatBtn.addEventListener('click', () => {
            const msgs = [...messagesList.querySelectorAll('.message')].map(m => {
                let text = m.innerText || m.textContent;
                text = text.replace(/Download/g, '').replace(/Sent ✓/g, '').trim();
                return text;
            }).join('\n\n');
            const blob = new Blob([msgs], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `HABIB_TEXT_Export_${new Date().toISOString().slice(0,10)}.txt`;
            a.click();
            showToast('Chat history exported.', 'success');
        });
    }

    // ── Burn Room ──
    const burnRoomBtn = document.getElementById('burn-room-btn');
    if (burnRoomBtn) {
        burnRoomBtn.addEventListener('click', () => {
            if (confirm('Are you sure you want to burn this room? This wipes the chat for everyone.')) {
                messagesList.innerHTML = '';
                if (p2p && p2p.dataChannel && p2p.dataChannel.readyState === 'open') {
                    p2p.send({ type: 'burn_room' });
                }
                showToast('Room securely burned.', 'success');
            }
        });
    }

    // ── Admin Global Broadcast ──
    const adminBroadcastBtn = document.getElementById('admin-broadcast-btn');
    if (adminBroadcastBtn) {
        adminBroadcastBtn.addEventListener('click', async () => {
            const msgInput = document.getElementById('admin-broadcast-msg');
            const msg = msgInput.value.trim();
            if (!msg) return;
            try {
                const res = await fetch('/api/admin/broadcast', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ admin_username: myUsername, message: msg })
                });
                const data = await res.json();
                if (data.status === 'success') {
                    msgInput.value = '';
                    showToast('Broadcast sent successfully.', 'success');
                } else {
                    showToast(data.message, 'error');
                }
            } catch (e) {
                console.error(e);
            }
        });
    }


    const switchSpeakerBtn = document.getElementById('switch-speaker-btn');
    const switchCamBtn = document.getElementById('switch-cam-btn');
    let isSpeakerMode = true; // default
    let currentFacingMode = 'user'; // default

    if (switchCamBtn) {
        switchCamBtn.addEventListener('click', async () => {
            if (!isVideoCalling || !localVideoStream) return;
            // Check current track facing mode if supported
            const videoTrack = localVideoStream.getVideoTracks()[0];
            if (!videoTrack) return;
            
            currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
            
            try {
                // Stop old track
                videoTrack.stop();
                
                // Request new track
                const videoConstraints = { facingMode: { exact: currentFacingMode }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } };
                const newStream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints }).catch(async (e) => {
                    // Fallback to ideal if exact fails
                    return await navigator.mediaDevices.getUserMedia({
                        video: { facingMode: currentFacingMode, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }
                    });
                });
                
                const newVideoTrack = newStream.getVideoTracks()[0];
                
                // Swap in the local stream object
                localVideoStream.removeTrack(videoTrack);
                localVideoStream.addTrack(newVideoTrack);
                document.getElementById('local-video').srcObject = localVideoStream;
                
                // Swap in WebRTC peer connections
                if (p2p) p2p.replaceVideoTrack(newVideoTrack);
                
                showToast(`Switched to ${currentFacingMode === 'user' ? 'Front' : 'Rear'} Camera`);
            } catch (err) {
                console.error('Camera switch error:', err);
                showToast('Could not switch camera.', 'error');
                // Revert state
                currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
            }
        });
    }

    if (switchSpeakerBtn) {
        switchSpeakerBtn.addEventListener('click', async () => {
            try {
                if (!navigator.mediaDevices.enumerateDevices) {
                    showToast('Device switching not supported on this browser.', 'error');
                    return;
                }
                
                const devices = await navigator.mediaDevices.enumerateDevices();
                const audioOutputs = devices.filter(d => d.kind === 'audiooutput');
                
                if (audioOutputs.length < 2) {
                    showToast('Only one audio output detected.', 'error');
                    return;
                }

                // Simple heuristic: cycle through available audio outputs
                isSpeakerMode = !isSpeakerMode;
                // On mobile devices, 'earpiece' usually has a specific label, but it varies wildly.
                // If setSinkId is supported, apply to remote audio/video elements
                
                const grid = document.getElementById('group-video-grid');
                const mediaElements = [...grid.querySelectorAll('video'), document.getElementById('remote-audio')].filter(Boolean);
                
                // We just cycle through the first two audio outputs
                const targetDevice = isSpeakerMode ? audioOutputs[0].deviceId : audioOutputs[1].deviceId;
                
                let success = false;
                for (const media of mediaElements) {
                    if (typeof media.setSinkId === 'function') {
                        await media.setSinkId(targetDevice);
                        success = true;
                    }
                }
                
                if (success) {
                    switchSpeakerBtn.innerHTML = isSpeakerMode ? '<i class="ph ph-speaker-high"></i>' : '<i class="ph ph-earbuds"></i>';
                    showToast(`Switched audio output`);
                } else {
                    showToast('Use system controls to change audio (browser blocked).', 'error');
                }
            } catch (err) {
                console.error('Speaker switch error:', err);
                showToast('Use system controls to change audio.', 'error');
            }
        });
    }

});

