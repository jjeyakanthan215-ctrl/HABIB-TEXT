class P2PConnection {
    constructor(onMessage, onConnectionStateChange, onTrack, onCallSignal) {
        this.peerConnection = null;
        this.dataChannel = null;
        this.ws = null;
        this.clientId = this.generateId();
        this.onMessage = onMessage;
        this.onConnectionStateChange = onConnectionStateChange;
        this.onTrack = onTrack;
        this.onCallSignal = onCallSignal; // function(type, senderName)
        
        // ICE servers: STUN for discovery, TURN as relay fallback (required behind NAT/firewalls)
        this.configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                {
                    urls: 'turn:openrelay.metered.ca:80',
                    username: 'openrelayproject',
                    credential: 'openrelayproject'
                },
                {
                    urls: 'turn:openrelay.metered.ca:443',
                    username: 'openrelayproject',
                    credential: 'openrelayproject'
                },
                {
                    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
                    username: 'openrelayproject',
                    credential: 'openrelayproject'
                }
            ]
        };
    }

    generateId() {
        return Math.random().toString(36).substring(2, 15);
    }

    connectSignaling(serverIp, pin, myUsername, hostUsername) {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        const wsUrl = `${protocol}//${host}/ws/${this.clientId}`;
        
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
            console.log("Signaling connected");
            // Both host and joiner send auth — host authenticates into their own room
            this.sendSignalingMessage('auth', { pin: pin, username: myUsername, host_username: hostUsername });
        };

        this.ws.onmessage = async (event) => {
            const message = JSON.parse(event.data);
            
            switch (message.type) {
                case 'auth_success':
                    console.log("Authenticated!");
                    if (message.host_username) {
                        this.peerName = message.host_username;
                    }
                    this.initializePeerConnection();
                    // Only the JOINER (not the host) sends the WebRTC offer
                    // The host is myUsername === hostUsername, so they wait
                    if (myUsername !== hostUsername) {
                        this.createOffer();
                    }
                    break;
                    
                case 'auth_fail':
                    console.error("Authentication failed:", message.reason || "Invalid PIN");
                    this.authReason = message.reason;
                    this.onConnectionStateChange('failed_auth');
                    break;

                case 'kicked':
                    console.warn("You have been kicked by the admin.");
                    this.onConnectionStateChange('kicked');
                    break;

                case 'offer': {
                    console.log("Received offer");
                    if (!this.peerConnection) this.initializePeerConnection();
                    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(message.data));
                    const answer = await this.peerConnection.createAnswer();
                    await this.peerConnection.setLocalDescription(answer);
                    this.sendSignalingMessage('answer', answer, message.sender);
                    break;
                }

                case 'answer':
                    console.log("Received answer");
                    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(message.data));
                    break;

                case 'candidate':
                    console.log("Received ICE candidate");
                    if (this.peerConnection) {
                        await this.peerConnection.addIceCandidate(new RTCIceCandidate(message.data));
                    }
                    break;

                case 'peer_joined':
                    console.log("Peer joined:", message.username);
                    this.peerName = message.username;
                    break;

                case 'peer_disconnected':
                    console.log("Peer disconnected");
                    this.onConnectionStateChange('disconnected');
                    break;
                    
                // Call Signaling
                case 'call_request':
                case 'call_accepted':
                case 'call_declined':
                    if (this.onCallSignal) {
                        this.onCallSignal(message.type, message.sender); // Or we can use username if we sent it
                    }
                    break;
            }
        };

        this.ws.onerror = (error) => {
            console.error("WebSocket error:", error);
            this.onConnectionStateChange('disconnected');
        };
    }

    initializePeerConnection() {
        this.peerConnection = new RTCPeerConnection(this.configuration);

        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.sendSignalingMessage('candidate', event.candidate);
            }
        };

        this.peerConnection.ontrack = (event) => {
            if (this.onTrack && event.streams && event.streams[0]) {
                this.onTrack(event.streams[0]);
            }
        };

        this.peerConnection.onconnectionstatechange = () => {
            const state = this.peerConnection.connectionState;
            console.log("Connection state:", state);
            // Only propagate terminal states to avoid spurious 'disconnected' flashes
            if (state === 'connected' || state === 'failed' || state === 'closed') {
                this.onConnectionStateChange(state === 'connected' ? 'connected' : 'disconnected');
            }
        };

        // Create Data Channel
        this.dataChannel = this.peerConnection.createDataChannel('p2p_channel');
        this.setupDataChannel();

        this.peerConnection.ondatachannel = (event) => {
            this.dataChannel = event.channel;
            this.setupDataChannel();
        };
    }

    setupDataChannel() {
        this.dataChannel.binaryType = 'arraybuffer';
        
        this.dataChannel.onopen = () => {
            console.log("Data channel open!");
            this.onConnectionStateChange('connected');
        };
        
        this.dataChannel.onmessage = (event) => {
            if (typeof event.data === 'string') {
                const message = JSON.parse(event.data);
                this.onMessage(message);
            } else {
                this.onMessage({ type: 'file_data', data: event.data });
            }
        };
        
        this.dataChannel.onclose = () => {
            console.log("Data channel closed");
            this.onConnectionStateChange('disconnected');
        };
    }

    async createOffer() {
        const offer = await this.peerConnection.createOffer();
        await this.peerConnection.setLocalDescription(offer);
        this.sendSignalingMessage('offer', offer);
    }

    sendSignalingMessage(type, data, target = null) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type, target, data }));
        }
    }

    send(message) {
        if (this.dataChannel && this.dataChannel.readyState === 'open') {
            this.dataChannel.send(JSON.stringify(message));
        } else {
            console.error("Data channel is not open");
        }
    }

    sendFileMetadata(fileMeta) {
        // Pass ALL fields through (name, size, fileType, vanish, id, etc.)
        this.send({
            type: 'file_meta',
            ...fileMeta
        });
    }

    sendFileData(arrayBuffer) {
        if (this.dataChannel && this.dataChannel.readyState === 'open') {
            this.dataChannel.send(arrayBuffer);
        }
    }

    async startAudio(stream) {
        if (!this.peerConnection) return;
        stream.getTracks().forEach(track => {
            this.peerConnection.addTrack(track, stream);
        });
        await this.createOffer();
    }

    async stopAudio(stream) {
        if (!this.peerConnection) return;
        stream.getTracks().forEach(track => {
            const sender = this.peerConnection.getSenders().find(s => s.track === track);
            if (sender) this.peerConnection.removeTrack(sender);
            track.stop();
        });
        await this.createOffer();
    }

    // ── Video Call ──
    async startVideo(stream) {
        if (!this.peerConnection) return;
        // Remove any existing tracks first
        this.peerConnection.getSenders().forEach(sender => {
            this.peerConnection.removeTrack(sender);
        });
        stream.getTracks().forEach(track => {
            this.peerConnection.addTrack(track, stream);
        });
        await this.createOffer();
    }

    stopVideo() {
        if (!this.peerConnection) return;
        this.peerConnection.getSenders().forEach(sender => {
            if (sender.track) sender.track.stop();
            this.peerConnection.removeTrack(sender);
        });
    }

    async replaceVideoTrack(newTrack) {
        if (!this.peerConnection) return;
        
        const senders = this.peerConnection.getSenders();
        const videoSender = senders.find(sender => sender.track && sender.track.kind === 'video');
        
        if (videoSender) {
            await videoSender.replaceTrack(newTrack);
        } else {
            this.peerConnection.addTrack(newTrack);
            await this.createOffer();
        }
    }
}
