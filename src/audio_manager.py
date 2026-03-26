"""
DM - Dungeon Music
Gerenciador de Áudio com suporte a múltiplas faixas simultâneas.
Usa pygame.mixer para reprodução de áudio com canais independentes.
Suporta timeline/seek e controle de posição.
"""

import os
import time
import io
import json
import base64
import hashlib
import threading
from concurrent.futures import ThreadPoolExecutor
import pygame


# ═══════════════════════════════════════════════
# Cache de metadados (duração + artwork)
# ═══════════════════════════════════════════════

_CACHE_DIR = os.path.join(os.path.expanduser("~"), ".dm_dungeon_music", "cache")
_CACHE_INDEX = os.path.join(_CACHE_DIR, "metadata.json")
_ARTWORK_DIR = os.path.join(_CACHE_DIR, "artwork")
_cache_data: dict = {}
_cache_dirty = False


def _cache_key(file_path: str) -> str:
    """Gera chave de cache baseada no caminho + tamanho + mtime do arquivo."""
    try:
        stat = os.stat(file_path)
        raw = f"{os.path.abspath(file_path)}|{stat.st_size}|{stat.st_mtime_ns}"
        return hashlib.md5(raw.encode('utf-8')).hexdigest()
    except Exception:
        return hashlib.md5(file_path.encode('utf-8')).hexdigest()


def _load_cache():
    """Carrega o índice de cache do disco."""
    global _cache_data
    if _cache_data:
        return
    try:
        if os.path.isfile(_CACHE_INDEX):
            with open(_CACHE_INDEX, 'r', encoding='utf-8') as f:
                _cache_data = json.load(f)
    except Exception:
        _cache_data = {}


def _save_cache():
    """Salva o índice de cache no disco."""
    global _cache_dirty
    if not _cache_dirty:
        return
    try:
        os.makedirs(_CACHE_DIR, exist_ok=True)
        with open(_CACHE_INDEX, 'w', encoding='utf-8') as f:
            json.dump(_cache_data, f, ensure_ascii=False)
        _cache_dirty = False
    except Exception as e:
        print(f"[DM] Erro ao salvar cache: {e}")


def _get_cached_metadata(file_path: str) -> dict | None:
    """Retorna metadados do cache ou None se não encontrado."""
    _load_cache()
    key = _cache_key(file_path)
    return _cache_data.get(key)


def _set_cached_metadata(file_path: str, duration: float,
                         artwork_data: bytes | None):
    """Salva metadados no cache."""
    global _cache_dirty
    _load_cache()
    key = _cache_key(file_path)

    entry = {"duration": duration, "artwork_file": None}

    # Salva artwork em arquivo separado (não polui o JSON)
    if artwork_data:
        try:
            os.makedirs(_ARTWORK_DIR, exist_ok=True)
            art_path = os.path.join(_ARTWORK_DIR, f"{key}.dat")
            with open(art_path, 'wb') as f:
                f.write(artwork_data)
            entry["artwork_file"] = f"{key}.dat"
        except Exception:
            pass

    _cache_data[key] = entry
    _cache_dirty = True


def _get_cached_artwork(artwork_file: str) -> bytes | None:
    """Lê artwork do cache de arquivos."""
    if not artwork_file:
        return None
    try:
        art_path = os.path.join(_ARTWORK_DIR, artwork_file)
        if os.path.isfile(art_path):
            with open(art_path, 'rb') as f:
                return f.read()
    except Exception:
        pass
    return None


def extract_artwork(file_path: str) -> bytes | None:
    """Extrai artwork embutida de um arquivo de áudio (MP3/FLAC/OGG/Opus)."""
    try:
        from mutagen import File as MutagenFile
        from mutagen.flac import FLAC

        audio = MutagenFile(file_path)
        if audio is None:
            print(f"[DM] Mutagen n\u00e3o reconheceu: {file_path}")
            return _find_companion_artwork(file_path)

        # MP3 (ID3 tags)
        if hasattr(audio, 'tags') and audio.tags:
            for key in audio.tags:
                tag = audio.tags[key]
                if hasattr(tag, 'data') and str(key).startswith('APIC'):
                    print(f"[DM] Artwork APIC encontrada: {len(tag.data)} bytes")
                    return tag.data

        # MP3 fallback: tentar via mutagen.mp3 diretamente
        ext = os.path.splitext(file_path)[1].lower()
        if ext == '.mp3':
            try:
                from mutagen.mp3 import MP3
                from mutagen.id3 import ID3
                mp3 = MP3(file_path)
                if mp3.tags:
                    for key in mp3.tags:
                        if str(key).startswith('APIC'):
                            data = mp3.tags[key].data
                            print(f"[DM] Artwork APIC (fallback MP3): {len(data)} bytes")
                            return data
            except Exception as e:
                print(f"[DM] Fallback MP3 APIC falhou: {e}")

        # FLAC
        if isinstance(audio, FLAC) and audio.pictures:
            return audio.pictures[0].data

        # OGG Vorbis / Opus (yt-dlp usa metadata_block_picture)
        if hasattr(audio, 'tags') and audio.tags:
            pics = audio.tags.get('metadata_block_picture', [])
            if pics:
                import struct
                raw = base64.b64decode(pics[0])
                # FLAC picture block: skip header to get image data
                # Type(4) + MimeLen(4) + Mime + DescLen(4) + Desc + W(4) + H(4) + Depth(4) + Colors(4) + DataLen(4) + Data
                offset = 4
                mime_len = struct.unpack('>I', raw[offset:offset+4])[0]
                offset += 4 + mime_len
                desc_len = struct.unpack('>I', raw[offset:offset+4])[0]
                offset += 4 + desc_len + 16  # skip desc + w + h + depth + colors
                data_len = struct.unpack('>I', raw[offset:offset+4])[0]
                offset += 4
                return raw[offset:offset+data_len]

        print(f"[DM] Nenhuma artwork embutida em: {os.path.basename(file_path)}")

    except Exception as e:
        print(f"[DM] Erro ao extrair artwork: {e}")

    return _find_companion_artwork(file_path)


def _find_companion_artwork(file_path: str) -> bytes | None:
    """Procura imagem companion (thumbnail salva pelo yt-dlp) ao lado do áudio."""
    base = os.path.splitext(file_path)[0]
    directory = os.path.dirname(file_path)
    stem = os.path.splitext(os.path.basename(file_path))[0]

    # Padrão exato: mesmo nome, extensão diferente
    for ext in ('.webp', '.jpg', '.jpeg', '.png'):
        img_path = base + ext
        if os.path.isfile(img_path):
            try:
                with open(img_path, 'rb') as f:
                    return f.read()
            except Exception:
                pass

    # Padrões do yt-dlp: nome.thumb.webp, nome_thumb.webp
    for suffix in ('.thumb', '_thumb', '.thumbnail'):
        for ext in ('.webp', '.jpg', '.jpeg', '.png'):
            img_path = os.path.join(directory, stem + suffix + ext)
            if os.path.isfile(img_path):
                try:
                    with open(img_path, 'rb') as f:
                        return f.read()
                except Exception:
                    pass

    # Fallback: qualquer imagem no mesmo diretório que comece com o mesmo nome
    if os.path.isdir(directory):
        try:
            for f in os.listdir(directory):
                if f.startswith(stem) and f != os.path.basename(file_path):
                    fext = os.path.splitext(f)[1].lower()
                    if fext in ('.webp', '.jpg', '.jpeg', '.png'):
                        try:
                            with open(os.path.join(directory, f), 'rb') as fh:
                                return fh.read()
                        except Exception:
                            pass
        except Exception:
            pass

    return None


class AudioTrack:
    """Representa uma faixa de áudio individual com controles independentes.

    Canal e Sound são alocados dinamicamente:
    - Canal: adquirido ao dar play, liberado ao parar
    - Sound: carregado ao dar play, mantido para replay rápido
    Isso permite faixas ilimitadas na lista (memória usada só pelas ativas).
    Metadados (duração, artwork) são carregados em background.
    """

    def __init__(self, track_id: int, file_path: str, manager: 'AudioManager'):
        self.track_id = track_id
        self.file_path = file_path
        self.file_name = os.path.basename(file_path)
        self._manager = manager

        # Canal e Sound: alocados dinamicamente
        self.channel: pygame.mixer.Channel | None = None
        self._channel_id: int | None = None
        self.sound: pygame.mixer.Sound | None = None

        self.volume = 0.7
        self.is_playing = False
        self.is_paused = False
        self.is_looping = False
        self.artwork_data: bytes | None = None
        self.metadata_loaded = False  # True quando duração/artwork prontos

        # Timeline / Seek
        self.duration = 0.0
        self._original_raw: bytes = b""
        self._seek_offset = 0.0
        self._play_start_time = 0.0
        self._pause_position = 0.0
        self._bytes_per_second = 0
        self._frame_size = 0

        # Efeitos
        self.speed_factor = 1.0
        self.reverb_enabled = False
        self._processed_raw: bytes = b""
        self._original_duration = 0.0

        # Constantes do mixer (disponíveis imediatamente)
        try:
            freq, size, channels = pygame.mixer.get_init()
            bytes_per_sample = abs(size) // 8
            self._frame_size = channels * bytes_per_sample
            self._bytes_per_second = freq * self._frame_size
        except Exception:
            pass

        # Tenta cache no construtor (leitura local, instantâneo)
        self._try_load_from_cache()

    def _try_load_from_cache(self):
        """Tenta carregar metadados do cache (instantâneo, sem I/O pesado).
        Se cache hit, seta metadata_loaded=True e o widget não mostra ⏳."""
        cached = _get_cached_metadata(self.file_path)
        if cached:
            self.duration = cached.get("duration", 0.0)
            self._original_duration = self.duration
            art_file = cached.get("artwork_file")
            if art_file:
                self.artwork_data = _get_cached_artwork(art_file)
            self.metadata_loaded = True

    def load_metadata(self):
        """Carrega duração e artwork. Thread-safe (sem tocar no tkinter).
        Usa cache em disco para evitar re-extração em cada abertura do app."""
        # Tenta cache primeiro (instantâneo)
        cached = _get_cached_metadata(self.file_path)
        if cached:
            self.duration = cached.get("duration", 0.0)
            self._original_duration = self.duration
            art_file = cached.get("artwork_file")
            if art_file:
                self.artwork_data = _get_cached_artwork(art_file)
            self.metadata_loaded = True
            return

        # Cache miss — extrai de verdade
        try:
            from mutagen import File as MutagenFile
            audio = MutagenFile(self.file_path)
            if audio and hasattr(audio, 'info') and audio.info:
                self.duration = audio.info.length
        except Exception:
            pass

        # Fallback: se mutagen falhar, tenta via Sound temporário
        if self.duration <= 0:
            try:
                temp = pygame.mixer.Sound(self.file_path)
                self.duration = temp.get_length()
                del temp
            except Exception:
                pass

        self._original_duration = self.duration

        # Artwork
        self.artwork_data = extract_artwork(self.file_path)

        # Salva no cache para próximas aberturas
        _set_cached_metadata(self.file_path, self.duration, self.artwork_data)

        self.metadata_loaded = True

    def _load_sound(self):
        """Carrega áudio em memória (chamado no primeiro play)."""
        if self.sound is None:
            self.sound = pygame.mixer.Sound(self.file_path)
            self.sound.set_volume(self.volume)
            # Atualiza duração com valor real do áudio
            actual = self.sound.get_length()
            if actual > 0:
                self.duration = actual
                self._original_duration = actual

    def _unload_sound(self):
        """Libera áudio da memória."""
        self.sound = None
        self._original_raw = b""
        self._processed_raw = b""

    def _ensure_raw(self):
        """Carrega raw PCM sob demanda (para seek/efeitos)."""
        self._load_sound()
        if not self._original_raw and self.sound:
            self._original_raw = self.sound.get_raw()
            self._processed_raw = self._original_raw

    def play(self, loop: bool = False):
        """Reproduz a faixa. Adquire canal e carrega áudio automaticamente."""
        # Adquire canal se necessário
        if self.channel is None:
            if not self._manager._acquire_channel(self):
                print("[DM] Sem canais livres! Pare outra faixa primeiro.")
                return
        # Carrega áudio se necessário
        self._load_sound()
        if self.sound is None:
            return

        self.is_looping = loop
        loops = -1 if loop else 0
        self.channel.play(self.sound, loops=loops)
        self._play_start_time = time.time()
        self.is_playing = True
        self.is_paused = False

    def pause(self):
        """Pausa a faixa."""
        if self.is_playing and not self.is_paused and self.channel:
            self._pause_position = self.get_position()
            self.channel.pause()
            self.is_paused = True

    def unpause(self):
        """Retoma a faixa pausada."""
        if self.is_paused and self.channel:
            self._play_start_time = time.time() - (self._pause_position - self._seek_offset)
            self.channel.unpause()
            self.is_paused = False

    def stop(self):
        """Para a faixa e libera canal + memória."""
        if self.channel:
            self.channel.stop()
        self.is_playing = False
        self.is_paused = False
        self._seek_offset = 0.0
        self._pause_position = 0.0
        # Libera canal para outras faixas
        self._manager._release_channel(self)
        # Libera memória pesada (raw PCM pode ser >1GB para faixas longas)
        self._original_raw = b""
        self._processed_raw = b""
        # Sound será recarregado via lazy-loading no próximo play
        self.sound = None

    def set_volume(self, volume: float):
        """Define o volume (0.0 a 1.0)."""
        self.volume = max(0.0, min(1.0, volume))
        if self.sound:
            self.sound.set_volume(self.volume)

    def get_position(self) -> float:
        """Retorna a posição atual de reprodução em segundos."""
        if self.is_playing and not self.is_paused:
            elapsed = self._seek_offset + (time.time() - self._play_start_time)
            if self.is_looping and self.duration > 0:
                elapsed = elapsed % self.duration
            return min(elapsed, self.duration)
        elif self.is_paused:
            return self._pause_position
        return 0.0

    def seek(self, position_seconds: float):
        """Avança/retrocede para uma posição específica em segundos."""
        # Precisa de canal para tocar após seek
        if self.channel is None:
            if not self._manager._acquire_channel(self):
                return
        self._ensure_raw()

        position_seconds = max(0.0, min(position_seconds, self.duration))
        was_playing = self.is_playing and not self.is_paused
        was_paused = self.is_paused

        self.channel.stop()

        # Cria som a partir do offset de bytes
        active_raw = self._processed_raw
        if position_seconds <= 0.01 or not active_raw:
            self.sound = pygame.mixer.Sound(buffer=active_raw)
        else:
            byte_offset = int(position_seconds * self._bytes_per_second)
            byte_offset = (byte_offset // self._frame_size) * self._frame_size
            byte_offset = min(byte_offset, len(active_raw) - self._frame_size)
            byte_offset = max(0, byte_offset)

            sliced = active_raw[byte_offset:]
            if len(sliced) < self._frame_size:
                sliced = active_raw
                position_seconds = 0.0
            self.sound = pygame.mixer.Sound(buffer=sliced)

        self.sound.set_volume(self.volume)
        self._seek_offset = position_seconds

        if was_playing:
            loops = -1 if self.is_looping else 0
            self.channel.play(self.sound, loops=loops)
            self._play_start_time = time.time()
            self.is_playing = True
            self.is_paused = False
        elif was_paused:
            self._pause_position = position_seconds
            self.is_playing = True
            self.is_paused = True
        else:
            self._pause_position = position_seconds

    def is_active(self) -> bool:
        """Verifica se a faixa está tocando atualmente."""
        if self.channel is None:
            return self.is_paused
        return self.channel.get_busy() or self.is_paused

    def format_time(self, seconds: float) -> str:
        """Formata segundos para MM:SS ou HH:MM:SS."""
        seconds = max(0.0, seconds)
        hours = int(seconds // 3600)
        mins = int((seconds % 3600) // 60)
        secs = int(seconds % 60)
        if hours > 0:
            return f"{hours}:{mins:02d}:{secs:02d}"
        return f"{mins:02d}:{secs:02d}"

    # ═══════════════════════════════════════
    # Efeitos de Áudio
    # ═══════════════════════════════════════

    def apply_effects(self, speed: float = 1.0, reverb: bool = False):
        """Aplica efeitos de áudio (velocidade e reverb)."""
        # Precisa de canal para reproduzir após aplicar
        if self.channel is None:
            if not self._manager._acquire_channel(self):
                return
        self._ensure_raw()
        was_playing = self.is_playing and not self.is_paused

        self.channel.stop()
        self.is_playing = False
        self.is_paused = False

        self.speed_factor = speed
        self.reverb_enabled = reverb
        processed = self._original_raw

        # Velocidade
        if abs(speed - 1.0) > 0.01 and processed:
            processed = self._resample(processed, speed)

        # Reverb
        if reverb and processed:
            processed = self._add_reverb(processed)

        self._processed_raw = processed

        # Recalcula duração
        freq, size, channels = pygame.mixer.get_init()
        bps = abs(size) // 8
        frame_sz = channels * bps
        bps_sec = freq * frame_sz
        self.duration = len(self._processed_raw) / bps_sec if bps_sec > 0 else 0
        self._bytes_per_second = bps_sec
        self._frame_size = frame_sz

        self.sound = pygame.mixer.Sound(buffer=self._processed_raw)
        self.sound.set_volume(self.volume)
        self._seek_offset = 0.0

        if was_playing:
            self.play(loop=self.is_looping)

    def _resample(self, raw: bytes, speed: float) -> bytes:
        """Resample PCM por fator de velocidade."""
        import array as _arr

        freq, size, channels = pygame.mixer.get_init()
        bps = abs(size) // 8
        typecode = 'h' if bps == 2 else ('i' if bps == 4 else None)
        if typecode is None:
            return raw

        samples = _arr.array(typecode, raw)
        n_ch = channels
        num_frames = len(samples) // n_ch

        out = _arr.array(typecode)
        pos = 0.0
        while pos < num_frames:
            idx = int(pos)
            if idx >= num_frames:
                break
            base = idx * n_ch
            for c in range(n_ch):
                out.append(samples[base + c])
            pos += speed

        return out.tobytes()

    def _add_reverb(self, raw: bytes, delay_ms: int = 80,
                    decay: float = 0.3) -> bytes:
        """Adiciona reverb/echo simples."""
        import array as _arr

        freq, size, channels = pygame.mixer.get_init()
        if abs(size) // 8 != 2:
            return raw

        samples = _arr.array('h', raw)
        delay_n = int(freq * channels * delay_ms / 1000)

        for i in range(delay_n, len(samples)):
            v = int(samples[i] + samples[i - delay_n] * decay)
            if v > 32767:
                v = 32767
            elif v < -32768:
                v = -32768
            samples[i] = v

        return samples.tobytes()

    def reset_effects(self):
        """Remove todos os efeitos de áudio."""
        if self.channel:
            self.channel.stop()
        self.speed_factor = 1.0
        self.reverb_enabled = False

        if self._original_raw:
            self._processed_raw = self._original_raw
            self.sound = pygame.mixer.Sound(buffer=self._processed_raw)
        elif self.sound is not None:
            pass  # Sound original ainda carregado
        else:
            self._load_sound()

        self.duration = self._original_duration
        if self.sound:
            self.sound.set_volume(self.volume)

        freq, size, channels = pygame.mixer.get_init()
        bps = abs(size) // 8
        self._frame_size = channels * bps
        self._bytes_per_second = freq * self._frame_size

        self._seek_offset = 0.0
        self.is_playing = False
        self.is_paused = False


class AudioManager:
    """Gerencia múltiplas faixas de áudio simultâneas.

    Faixas ilimitadas (só metadados), canais alocados dinamicamente ao tocar.
    Limite de reprodução simultânea: MAX_CONCURRENT canais por manager.
    """

    MAX_CONCURRENT = 16   # Reproduções simultâneas por manager
    _mixer_initialized = False

    def __init__(self, channel_offset: int = 0):
        if not AudioManager._mixer_initialized:
            pygame.mixer.pre_init(frequency=44100, size=-16, channels=2, buffer=2048)
            pygame.mixer.init()
            pygame.mixer.set_num_channels(48)  # 0-15 music, 16-31 sfx, 32-47 player
            AudioManager._mixer_initialized = True
        self._channel_offset = channel_offset
        self.tracks: dict[int, AudioTrack] = {}
        self._next_id = 0

    def add_track(self, file_path: str) -> AudioTrack:
        """Adiciona uma nova faixa (sem limite de quantidade)."""
        if not os.path.isfile(file_path):
            raise FileNotFoundError(f"Arquivo não encontrado: {file_path}")

        ext = os.path.splitext(file_path)[1].lower()
        if ext not in ('.mp3', '.wav', '.ogg', '.flac', '.opus', '.webm', '.m4a'):
            raise ValueError(f"Formato não suportado: {ext}")

        # Sem alocação de canal — apenas metadados
        track = AudioTrack(self._next_id, file_path, self)
        self.tracks[self._next_id] = track
        self._next_id += 1
        return track

    def _acquire_channel(self, track: AudioTrack) -> bool:
        """Adquire um canal livre para a faixa. Retorna True se sucesso."""
        if track._channel_id is not None:
            return True  # Já tem canal
        channel_id = self._find_free_channel()
        if channel_id is None:
            return False
        track.channel = pygame.mixer.Channel(channel_id)
        track._channel_id = channel_id
        return True

    def _release_channel(self, track: AudioTrack):
        """Libera o canal da faixa para reutilização."""
        track.channel = None
        track._channel_id = None

    def remove_track(self, track_id: int):
        """Remove uma faixa de áudio."""
        if track_id in self.tracks:
            track = self.tracks[track_id]
            track.stop()
            track._unload_sound()  # Libera memória
            del self.tracks[track_id]

    def play_track(self, track_id: int, loop: bool = False):
        """Reproduz uma faixa específica."""
        if track_id in self.tracks:
            self.tracks[track_id].play(loop=loop)

    def pause_track(self, track_id: int):
        """Pausa uma faixa específica."""
        if track_id in self.tracks:
            track = self.tracks[track_id]
            if track.is_paused:
                track.unpause()
            else:
                track.pause()

    def stop_track(self, track_id: int):
        """Para uma faixa específica."""
        if track_id in self.tracks:
            self.tracks[track_id].stop()

    def set_track_volume(self, track_id: int, volume: float):
        """Define o volume de uma faixa."""
        if track_id in self.tracks:
            self.tracks[track_id].set_volume(volume)

    def seek_track(self, track_id: int, position: float):
        """Faz seek em uma faixa específica."""
        if track_id in self.tracks:
            self.tracks[track_id].seek(position)

    def stop_all(self):
        """Para todas as faixas."""
        for track in self.tracks.values():
            track.stop()

    def pause_all(self):
        """Pausa todas as faixas."""
        for track in self.tracks.values():
            if track.is_playing and not track.is_paused:
                track.pause()

    def unpause_all(self):
        """Retoma todas as faixas pausadas."""
        for track in self.tracks.values():
            if track.is_paused:
                track.unpause()

    def get_all_tracks(self) -> list[AudioTrack]:
        """Retorna todas as faixas."""
        return list(self.tracks.values())

    def _find_free_channel(self) -> int | None:
        """Encontra um canal livre (só conta canais de faixas ativas)."""
        used = {t._channel_id for t in self.tracks.values()
                if t._channel_id is not None}
        max_ch = self._channel_offset + self.MAX_CONCURRENT
        for i in range(self._channel_offset, max_ch):
            if i not in used:
                return i
        return None

    def cleanup(self):
        """Limpa todos os recursos de áudio."""
        try:
            pygame.mixer.stop()
        except Exception:
            pass
        self.tracks.clear()

    def clear_all(self):
        """Para e remove todas as faixas, liberando recursos."""
        for track_id in list(self.tracks.keys()):
            self.remove_track(track_id)
        self._next_id = 0

    def load_metadata_async(self, tracks: list[AudioTrack],
                            on_track_ready=None, on_all_done=None):
        """Carrega metadados de múltiplas faixas em background (thread pool).

        Args:
            tracks: Lista de AudioTrack para carregar metadados.
            on_track_ready: Callback(track) chamado quando cada faixa termina.
                           ATENÇÃO: chamado na worker thread, use after() no tkinter.
            on_all_done: Callback() chamado quando todas terminam.
        """
        def _worker(track):
            try:
                track.load_metadata()
            except Exception as e:
                print(f"[DM] Erro metadata '{track.file_name}': {e}")
            if on_track_ready:
                on_track_ready(track)

        def _run():
            with ThreadPoolExecutor(max_workers=4) as pool:
                pool.map(_worker, tracks)
            # Salva cache após carregar todos os metadados
            _save_cache()
            if on_all_done:
                on_all_done()

        thread = threading.Thread(target=_run, daemon=True)
        thread.start()

    # ═══════════════════════════════════════
    # Persistência de faixas
    # ═══════════════════════════════════════

    def save_track_list(self, file_path: str):
        """Salva a lista de faixas em JSON."""
        data = []
        for track in self.tracks.values():
            data.append({
                "file_path": track.file_path,
                "volume": track.volume,
            })
        try:
            os.makedirs(os.path.dirname(file_path), exist_ok=True)
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"[DM] Erro ao salvar faixas: {e}")

    def load_track_list(self, file_path: str) -> int:
        """Carrega faixas de um JSON. Retorna quantas foram carregadas."""
        if not os.path.isfile(file_path):
            return 0
        loaded = 0
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            for item in data:
                fp = item.get('file_path', '')
                if os.path.isfile(fp):
                    try:
                        track = self.add_track(fp)
                        vol = item.get('volume', 0.7)
                        track.set_volume(vol)
                        loaded += 1
                    except Exception as e:
                        print(f"[DM] Erro ao restaurar '{fp}': {e}")
                else:
                    print(f"[DM] Arquivo não encontrado: {fp}")
        except Exception as e:
            print(f"[DM] Erro ao ler {file_path}: {e}")
        return loaded
