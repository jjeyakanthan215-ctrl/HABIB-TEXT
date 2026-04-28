import json
import logging
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
import os

from discovery import MDNSService
from security import generate_qr_base64
from database import create_user, verify_user, get_total_users, get_all_users

logger = logging.getLogger(__name__)

app = FastAPI()

# Setup static files and templates
os.makedirs("frontend", exist_ok=True)
app.mount("/static", StaticFiles(directory="frontend"), name="static")
templates = Jinja2Templates(directory="frontend")

# State
# rooms maps host_username -> { 'pin': str, 'clients': { client_id: websocket } }
rooms = {}
admin_connections = {}
mdns_service = None

class AuthData(BaseModel):
    username: str
    password: str

class HostStart(BaseModel):
    username: str
    space_name: str
    pin: str

class HostStop(BaseModel):
    space_name: str

@app.on_event("startup")
async def startup_event():
    logger.info("Server started. Waiting for host setup...")

@app.on_event("shutdown")
async def shutdown_event():
    if mdns_service:
        mdns_service.stop()

@app.get("/", response_class=HTMLResponse)
async def get_index(request: Request):
    return templates.TemplateResponse(
        request=request, name="index.html", context={
            "server_ip": mdns_service.ip if mdns_service else "127.0.0.1"
        }
    )

@app.post("/api/auth/register")
async def register_user(data: AuthData):
    if create_user(data.username, data.password):
        return {"status": "success"}
    return {"status": "error", "message": "Username already exists"}

@app.post("/api/auth/login")
async def login_user(data: AuthData):
    role = verify_user(data.username, data.password)
    if role:
        return {"status": "success", "role": role}
    return {"status": "error", "message": "Invalid credentials"}

@app.get("/api/admin/stats")
async def get_admin_stats(username: str = None):
    # Basic security check
    if username != "HABIB_Admin":
        return {"status": "error", "message": "Unauthorized"}
        
    total_users = get_total_users()
    active_hosts_count = len(rooms)
    
    total_connections = 0
    active_hosts_list = []
    
    for host_uname, room_data in rooms.items():
        client_count = len(room_data.get('clients', {}))
        total_connections += client_count
        active_hosts_list.append({
            "hostname": host_uname,
            "clients": client_count
        })
        
    return {
        "status": "success",
        "total_users": total_users,
        "active_hosts": active_hosts_count,
        "total_connections": total_connections,
        "active_hosts_list": active_hosts_list,
        "user_list": get_all_users()
    }

@app.post("/api/host/start")
async def start_hosting(data: HostStart):
    global mdns_service
    
    if data.space_name in rooms:
        return {"status": "error", "message": "Space name already in use"}
        
    # Initialize room
    rooms[data.space_name] = {
        'pin': data.pin,
        'host_username': data.username,
        'clients': {}
    }
    
    # Try mDNS for local network discovery (may fail on cloud, that's OK)
    try:
        if mdns_service is None:
            port = int(os.environ.get("PORT", 8006))
            mdns_service = MDNSService(port=port)
            mdns_service.start()
        connect_url = f"http://{mdns_service.ip}:{mdns_service.port}"
    except Exception:
        # On cloud deployments mDNS is not available — use the request origin instead
        connect_url = os.environ.get("RENDER_EXTERNAL_URL", "http://localhost:8006")
    
    qr_base64 = generate_qr_base64(connect_url)
    
    return {
        "status": "success",
        "qr_code": qr_base64,
        "server_ip": connect_url
    }

@app.post("/api/host/stop")
async def stop_hosting(data: HostStop):
    if data.space_name in rooms:
        # Optionally notify connected clients
        for conn in rooms[data.space_name]['clients'].values():
            try:
                await conn.send_text(json.dumps({
                    "type": "host_disconnected"
                }))
            except:
                pass
        del rooms[data.space_name]
    return {"status": "success"}


@app.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    await websocket.accept()
    
    # We don't know the room yet until 'auth' is received.
    current_room = None
    
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            
            if message.get("type") == "auth":
                host_username = message.get("data", {}).get("host_username")
                provided_pin = message.get("data", {}).get("pin")
                client_username = message.get("data", {}).get("username")
                
                if host_username not in rooms:
                    await websocket.send_text(json.dumps({"type": "auth_fail"}))
                    continue
                
                room = rooms[host_username]
                is_host = (client_username == room['host_username'])
                pin_ok = (room['pin'] == provided_pin) or (room['pin'] == '' and provided_pin == '')
                
                # Host authenticates into their own room; joiners must supply correct PIN
                if is_host or pin_ok:
                    current_room = host_username
                    room['clients'][client_id] = websocket
                    
                    await websocket.send_text(json.dumps({
                        "type": "auth_success",
                        "host_username": room['host_username'],
                        "space_name": host_username
                    }))
                    
                    # Notify other peers in the room that someone joined
                    for cid, conn in list(room['clients'].items()):
                        if cid != client_id:
                            try:
                                await conn.send_text(json.dumps({
                                    "type": "peer_joined",
                                    "username": client_username
                                }))
                            except:
                                pass
                else:
                    await websocket.send_text(json.dumps({"type": "auth_fail"}))
                    
            elif message.get("type") == "admin_auth":
                provided_pwd = message.get("data", {}).get("password")
                if provided_pwd == "Habib@215":
                    admin_connections[client_id] = websocket
                    await websocket.send_text(json.dumps({"type": "admin_auth_success"}))
                else:
                    await websocket.send_text(json.dumps({"type": "auth_fail"}))

            elif message.get("type") == "admin_chat_log":
                # Broadcast the log to all connected admins
                for cid, conn in list(admin_connections.items()):
                    try:
                        await conn.send_text(json.dumps(message))
                    except:
                        pass
                        
            elif current_room and message.get("type") in ["offer", "answer", "candidate", "call_request", "call_accepted", "call_declined"]:
                target = message.get("target")
                room_clients = rooms[current_room]['clients']
                
                if target and target in room_clients:
                    try:
                        await room_clients[target].send_text(data)
                    except:
                        pass
                else:
                    # Broadcast to others in room
                    for cid, conn in list(room_clients.items()):
                        if cid != client_id:
                            try:
                                await conn.send_text(json.dumps({
                                    "type": message.get("type"),
                                    "sender": client_id,
                                    "data": message.get("data")
                                }))
                            except:
                                pass
                            
    except WebSocketDisconnect:
        if current_room and client_id in rooms[current_room]['clients']:
            del rooms[current_room]['clients'][client_id]
            for conn in rooms[current_room]['clients'].values():
                try:
                    await conn.send_text(json.dumps({
                        "type": "peer_disconnected",
                        "peer_id": client_id
                    }))
                except:
                    pass
        if client_id in admin_connections:
            del admin_connections[client_id]
