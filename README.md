# ⚔️ DM - Dungeon Music

Desktop toolkit for **RPG Game Masters**. Manage music, sound effects, images, presentation canvas, and (beta) online sessions in one place.

![Python](https://img.shields.io/badge/Python-3.10%2B-blue?logo=python&logoColor=white)
![Pygame](https://img.shields.io/badge/Pygame-2.5%2B-green)
![License](https://img.shields.io/badge/License-MIT-yellow)

---

## 🎯 Features

| Area | Description |
|------|-------------|
| 🎵 Multi-track music | Play multiple tracks with per-track volume, loop, seek, speed, and reverb |
| 💥 Sound effects | Dedicated SFX tab for short cues (weapons, doors, ambience) |
| 🖼️ Image sessions | Organize battle maps and handouts by session; toggle visibility |
| 🎬 Presentation canvas | Zoom/pan, z-order, particles; share via screen share | 
| 🌐 Online (beta) | Host/join via WebSocket with session ID + PIN; currently logs events only |
| 💾 Persistence | Sessions and tracks auto-saved; metadata cache for fast startup |
| 🌙 Dark theme | Modern dark UI; multilingual (pt-BR, en-US, es-ES) |

---

## 📋 Requirements

- **Python 3.10+**
- **Windows 10/11** tested (Linux/macOS may work with minor tweaks)

### Python dependencies

| Package | Min version | Purpose |
|---------|-------------|---------|
| pygame | 2.5.0 | Audio engine |
| Pillow | 10.0.0 | Image handling |
| mutagen | 1.47.0 | Audio metadata |
| websockets | 12.0 | Online beta (host/join) |
| pyinstaller | 6.0.0 | Optional: build executable |

Install them with `pip install -r requirements.txt`.

---

## 🚀 Installation

1. Clone the repository
	```bash
	git clone https://github.com/YOUR_USERNAME/DM-DungeonMusic.git
	cd DM-DungeonMusic
	```
2. Create a virtual environment (recommended)
	```bash
	python -m venv venv
	venv\Scripts\activate
	```
3. Install dependencies
	```bash
	pip install -r requirements.txt
	```
4. Run the app
	```bash
	python main.py
	```

---

## 📦 Build the executable (.exe)

Generate a standalone exe (no Python required):

```bash
build.bat
```

Output: `dist/DM-DungeonMusic.exe`.

---

## 🗂️ Project structure

```
DM-DungeonMusic/
├── main.py                 # Entry point
├── requirements.txt        # Dependencies
├── build.bat               # PyInstaller build script
├── src/
│   ├── audio_manager.py    # Audio engine (tracks, FX, cache)
│   ├── session_manager.py  # Image and audio session persistence
│   ├── network_manager.py  # WebSocket host/join (beta)
│   └── ui/
│       ├── main_window.py  # Main window with tabs
│       ├── audio_panel.py  # Music/SFX management
│       ├── image_panel.py  # Image sessions
│       ├── network_panel.py# Online tab UI (host/join)
│       ├── canvas_window.py# Presentation canvas
│       └── theme.py        # Dark theme
```

---

## 🎮 Usage

1) **Audio tab** — Add music, play/pause, loop, adjust volume/speed/reverb per track.
2) **SFX tab** — Same controls for short sound effects.
3) **Images tab** — Create sessions, add images, toggle which are visible.
4) **Presentation tab** — Interactive canvas for players (zoom, pan, z-order).
5) **Online tab (beta)** — Host starts a session (session ID + PIN). Players join with host/port/session/PIN; events are logged for now (wire to playback/map actions as next step).

Pro tip: share the Presentation tab via Discord/Zoom/OBS for remote tables.

---

## 🔊 Supported formats

.mp3 .wav .ogg .flac .opus .webm .m4a

---

## 📝 Local data

Stored under `~/.dm_dungeon_music/`:

- `tracks_music.json` — Music tracks
- `tracks_sfx.json` — Sound effects
- `cache/metadata.json` — Metadata cache (duration, artwork)
- `cache/artwork/` — Cached thumbnails

---

## 🤝 Contributing

1. Fork the repository
2. Create a branch (`git checkout -b feature/my-feature`)
3. Commit (`git commit -m "Add feature X"`)
4. Push (`git push origin feature/my-feature`)
5. Open a Pull Request

---

## 📄 License

MIT License. See LICENSE for details.
