"""
Rede básica para DM - Dungeon Music.
Oferece um servidor WebSocket simples com PIN de sessão e whitelisting de eventos.
Pensado para rodar em thread separada para não travar o Tkinter.
"""

import asyncio
import json
import mimetypes
import os
import secrets
import socketserver
import threading
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler
from typing import Callable, Dict, List, Optional

import websockets
from websockets.server import WebSocketServerProtocol

# Eventos permitidos vindos de clientes (jogadores)
ALLOWED_PLAYER_EVENTS = {
    "volume_change",
    "request_status",
    "dice_roll",
}

# Eventos permitidos para broadcast do mestre
ALLOWED_HOST_EVENTS = {
    "map_update",
    "play_track",
    "stop_track",
    "sfx_play",
    "set_volume",
    "status",
    "canvas_update",
    "canvas_full_sync",
    "map_share",
    "dice_result",
    "audio_volume",
    "battlemap_update",
    "battlemap_full_sync",
}


@dataclass
class ClientInfo:
    player_id: str
    websocket: WebSocketServerProtocol


class NetworkManager:
    """Camada de rede mínima via WebSockets.

    - Mestre hospeda com PIN + session_id (aleatórios)
    - Jogadores conectam enviando hello {session_id, pin, player_id}
    - Eventos são validados por whitelist para reduzir superfície de ataque
    - Roda em loop asyncio dedicado, isolado da UI Tkinter
    """

    def __init__(self):
        self.session_id: Optional[str] = None
        self.pin: Optional[str] = None
        self._role: str = "offline"  # offline | host | client
        self._server = None
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self._clients: Dict[str, ClientInfo] = {}
        self._status_listeners: list[Callable[[str], None]] = []
        self._message_listeners: list[Callable[[dict], None]] = []
        self._on_player_joined_callbacks: List[Callable[[str], None]] = []
        self._client_ws: Optional[websockets.WebSocketClientProtocol] = None
        self._lock = threading.Lock()
        self._local_player_id: str = "host"
        self._last_connected_host: str = "127.0.0.1"
        # HTTP file server
        self._http_server: Optional[socketserver.TCPServer] = None
        self._http_thread: Optional[threading.Thread] = None
        self._audio_dirs: List[str] = []

    # ── Listeners -----------------------------------------------------------
    def add_status_listener(self, callback: Callable[[str], None]):
        self._status_listeners.append(callback)

    def add_message_listener(self, callback: Callable[[dict], None]):
        self._message_listeners.append(callback)

    def add_player_joined_listener(self, callback: Callable[[str], None]):
        self._on_player_joined_callbacks.append(callback)

    def _emit_status(self, message: str):
        for cb in list(self._status_listeners):
            try:
                cb(message)
            except Exception:
                pass

    def _emit_message(self, payload: dict):
        for cb in list(self._message_listeners):
            try:
                cb(payload)
            except Exception:
                pass

    def _emit_player_joined(self, player_id: str):
        for cb in list(self._on_player_joined_callbacks):
            try:
                cb(player_id)
            except Exception:
                pass

    # ── Helpers -------------------------------------------------------------
    def get_connected_count(self) -> int:
        return len(self._clients)

    @property
    def is_hosting(self) -> bool:
        return self._role == "host"

    @property
    def is_client(self) -> bool:
        return self._role == "client"

    def get_session_info(self) -> str:
        if self.session_id and self.pin:
            return f"Sessão {self.session_id} | PIN {self.pin}"
        return "Offline"

    # ── HTTP audio server ---------------------------------------------------
    def start_http_server(self, audio_dirs: List[str], port: int = 8766):
        """Serve /audio/<filename> a partir de diretórios autorizados."""
        if self._http_server is not None:
            return

        self._audio_dirs = [os.path.abspath(d) for d in audio_dirs if os.path.isdir(d)]

        manager_ref = self

        class AudioHandler(BaseHTTPRequestHandler):
            def log_message(self, _format, *_args):  # silence default logging
                pass

            def do_GET(self):
                if not self.path.startswith("/audio/"):
                    self.send_error(404)
                    return

                # Sanitise filename – reject any path traversal
                raw_name = self.path[len("/audio/"):]
                filename = os.path.basename(raw_name)
                if not filename or filename != raw_name:
                    self.send_error(403)
                    return

                # Search authorised directories
                target = None
                for d in manager_ref._audio_dirs:
                    candidate = os.path.join(d, filename)
                    candidate = os.path.abspath(candidate)
                    if candidate.startswith(d + os.sep) or candidate == d:
                        if os.path.isfile(candidate):
                            target = candidate
                            break

                if target is None:
                    self.send_error(404)
                    return

                mime, _ = mimetypes.guess_type(target)
                mime = mime or "application/octet-stream"
                size = os.path.getsize(target)
                self.send_response(200)
                self.send_header("Content-Type", mime)
                self.send_header("Content-Length", str(size))
                self.end_headers()
                try:
                    with open(target, "rb") as f:
                        while True:
                            chunk = f.read(65536)
                            if not chunk:
                                break
                            self.wfile.write(chunk)
                except Exception:
                    pass

        try:
            socketserver.TCPServer.allow_reuse_address = True
            self._http_server = socketserver.TCPServer(("0.0.0.0", port), AudioHandler)
            self._http_thread = threading.Thread(
                target=self._http_server.serve_forever, daemon=True
            )
            self._http_thread.start()
            self._emit_status(f"Servidor de áudio HTTP em porta {port}")
        except OSError as exc:
            self._http_server = None
            self._emit_status(f"Falha ao iniciar servidor HTTP: {exc}")

    def add_audio_dir(self, path: str):
        """Adiciona diretório ao servidor HTTP dinamicamente (novos arquivos de áudio)."""
        path = os.path.abspath(path)
        if os.path.isdir(path) and path not in self._audio_dirs:
            self._audio_dirs.append(path)

    def stop_http_server(self):
        if self._http_server is not None:
            try:
                self._http_server.shutdown()
                self._http_server.server_close()
            except Exception:
                pass
            self._http_server = None
            self._http_thread = None
            self._audio_dirs = []

    # ── Hosting -------------------------------------------------------------
    def host(self, host: str = "0.0.0.0", port: int = 8765):
        """Inicia o servidor como Mestre."""
        if self._thread and self._thread.is_alive():
            self._emit_status("Servidor já em execução")
            return
        self.session_id = secrets.token_urlsafe(8)
        self.pin = f"{secrets.randbelow(900000) + 100000:06d}"
        self._role = "host"
        self._local_player_id = "host"
        self._stop_event.clear()

        def _runner():
            asyncio.set_event_loop(asyncio.new_event_loop())
            self._loop = asyncio.get_event_loop()
            start_server = websockets.serve(self._handle_client, host, port, max_size=2 * 1024 * 1024)
            self._server = self._loop.run_until_complete(start_server)
            self._emit_status(
                f"Hospedando em {host}:{port} | Sessão {self.session_id} | PIN {self.pin}"
            )
            try:
                self._loop.run_forever()
            finally:
                self._cleanup()

        self._thread = threading.Thread(target=_runner, daemon=True)
        self._thread.start()

    async def _handle_client(self, websocket: WebSocketServerProtocol):
        """Handshake + roteamento de eventos de jogador."""
        try:
            raw = await asyncio.wait_for(websocket.recv(), timeout=10)
            hello = json.loads(raw)
        except Exception:
            await websocket.close(code=4001, reason="Handshake inválido")
            return

        if hello.get("type") != "hello" or hello.get("session_id") != self.session_id or hello.get("pin") != self.pin:
            await websocket.close(code=4003, reason="Sessão/PIN inválidos")
            return

        player_id = str(hello.get("player_id", "player"))[:24]
        with self._lock:
            self._clients[player_id] = ClientInfo(player_id=player_id, websocket=websocket)
        await websocket.send(json.dumps({"type": "welcome", "session_id": self.session_id}))
        self._emit_status(f"Jogador conectado: {player_id}")
        self._emit_player_joined(player_id)

        try:
            async for raw in websocket:
                try:
                    data = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                if data.get("type") not in ALLOWED_PLAYER_EVENTS:
                    await websocket.close(code=4004, reason="Evento não permitido")
                    return
                data["player_id"] = player_id
                self._emit_message(data)
        except websockets.ConnectionClosed:
            pass
        finally:
            with self._lock:
                self._clients.pop(player_id, None)
            self._emit_status(f"Jogador desconectado: {player_id}")

    def broadcast(self, event_type: str, payload: dict):
        """Envia evento do Mestre para todos os jogadores."""
        if self._role != "host" or event_type not in ALLOWED_HOST_EVENTS:
            return
        message = json.dumps({"type": event_type, **payload})
        if not self._loop:
            return
        asyncio.run_coroutine_threadsafe(self._broadcast_async(message), self._loop)

    async def _broadcast_async(self, message: str):
        with self._lock:
            clients = list(self._clients.items())
        for player_id, info in clients:
            try:
                await info.websocket.send(message)
            except Exception:
                self._emit_status(f"Falha ao enviar para {player_id}")

    # ── Cliente -------------------------------------------------------------
    def join(self, host: str, port: int, session_id: str, pin: str, player_id: str):
        """Conecta como jogador."""
        if self._thread and self._thread.is_alive():
            self.stop()
        self.session_id = session_id
        self.pin = pin
        self._role = "client"
        self._local_player_id = player_id
        self._last_connected_host = host
        self._stop_event.clear()

        def _runner():
            asyncio.set_event_loop(asyncio.new_event_loop())
            self._loop = asyncio.get_event_loop()
            self._loop.run_until_complete(self._client_loop(host, port, session_id, pin, player_id))
            self._cleanup()

        self._thread = threading.Thread(target=_runner, daemon=True)
        self._thread.start()

    async def _client_loop(self, host: str, port: int, session_id: str, pin: str, player_id: str):
        uri = f"ws://{host}:{port}"
        try:
            async with websockets.connect(uri, max_size=2 * 1024 * 1024) as ws:
                self._client_ws = ws
                hello = {"type": "hello", "session_id": session_id, "pin": pin, "player_id": player_id}
                await ws.send(json.dumps(hello))
                async for raw in ws:
                    try:
                        data = json.loads(raw)
                    except json.JSONDecodeError:
                        continue
                    self._emit_message(data)
        except Exception as exc:
            self._emit_status(f"Erro ao conectar: {exc}")

    def send_to_host(self, event_type: str, payload: dict):
        """Jogador envia evento ao Mestre (whitelist)."""
        if self._role != "client" or event_type not in ALLOWED_PLAYER_EVENTS:
            return
        if not self._loop or not self._client_ws:
            return
        message = json.dumps({"type": event_type, **payload})
        asyncio.run_coroutine_threadsafe(self._client_ws.send(message), self._loop)

    # ── Encerramento --------------------------------------------------------
    def stop(self):
        self.stop_http_server()
        self._stop_event.set()
        if self._loop:
            self._loop.call_soon_threadsafe(self._loop.stop)
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=2)
        self._cleanup()
        self._emit_status("Rede finalizada")

    def _cleanup(self):
        try:
            if self._server:
                self._server.close()
                if self._loop:
                    self._loop.run_until_complete(self._server.wait_closed())
        except Exception:
            pass
        try:
            if self._client_ws:
                asyncio.run_coroutine_threadsafe(self._client_ws.close(), self._loop)
        except Exception:
            pass
        self._server = None
        self._client_ws = None
        with self._lock:
            self._clients.clear()
        self._role = "offline"
        if self._loop and self._loop.is_running():
            self._loop.call_soon_threadsafe(self._loop.stop)
