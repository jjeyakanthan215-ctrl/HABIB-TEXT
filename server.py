import json
import logging
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
import os

from contextlib import asynccontextmanager
from discovery import MDNSService
from security import generate_qr_base64
from database import init_db, create_user, verify_user, get_total_users, get_all_users, delete_user, store_offline_message, get_offline_messages, delete_offline_messages
from connection_manager import manager

logger = logging.getLogger(__name__)

# --- Configuration ---
ADMIN_USERS = os.environ.get("ADMIN_USERS", "ESCTRIX_Admin,Gayathri").split(",")
DEFAULT_PORT = int(os.environ.get("PORT", 8006))

mdns_service = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Initializing database...")
    init_db()
    logger.info("Server started. Waiting for host setup...")
    yield
    # Shutdown
    if mdns_service:
        logger.info("Stopping mDNS service...")
        mdns_service.stop()

app = FastAPI(lifespan=lifespan)


class AuthData(BaseModel):
    username: str
    password: str


class HostStart(BaseModel):
    username: str
    space_name: str
    pin: str


class HostStop(BaseModel):
    space_name: str


class AdminAction(BaseModel):
    admin_username: str
    target_username: str
    space_name: str = ''
    kick_message: str = ''   # custom kick reason


class AdminBroadcast(BaseModel):
    admin_username: str
    message: str


class OfflineMessage(BaseModel):
    recipient_username: str
    sender_username: str
    space_name: str
    payload: str


# Setup static files and templates
os.makedirs("frontend", exist_ok=True)
app.mount("/static", StaticFiles(directory="frontend"), name="static")
templates = Jinja2Templates(directory="frontend")


@app.get("/health")
async def health_check():
    """Render uses this to verify the service is running."""
    return {"status": "ok"}


@app.get("/", response_class=HTMLResponse)
@app.get("/index.html", response_class=HTMLResponse)
async def get_index(request: Request):
    return templates.TemplateResponse(
        request=request, name="index.html", context={
            "server_ip": mdns_service.ip if mdns_service else "127.0.0.1"
        }
    )


@app.get("/manifest.json")
async def get_manifest():
    return FileResponse("frontend/manifest.json", media_type="application/manifest+json")


@app.get("/sw.js")
async def get_sw():
    return FileResponse("frontend/sw.js", media_type="application/javascript")


@app.get("/offline.html", response_class=HTMLResponse)
async def get_offline(request: Request):
    return templates.TemplateResponse(request=request, name="offline.html", context={})



@app.post("/api/auth/register")
async def register_user(data: AuthData):
    if create_user(data.username, data.password):
        return {"status": "success"}
    return {"status": "error", "message": "That username is already taken. Please choose a different one."}


@app.post("/api/auth/login")
async def login_user(data: AuthData):
    role = verify_user(data.username, data.password)
    if role:
        return {"status": "success", "role": role}
    return {"status": "error", "message": "Incorrect username or password. Please try again."}


@app.post("/api/messages/offline")
async def post_offline_message(data: OfflineMessage):
    if store_offline_message(data.recipient_username, data.sender_username, data.space_name, data.payload):
        return {"status": "success"}
    return {"status": "error", "message": "Failed to store message"}


@app.get("/api/messages/offline")
async def fetch_offline_messages(username: str):
    messages = get_offline_messages(username)
    if messages:
        delete_offline_messages(username)
    return {"status": "success", "messages": messages}


@app.get("/api/admin/stats")
async def get_admin_stats(username: str = None):
    if username not in ADMIN_USERS:
        return {"status": "error", "message": "Unauthorized"}

    total_users = get_total_users()
    active_hosts_count = len(manager.rooms)

    total_connections = 0
    active_hosts_list = []

    for host_uname, room_data in manager.rooms.items():
        users_in_room = manager.get_room_users(host_uname)
        client_count = len(users_in_room)
        total_connections += client_count
        active_hosts_list.append({
            "hostname": host_uname,
            "clients": client_count,
            "users": users_in_room   # ← per-user list for targeted kick
        })

    return {
        "status": "success",
        "total_users": total_users,
        "active_hosts": active_hosts_count,
        "total_connections": total_connections,
        "active_hosts_list": active_hosts_list,
        "user_list": get_all_users()
    }


@app.post("/api/admin/kick")
async def kick_user_from_room(data: AdminAction):
    if data.admin_username not in ADMIN_USERS:
        return {"status": "error", "message": "Unauthorized"}
    success = await manager.kick_user(data.space_name, data.target_username, data.kick_message)
    if success:
        return {"status": "success", "message": f"{data.target_username} has been kicked."}
    return {"status": "error", "message": "User not found in room."}


@app.delete("/api/admin/delete_user")
async def delete_registered_user(data: AdminAction):
    if data.admin_username not in ADMIN_USERS:
        return {"status": "error", "message": "Unauthorized"}
    success = delete_user(data.target_username)
    if success:
        return {"status": "success", "message": f"{data.target_username} deleted."}
    return {"status": "error", "message": "Cannot delete admin or user not found."}


@app.post("/api/admin/broadcast")
async def admin_broadcast(data: AdminBroadcast):
    if data.admin_username not in ADMIN_USERS:
        return {"status": "error", "message": "Unauthorized"}
    
    payload = {
        "type": "admin_broadcast",
        "message": data.message
    }
    # Broadcast to all active rooms
    for space_name in manager.rooms.keys():
        await manager.broadcast_to_room(space_name, payload)
    
    return {"status": "success", "message": "Broadcast sent to all active spaces."}


@app.post("/api/host/start")
async def start_hosting(data: HostStart):
    global mdns_service

    if not manager.create_room(data.space_name, data.username, data.pin):
        return {"status": "error", "message": "Space name already in use. Please choose a different name."}

    render_url = os.environ.get("RENDER_EXTERNAL_URL", "")
    is_cloud   = bool(render_url or os.environ.get("RENDER"))

    try:
        if is_cloud:
            connect_url = render_url or "https://your-app.onrender.com"
        else:
            if mdns_service is None:
                port = DEFAULT_PORT
                mdns_service = MDNSService(port=port)
                mdns_service.start()
            connect_url = f"http://{mdns_service.ip}:{mdns_service.port}"
    except Exception:
        connect_url = render_url or f"http://localhost:{DEFAULT_PORT}"

    qr_base64 = generate_qr_base64(connect_url)

    return {
        "status": "success",
        "qr_code": qr_base64,
        "server_ip": connect_url
    }


@app.post("/api/host/stop")
async def stop_hosting(data: HostStop):
    await manager.broadcast_to_room(data.space_name, {"type": "host_disconnected"})
    manager.remove_room(data.space_name)
    return {"status": "success"}


@app.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    await websocket.accept()

    current_room = None

    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)

            # ── Auth ──
            if message.get("type") == "auth":
                space_name      = message.get("data", {}).get("host_username")
                provided_pin    = message.get("data", {}).get("pin")
                client_username = message.get("data", {}).get("username")

                room = manager.get_room(space_name)
                if not room:
                    await websocket.send_text(json.dumps({"type": "auth_fail", "reason": "no_room"}))
                    continue

                # Determine if this connection is the legitimate host:
                # Either the host slot is unclaimed and the username matches, OR
                # this exact client_id is already the registered host.
                claiming_host = (client_username == room['host_username'])
                host_slot_taken = room['host_client_id'] is not None

                if claiming_host and host_slot_taken and room['host_client_id'] != client_id:
                    # Someone else is pretending to be the host — reject
                    await websocket.send_text(json.dumps({
                        "type": "auth_fail",
                        "reason": "host_taken",
                        "message": "This space name is already hosted by someone else. Please choose a different name."
                    }))
                    continue

                pin_ok = (room['pin'] == provided_pin) or (room['pin'] == '' and provided_pin == '')

                if claiming_host or pin_ok:
                    result = manager.add_client_to_room(
                        space_name, client_id, websocket,
                        client_username, is_host=claiming_host
                    )

                    if result == "full":
                        await websocket.send_text(json.dumps({
                            "type": "auth_fail",
                            "reason": "full",
                            "message": "This room is full (max 4 people). Please try a different space."
                        }))
                        continue

                    current_room = space_name

                    # Send list of already-connected peers to the new joiner
                    existing_peers = [
                        {"client_id": cid, "username": uname}
                        for cid, uname in room['usernames'].items()
                        if cid != client_id
                    ]

                    await websocket.send_text(json.dumps({
                        "type": "auth_success",
                        "host_username": room['host_username'],
                        "space_name": space_name,
                        "your_client_id": client_id,
                        "existing_peers": existing_peers
                    }))

                    # Notify others that a new peer joined
                    await manager.broadcast_to_room(
                        space_name,
                        {"type": "peer_joined", "username": client_username, "client_id": client_id},
                        exclude_client_id=client_id
                    )
                else:
                    await websocket.send_text(json.dumps({"type": "auth_fail", "reason": "wrong_pin"}))

            # ── Admin Auth ──
            elif message.get("type") == "admin_auth":
                username     = message.get("data", {}).get("username", "ESCTRIX_Admin")
                provided_pwd = message.get("data", {}).get("password")

                role = verify_user(username, provided_pwd)
                if role == 'admin':
                    manager.add_admin(client_id, websocket)
                    await websocket.send_text(json.dumps({"type": "admin_auth_success"}))
                else:
                    await websocket.send_text(json.dumps({"type": "auth_fail"}))

            # ── Admin Chat Log Forward ──
            elif message.get("type") == "admin_chat_log":
                await manager.broadcast_to_admins(message)

            # ── WebRTC Signaling (targeted) ──
            elif current_room and message.get("type") in [
                "offer", "answer", "candidate",
                "call_request", "call_accepted", "call_declined",
                "typing"
            ]:
                target = message.get("target")

                if target:
                    # Targeted relay — used in mesh for peer-specific signaling
                    await manager.send_to_client(current_room, target, {
                        **message,
                        "sender": client_id
                    })
                else:
                    # Broadcast to all others in room
                    payload = {
                        "type": message.get("type"),
                        "sender": client_id,
                        "data": message.get("data")
                    }
                    await manager.broadcast_to_room(current_room, payload, exclude_client_id=client_id)

    except WebSocketDisconnect:
        if current_room:
            manager.remove_client_from_room(current_room, client_id)
            await manager.broadcast_to_room(
                current_room,
                {"type": "peer_disconnected", "peer_id": client_id}
            )
        manager.remove_admin(client_id)
