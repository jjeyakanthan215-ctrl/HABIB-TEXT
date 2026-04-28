import json
import logging
from typing import Dict, Any
from fastapi import WebSocket

logger = logging.getLogger(__name__)

class ConnectionManager:
    def __init__(self):
        # rooms maps space_name -> { 'pin': str, 'host_username': str, 'clients': { client_id: websocket } }
        self.rooms: Dict[str, Dict[str, Any]] = {}
        self.admin_connections: Dict[str, WebSocket] = {}

    def get_room(self, space_name: str):
        return self.rooms.get(space_name)

    def create_room(self, space_name: str, host_username: str, pin: str):
        if space_name in self.rooms:
            return False
        self.rooms[space_name] = {
            'pin': pin,
            'host_username': host_username,
            'clients': {},
            'usernames': {}  # client_id -> username
        }
        return True

    def remove_room(self, space_name: str):
        if space_name in self.rooms:
            del self.rooms[space_name]

    def add_client_to_room(self, space_name: str, client_id: str, websocket: WebSocket, username: str = ''):
        room = self.get_room(space_name)
        if room:
            if len(room['clients']) >= 2:
                return "full"
            room['clients'][client_id] = websocket
            room['usernames'][client_id] = username
            return True
        return False

    def remove_client_from_room(self, space_name: str, client_id: str):
        room = self.get_room(space_name)
        if room and client_id in room['clients']:
            del room['clients'][client_id]
            room['usernames'].pop(client_id, None)

    async def kick_user(self, space_name: str, username: str) -> bool:
        """Send a 'kicked' message to a user and remove them from the room."""
        import json
        room = self.get_room(space_name)
        if not room:
            return False
        target_id = None
        for cid, uname in room['usernames'].items():
            if uname == username:
                target_id = cid
                break
        if not target_id:
            return False
        ws = room['clients'].get(target_id)
        if ws:
            try:
                await ws.send_text(json.dumps({'type': 'kicked'}))
            except Exception:
                pass
        self.remove_client_from_room(space_name, target_id)
        return True

    async def broadcast_to_room(self, space_name: str, message: dict, exclude_client_id: str = None):
        room = self.get_room(space_name)
        if not room:
            return
        
        dead_clients = []
        for cid, conn in list(room['clients'].items()):
            if exclude_client_id and cid == exclude_client_id:
                continue
            try:
                await conn.send_text(json.dumps(message))
            except Exception as e:
                logger.error(f"Error broadcasting to {cid}: {e}")
                dead_clients.append(cid)
                
        # Cleanup dead connections
        for cid in dead_clients:
            self.remove_client_from_room(space_name, cid)

    async def send_to_client(self, space_name: str, client_id: str, message: dict):
        room = self.get_room(space_name)
        if room and client_id in room['clients']:
            conn = room['clients'][client_id]
            try:
                await conn.send_text(json.dumps(message))
            except Exception as e:
                logger.error(f"Error sending to {client_id}: {e}")
                self.remove_client_from_room(space_name, client_id)

    # Admin Methods
    def add_admin(self, client_id: str, websocket: WebSocket):
        self.admin_connections[client_id] = websocket

    def remove_admin(self, client_id: str):
        if client_id in self.admin_connections:
            del self.admin_connections[client_id]

    async def broadcast_to_admins(self, message: dict):
        dead_admins = []
        for cid, conn in list(self.admin_connections.items()):
            try:
                await conn.send_text(json.dumps(message))
            except Exception:
                dead_admins.append(cid)
        for cid in dead_admins:
            self.remove_admin(cid)

manager = ConnectionManager()
