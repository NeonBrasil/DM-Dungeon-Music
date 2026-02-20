# ⚔️ DM - Dungeon Music

Ferramenta de mesa para **Mestres de RPG** (Dungeon Masters). Gerencie músicas, efeitos sonoros, imagens e apresentações — tudo em um só lugar.

![Python](https://img.shields.io/badge/Python-3.10%2B-blue?logo=python&logoColor=white)
![Pygame](https://img.shields.io/badge/Pygame-2.5%2B-green)
![License](https://img.shields.io/badge/License-MIT-yellow)

---

## 🎯 Funcionalidades

| Recurso | Descrição |
|---------|-----------|
| 🎵 **Player Multi-Faixa** | Reproduza múltiplas músicas simultaneamente com controle individual |
| 💥 **Efeitos Sonoros** | Aba dedicada para SFX (espadas, explosões, ambientes...) |
| 🖼️ **Gerenciamento de Imagens** | Organize imagens por sessão de jogo |
| 🎭 **Apresentação (Canvas)** | Tela de apresentação com zoom, pan, z-order e partículas |
| 🎛️ **Efeitos de Áudio** | Controle de velocidade e reverb por faixa |
| 🔁 **Loop & Timeline** | Seek/loop individual com timeline visual |
| 💾 **Persistência** | Faixas e sessões salvas automaticamente entre usos |
| ⚡ **Cache de Metadados** | Startup instantâneo após o primeiro uso |
| ⚙️ **Sistemas de RPG** | Links para wikis de D&D 5e e sistema próprio (em breve) |
| 🌙 **Dark Mode** | Tema escuro moderno |

---

## 📋 Requisitos

- **Python 3.10** ou superior
- **Windows 10/11** (testado; pode funcionar em Linux/macOS com ajustes)

### Dependências Python

| Pacote | Versão Mínima | Uso |
|--------|---------------|-----|
| `pygame` | 2.5.0 | Motor de áudio |
| `Pillow` | 10.0.0 | Manipulação de imagens |
| `mutagen` | 1.47.0 | Leitura de metadados de áudio |
| `pyinstaller` | 6.0.0 | Geração do executável (opcional) |

---

## 🚀 Instalação

### 1. Clone o repositório

```bash
git clone https://github.com/SEU_USUARIO/DM-DungeonMusic.git
cd DM-DungeonMusic
```

### 2. Crie um ambiente virtual (recomendado)

```bash
python -m venv venv
venv\Scripts\activate
```

### 3. Instale as dependências

```bash
pip install -r requirements.txt
```

### 4. Execute o app

```bash
python main.py
```

---

## 📦 Gerar Executável (.exe)

Para criar um `.exe` standalone que não precisa de Python instalado:

```bash
build.bat
```

O executável será gerado em `dist/DM-DungeonMusic.exe`.

---

## 🗂️ Estrutura do Projeto

```
DM-DungeonMusic/
├── main.py                  # Entry point
├── requirements.txt         # Dependências
├── build.bat                # Script de build (PyInstaller)
├── DM-dungeoun-music.ico    # Ícone do app
├── DM-dungeoun-music.png    # Ícone (PNG)
├── src/
│   ├── __init__.py
│   ├── audio_manager.py     # Motor de áudio (tracks, efeitos, cache)
│   ├── session_manager.py   # Persistência de sessões e imagens
│   └── ui/
│       ├── __init__.py
│       ├── main_window.py   # Janela principal com abas
│       ├── audio_panel.py   # Painel de música e SFX
│       ├── image_panel.py   # Gerenciamento de imagens
│       ├── canvas_window.py # Canvas de apresentação
│       └── theme.py         # Tema dark mode
```

---

## 🎮 Como Usar

1. **Aba Áudio** — Clique em "➕ Adicionar Música" e selecione seus arquivos de áudio. Controle play/pause, volume, loop e timeline individualmente.

2. **Aba SFX** — Mesma mecânica, mas para efeitos sonoros curtos (espadas, portas, explosões).

3. **Aba Imagens** — Crie sessões e adicione imagens. Marque quais ficam visíveis na apresentação.

4. **Aba Apresentação** — Canvas interativo para seus jogadores. Arraste imagens, use zoom (scroll), pan (botão direito) e ajuste z-order.

5. **Aba Sistemas** — Links rápidos para wikis de D&D 5e e criação de sistema próprio (em desenvolvimento).

> 💡 **Dica:** Compartilhe a janela de Apresentação via Discord, Zoom ou OBS para seus jogadores verem!

---

## 🔊 Formatos Suportados

`.mp3` `.wav` `.ogg` `.flac` `.opus` `.webm` `.m4a`

---

## 📝 Dados Locais

O app salva dados em `~/.dm_dungeon_music/`:

- `tracks_music.json` — Lista de faixas de música
- `tracks_sfx.json` — Lista de efeitos sonoros
- `cache/metadata.json` — Cache de metadados (duração, artwork)
- `cache/artwork/` — Thumbnails em cache

---

## 🤝 Contribuição

1. Fork o repositório
2. Crie uma branch (`git checkout -b feature/minha-feature`)
3. Commit suas mudanças (`git commit -m 'Adiciona feature X'`)
4. Push para a branch (`git push origin feature/minha-feature`)
5. Abra um Pull Request

---

## 📄 Licença

Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.
