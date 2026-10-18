"""
DM - Dungeon Music
Sala online: servidor HTTP local (só stdlib) para os jogadores entrarem pelo navegador.

- GET /          → página do jogador (src/web/player.html)
- GET /events    → stream SSE com o estado publicado pelo mestre (exige ?k=<chave>)
- GET /media/<t> → arquivos liberados pelo mestre (token aleatório, suporta Range)

Jogadores só recebem o que o mestre publica: nenhuma lista interna é exposta.
"""

import json
import mimetypes
import os
import queue
import secrets
import socket
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit

_PAGE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "web", "player.html")

# mimetypes do Windows não conhece todos os formatos suportados
_MIME = {
    ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".opus": "audio/ogg",
    ".wav": "audio/wav", ".flac": "audio/flac", ".m4a": "audio/mp4",
    ".webm": "audio/webm", ".png": "image/png", ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg", ".gif": "image/gif", ".bmp": "image/bmp",
    ".webp": "image/webp",
}

_PING_INTERVAL = 10  # s — mantém a conexão viva e detecta jogador que saiu


def local_ips() -> list[str]:
    """IPv4 desta máquina (rede local e adaptadores de VPN como Radmin/Hamachi)."""
    ips = set()
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ips.add(info[4][0])
    except OSError:
        pass
    try:  # IP da rota padrão (connect em UDP não envia pacote)
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            ips.add(s.getsockname()[0])
    except OSError:
        pass
    return sorted(ip for ip in ips if not ip.startswith(("127.", "169.254.")))


class _Server(ThreadingHTTPServer):
    daemon_threads = True
    # No Windows, SO_REUSEADDR deixa dois processos ouvirem a mesma porta
    allow_reuse_address = os.name != "nt"


class RoomServer:
    """Sala do mestre. Métodos públicos são chamados da thread do Tkinter."""

    def __init__(self):
        self.port = 0
        self.key = ""
        self._httpd: _Server | None = None
        self._lock = threading.Lock()
        self._clients: dict[queue.Queue, str] = {}  # fila SSE → nome do jogador
        self._state: dict[str, bytes] = {}          # tópico → último evento SSE
        self._media: dict[str, str | bytes] = {}    # token → caminho ou conteúdo
        self._tokens: dict[str, str] = {}           # caminho absoluto → token

    @property
    def is_open(self) -> bool:
        return self._httpd is not None

    def open(self, port: int):
        """Abre a sala. Levanta OSError se a porta estiver ocupada."""
        handler = type("Handler", (_Handler,), {"room": self})
        self._httpd = _Server(("0.0.0.0", port), handler)
        self.port = port
        self.key = secrets.token_urlsafe(6)
        threading.Thread(target=self._httpd.serve_forever, daemon=True).start()

    def close(self):
        if self._httpd is None:
            return
        self._httpd.shutdown()
        self._httpd.server_close()
        self._httpd = None
        with self._lock:
            for q in self._clients:
                q.put(None)  # encerra streams abertos
            self._clients.clear()
            self._state.clear()
            self._media.clear()
            self._tokens.clear()

    def players(self) -> list[str]:
        with self._lock:
            return list(self._clients.values())

    # ── Mídia ───────────────────────────────────────────────────────────────
    def file_url(self, path: str) -> str:
        """Libera um arquivo para os jogadores e retorna sua URL."""
        path = os.path.abspath(path)
        with self._lock:
            token = self._tokens.get(path)
            if token is None:
                token = uuid.uuid4().hex + os.path.splitext(path)[1].lower()
                self._tokens[path] = token
                self._media[token] = path
        return "/media/" + token

    def blob_url(self, data: bytes, ext: str) -> str:
        """Libera conteúdo em memória (ex.: mapa renderizado)."""
        token = uuid.uuid4().hex + ext
        with self._lock:
            self._media[token] = data
        return "/media/" + token

    def drop(self, url: str):
        with self._lock:
            self._media.pop(url.rsplit("/", 1)[-1], None)

    # ── Estado ──────────────────────────────────────────────────────────────
    def publish(self, topic: str, payload: dict):
        """Envia o estado de um tópico (board/map/audio) a todos os jogadores.
        O último estado de cada tópico é reenviado a quem entrar depois."""
        data = json.dumps(payload, separators=(",", ":"))
        msg = f"event: {topic}\ndata: {data}\n\n".encode()
        with self._lock:
            self._state[topic] = msg
            for q in self._clients:
                q.put(msg)

    def _join(self, name: str) -> queue.Queue:
        q = queue.Queue()
        with self._lock:
            for msg in self._state.values():
                q.put(msg)
            self._clients[q] = name
        return q

    def _leave(self, q: queue.Queue):
        with self._lock:
            self._clients.pop(q, None)

    def _media_get(self, token: str):
        with self._lock:
            return self._media.get(token)


def _clock_event() -> bytes:
    """Hora do servidor: jogadores calculam a posição atual das faixas."""
    return f"event: clock\ndata: {time.time():.3f}\n\n".encode()


class _Handler(BaseHTTPRequestHandler):
    room: RoomServer = None  # injetado em RoomServer.open()

    def log_message(self, *_args):  # silencia log padrão
        pass

    def do_GET(self):
        url = urlsplit(self.path)
        if url.path == "/":
            self._send_file(_PAGE, "text/html; charset=utf-8")
        elif url.path == "/events":
            query = parse_qs(url.query)
            if query.get("k", [""])[0] != self.room.key:
                self.send_error(403)
                return
            self._stream_events(query.get("n", ["Jogador"])[0][:24])
        elif url.path.startswith("/media/"):
            token = url.path[len("/media/"):]
            src = self.room._media_get(token)
            if src is None:
                self.send_error(404)
                return
            ext = os.path.splitext(token)[1]
            ctype = _MIME.get(ext) or mimetypes.guess_type(token)[0] or "application/octet-stream"
            self._send_file(src, ctype)
        else:
            self.send_error(404)

    def _stream_events(self, name: str):
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        q = self.room._join(name)
        try:
            self.wfile.write(b"retry: 2000\n\n" + _clock_event())
            while True:
                try:
                    msg = q.get(timeout=_PING_INTERVAL)
                except queue.Empty:
                    msg = _clock_event()
                if msg is None:
                    break
                self.wfile.write(msg)
        except OSError:
            pass  # jogador fechou a aba
        finally:
            self.room._leave(q)

    def _send_file(self, src: str | bytes, ctype: str):
        """Envia arquivo/bytes com suporte a Range (necessário p/ seek de áudio)."""
        if isinstance(src, bytes):
            size = len(src)
        else:
            try:
                size = os.path.getsize(src)
            except OSError:
                self.send_error(404)
                return
        start, end = 0, size - 1
        rng = self.headers.get("Range", "")
        if rng.startswith("bytes="):
            first, _, last = rng[6:].split(",")[0].strip().partition("-")
            try:
                if first:
                    start = int(first)
                    end = min(int(last), size - 1) if last else size - 1
                else:  # sufixo: últimos N bytes
                    start = max(0, size - int(last))
            except ValueError:
                start, end = 0, size - 1
            if start > end:
                self.send_response(416)
                self.send_header("Content-Range", f"bytes */{size}")
                self.end_headers()
                return
            self.send_response(206)
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        else:
            self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(end - start + 1))
        self.send_header("Accept-Ranges", "bytes")
        self.end_headers()
        try:
            if isinstance(src, bytes):
                self.wfile.write(src[start:end + 1])
                return
            with open(src, "rb") as f:
                f.seek(start)
                left = end - start + 1
                while left > 0:
                    chunk = f.read(min(65536, left))
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    left -= len(chunk)
        except OSError:
            pass  # navegador cancela downloads ao fazer seek
