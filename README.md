# ⚔️ DM - Dungeon Music: DM Mesa

A virtual tabletop that runs in the browser, in the spirit of Roll20, with map generators inspired by Watabou. The Game Master (GM) runs it on their own PC. Players join from any browser, on PC or phone. **Nothing to install for players, no account, no paid hosting.**

The project lives in [`vtt/`](vtt/). The detailed guide (in Portuguese) is in [vtt/README.md](vtt/README.md). The interface is in Brazilian Portuguese.

> The old Python desktop app was removed in 3.0. Its last version is the `v2.0.0` release.

## Features

- **Table:** pages, grid, zoom, map / token / GM-only layers, shared ruler, pings, undo/redo, copy/paste, area selection.
- **Fog of war:** brush, rectangle, or reveal a whole room with one click on generated maps.
- **Dynamic lighting:** walls, doors (locked, secret, portcullis), token vision and light, darkvision, explored areas. Players see only what their tokens see.
- **Drawing and spell templates:** free draw, shapes, text, and circle, cone, line and square templates.
- **Tokens:** conditions, auras, light, vision, health bars, and independent HP for many monsters from one sheet.
- **Chat and dice:** `/r 2d20kh1+5`, secret rolls, whispers, emotes, inline rolls, quick dice with **+/- modifiers**, and 3D dice. Every roll happens on the server.
- **Macros:** per-player macro bar, prompts `?{Bonus|0|2|5}`, and sheet values `@{Name|field}`.
- **Character sheets:** D&D 5e, Star Wars 5e (SW5e), Call of Cthulhu 7e, Ordem Paranormal, Tormenta20, a free-form sheet, and your own templates in the editor. Click a field to roll. Advantage/disadvantage. Import and export as `.json`.
- **GM compendium:**
  - **D&D 5e** (from the SRD): 334 monsters and 578 items.
  - **Star Wars, Republic era / Clone Wars:** 61 creatures (droids, clones, Jedi, Nightsisters, Sith, bounty hunters, Mandalorians, beasts) and 76 items (blasters, lightsabers, armor, explosives, gear).
  - Drag a monster onto the map to get a token with its sheet. Give an item to a character in one click.
  - **The bestiary and items are visible to the GM only**, and the server enforces it. The 319 D&D spells are visible to everyone.
- **Map generators:** dungeon, cave, city/village and region. Choose a seed and style, export a PNG, or send the map straight to the table with fog, walls and doors already set up.
- **Linked world:** places on a region or city map open their own map in the generator. You can also add places by hand: right-click → *Adicionar local aqui*, then link the place to a new map or to an existing page.
- **Handouts:** text and images, shared with everyone, with chosen players, or with nobody.
- **Cards:** standard deck, tarot, or custom decks with your own images.
- **Atmosphere:** weather effects per page, and a music track for each scene.
- **Music:** music and sound effects in sync for everyone. Each player has their own volume.
- **Backup:** full campaign export and import as `.zip`, plus hourly automatic snapshots you can restore.
- **Mobile:** a layout for phones, with pinch to zoom.

## For the Game Master

### Requirements
- Windows. On Linux or macOS, see the manual steps below.
- [Node.js](https://nodejs.org) **22.18 or newer**. The LTS version works.

### Run it
1. Download the latest [release](../../releases) (**Source code (zip)**) and extract it.
2. Open the `vtt` folder and double-click **`start.bat`**.
   - The first run installs dependencies and takes a few minutes.
   - The table opens in your browser, already logged in as GM. Keep the black window open during the session.
3. Create a campaign and open it.

The first time, Windows may ask for network permission for Node. Allow it on **private networks** so players on your network or VPN can join.

**Linux / macOS:**

```bash
cd vtt
npm install
npm run build
npm start
```

Then open the GM link printed in the terminal, `http://localhost:7777/?gm=...`.

### Invite players
Click **Convidar** (Invite) inside the table:
- **Over the internet:** click *Gerar link público* (Generate public link). This opens a free Cloudflare tunnel (no account needed) and gives you an `https://….trycloudflare.com` link. **The link changes every time you turn it on**, so send a new one each session.
- **Same network or VPN** (Wi-Fi, Radmin, Hamachi, ZeroTier): use one of the network links.

Your PC is the server. Keep the table running while you play.

### Tips
- Drag a player's sheet onto the map to create their token, with vision already on.
- If players only see darkness, either turn off *Iluminação dinâmica* (dynamic lighting) on that page, or give each player a token they control that has vision. The **Tocha para os jogadores** (torch for players) button does it for everyone at once.
- To make the page bigger, go to the **Página e campanha** (page settings) tab and change **Colunas / Linhas** (columns and rows), up to 300 × 300 cells.
- All data is stored in `~/.dm_dungeon_music/mesa/`. Use **Backup (.zip)** to move a campaign to another PC.

## For players

1. Open the link your GM sent you, in any browser, on PC or phone.
2. Type your name and pick a color.
   - To come back later, type the same name and you return as the same player.
3. Create your character in **Fichas** (sheets) → **Nova ficha** (new sheet). Click the square to choose your character's image.

What you can do:
- Move your own token. Change its image: select the token, then click **Trocar imagem** (change image).
- Roll from your sheet or the dice tray. Use **-2 -1 +1 +2** to add a modifier. Make secret rolls and whisper with `/w Name message`.
- Draw, measure distances, and place spell templates.
- Read the handouts the GM shares with you.
- Set your own music volume.
- Turn the 3D dice on or off.

## Credits
- D&D monsters, items and spells come from the *System Reference Document 5.1* by Wizards of the Coast, licensed [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/), via [5e-bits/5e-database](https://github.com/5e-bits/5e-database).
- The Star Wars content was written for this project in SW5e style. It is unofficial and fan-made, and Star Wars belongs to Lucasfilm.
- The generators are inspired by [watabou](https://watabou.github.io). The code is original.

## 📄 License

MIT License.
