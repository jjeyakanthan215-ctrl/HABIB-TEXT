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
from database import create_user, verify_user, get_total_users, get_all_users, delete_user
from connection_manager import manager

logger = logging.getLogger(__name__)

app = FastAPI()

# Setup static files and templates
os.makedirs("frontend", exist_ok=True)
app.mount("/static", StaticFiles(directory="frontend"), name="static")
templates = Jinja2Templates(directory="frontend")

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

class AdminAction(BaseModel):
    admin_username: str
    target_username: str
    space_name: str = ''

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
    # Note: A real app should use token-based authentication for APIs.
    if username != "HABIB_Admin":
        return {"status": "error", "message": "Unauthorized"}
        
    total_users = get_total_users()
    active_hosts_count = len(manager.rooms)
    
    total_connections = 0
    active_hosts_list = []
    
    for host_uname, room_data in manager.rooms.items():
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

@app.post("/api/admin/kick")
async def kick_user_from_room(data: AdminAction):
    if data.admin_username != "HABIB_Admin":
        return {"status": "error", "message": "Unauthorized"}
    success = await manager.kick_user(data.space_name, data.target_username)
    if success:
        return {"status": "success", "message": f"{data.target_username} has been kicked."}
    return {"status": "error", "message": "User not found in room."}

@app.delete("/api/admin/delete_user")
async def delete_registered_user(data: AdminAction):
    if data.admin_username != "HABIB_Admin":
        return {"status": "error", "message": "Unauthorized"}
    success = delete_user(data.target_username)
    if success:
        return {"status": "success", "message": f"{data.target_username} deleted."}
    return {"status": "error", "message": "Cannot delete admin or user not found."}

@app.post("/api/host/start")
async def start_hosting(data: HostStart):
    global mdns_service
    
    if not manager.create_room(data.space_name, data.username, data.pin):
        return {"status": "error", "message": "Space name already in use"}
    
    # Try mDNS for local network discovery
    try:
        if mdns_service is None:
            port = int(os.environ.get("PORT", 8006))
            mdns_service = MDNSService(port=port)
            mdns_service.start()
        connect_url = f"http://{mdns_service.ip}:{mdns_service.port}"
    except Exception:
        # On cloud deployments mDNS is not available
        connect_url = os.environ.get("RENDER_EXTERNAL_URL", "http://localhost:8006")
    
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
            
            if message.get("type") == "auth":
                space_name = message.get("data", {}).get("host_username") # In JS, it sends 'host_username' as space_name
                provided_pin = message.get("data", {}).get("pin")
                client_username = message.get("data", {}).get("username")
                
                room = manager.get_room(space_name)
                if not room:
                    await websocket.send_text(json.dumps({"type": "auth_fail"}))
                    continue
                
                is_host = (client_username == room['host_username'])
                pin_ok = (room['pin'] == provided_pin) or (room['pin'] == '' and provided_pin == '')
                
                if is_host or pin_ok:
                    current_room = space_name
                    result = manager.add_client_to_room(space_name, client_id, websocket, client_username)
                    
                    if result == "full":
                        await websocket.send_text(json.dumps({"type": "auth_fail", "reason": "full"}))
                        continue
                        
                    await websocket.send_text(json.dumps({
                        "type": "auth_success",
                        "host_username": room['host_username'],
                        "space_name": space_name
                    }))
                    
                    # Notify others in the room
                    await manager.broadcast_to_room(
                        space_name, 
                        {"type": "peer_joined", "username": client_username},
                        exclude_client_id=client_id
                    )
                else:
                    await websocket.send_text(json.dumps({"type": "auth_fail"}))
                    
            elif message.get("type") == "admin_auth":
                username = message.get("data", {}).get("username", "HABIB_Admin")
                provided_pwd = message.get("data", {}).get("password")
                
                role = verify_user(username, provided_pwd)
                if role == 'admin':
                    manager.add_admin(client_id, websocket)
                    await websocket.send_text(json.dumps({"type": "admin_auth_success"}))
                else:
                    await websocket.send_text(json.dumps({"type": "auth_fail"}))

            elif message.get("type") == "admin_chat_log":
                await manager.broadcast_to_admins(message)
                        
            elif current_room and message.get("type") in ["offer", "answer", "candidate", "call_request", "call_accepted", "call_declined", "typing"]:
                target = message.get("target")
                
                if target:
                    await manager.send_to_client(current_room, target, message)
                else:
                    # Broadcast to others in room
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
