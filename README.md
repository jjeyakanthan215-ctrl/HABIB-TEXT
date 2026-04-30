# ESCTRIX — Secure P2P Messenger

ESCTRIX is a high-end, private, and secure peer-to-peer communication platform. Built with modern web technologies and a focus on privacy, it allows users to connect directly with each other for messaging, file sharing, and video calls without a central server storing their data.

## 🚀 Key Features

- **End-to-End Encryption (E2EE)**: All communications are encrypted directly between peers using WebRTC Data Channels.
- **Mesh Network**: Supports group rooms of up to 4 users in a mesh topology.
- **P2P Video & Audio Calls**: High-quality, low-latency media streams.
- **Secure File Transfer**: Send any file type directly to peers with real-time progress monitoring.
- **Vanish Mode**: Messages and media that disappear after being viewed (10-second timer).
- **Burn Room**: Instantly wipe the entire chat history for everyone in the room.
- **PWA Ready**: Installable on Android and iOS for a native app experience.
- **Local Discovery**: Uses mDNS to find other hosts on your local network automatically.
- **Admin Dashboard**: Robust moderation tools for system administrators.

## 🛠️ Technology Stack

- **Backend**: FastAPI (Python 3.10+), SQLite, WebSockets.
- **Frontend**: Vanilla JavaScript (ES6+), WebRTC, CSS3 (Glassmorphism).
- **Security**: Bcrypt password hashing, WebRTC (DTLS/SRTP).
- **Deployment**: Optimized for Render.com.

## 💻 Local Setup

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd "P2P SMS"
   ```

2. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

3. **Run the application**:
   ```bash
   python main.py
   ```
   This will start the FastAPI server, open your default browser, and initialize a global tunnel for external access.

## 🌐 Deployment (Render)

1. Create a new **Web Service** on Render.
2. Connect your GitHub repository.
3. Use the following settings:
   - **Environment**: Python
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn server:app --host 0.0.0.0 --port $PORT`
4. Add Environment Variables:
   - `ADMIN_USERS`: Comma-separated list of admin usernames (e.g., `Admin1,Admin2`).
   - `DB_PATH`: Path to the persistent database (e.g., `/data/users.db` if using a disk).

## 🔒 Security Note

ESCTRIX uses WebRTC for peer-to-peer communication. While the signaling server (this backend) facilitates the initial connection, it **never** sees or stores your private messages or media streams. Everything is encrypted using industry-standard DTLS and SRTP.

---
*Created with ❤️ by the ESCTRIX Team admin jeyakanthan*
