# DM Mesa — mesa virtual do DM - Dungeon Music

Mesa virtual no estilo Roll20/HubRPG, com geradores de mapa no estilo Watabou. Roda no PC do mestre; os jogadores entram pelo navegador, sem instalar nada.

## Como abrir

1. Instale o [Node.js](https://nodejs.org) (versão 22 ou mais nova).
2. Dê dois cliques em `start.bat`.
   - Na primeira vez ele instala as dependências (precisa de internet).
   - O navegador abre como **mestre**. O link de mestre também aparece na janela preta. Não feche essa janela durante a sessão.
3. Crie uma campanha e clique em **Abrir mesa**.

Na primeira vez, o Windows pode pedir permissão de rede para o Node: aceite em **redes privadas** para quem está na mesma rede/VPN conseguir entrar.

## Como os jogadores entram

Botão **Convidar** (dentro da mesa) ou o campo de convite no card da campanha:

- **Pela internet:** clique em *Gerar link público*. Isso abre um túnel grátis da Cloudflare (sem conta) e cria um endereço `https://….trycloudflare.com`. Na primeira vez ele baixa o `cloudflared` oficial (~60 MB). O endereço muda toda vez que você liga.
- **Mesma rede ou VPN (Radmin, Hamachi, ZeroTier):** use um dos links de rede.

O jogador abre o link, digita o nome e escolhe uma cor. Se alguém entrar com um nome que já existe, volta como aquele jogador (pensado para mesa entre amigos).

## O que tem

| Área | Recursos |
|------|----------|
| Mesa | Páginas, grade, zoom, tokens arrastáveis com encaixe, camadas **Mapa / Tokens / Mestre**, régua compartilhada, ping (segure o clique; Shift+segurar puxa a visão de todos), iniciativa com destaque do token da vez. **Desfazer/refazer**, seleção em área (Shift+arrastar), copiar, colar e duplicar |
| Névoa | Pincel, retângulo ou **sala por clique** (mapas gerados); jogadores veem preto, o mestre vê translúcido |
| Iluminação | Paredes e portas (trancada, secreta, grade), visão e luz por token (tocha, lanterna…), visão no escuro, áreas já exploradas em penumbra. O jogador só vê o que o token dele enxerga e não atravessa parede. Masmorras e cavernas geradas já vêm com paredes e portas |
| Desenho e áreas | Traço livre, linha, retângulo, elipse e texto. Moldes de magia (círculo, cone, linha, quadrado) marcam as células atingidas. Jogadores também desenham |
| Tokens | Condições com ícone (as do SRD e extras como concentração e sangrando), auras, luz, visão, e **vida própria** para vários monstros da mesma ficha |
| Chat e dados | `/r 2d20kh1+5 Ataque`, `/gr` (secreto), `/w Nome msg`, `/me`, `/desc` (mestre), `[[1d8+3]]` no meio do texto, bandeja de dados. Quem rola é o servidor. **Dados 3D** na tela (caixa "3D" no chat liga/desliga) |
| Macros | Barra de macros (do mestre e de cada jogador), perguntas `?{Bônus\|0\|2\|5}`, valores de ficha `@{Thorin\|athletics}` e `&{tracker}` para mandar o resultado para a iniciativa |
| Fichas | Ficha livre, **D&D 5e** (personagem e monstro), **SW5e**, **Call of Cthulhu 7e** (com dados de bônus/penalidade), **Ordem Paranormal** e **Tormenta20**, e modelos próprios no editor. Clique para rolar, vantagem/desvantagem e rolagem secreta. Exporta e importa ficha ou modelo (`.json`) |
| Textos | Notas e imagens para todos, só para alguns jogadores ou só para o mestre |
| Compêndio | 334 monstros e 319 magias do SRD de D&D 5e. Arraste um monstro para a mesa e ele vira token com ficha. Magias rolam o dano e entram na ficha |
| Cartas | Baralho comum (54), tarô (22) ou personalizado (cartas de texto ou imagens, verso próprio). Comprar, dar para um jogador, jogar na mesa aberta ou virada, mostrar no chat, descartar e recolher. O monte e a mão dos outros ficam escondidos |
| Clima e cena | Chuva, tempestade, neve, névoa, brasas, cinzas, folhas e areia por página. Cada página pode ter a sua trilha, que toca quando você leva os jogadores para lá |
| Geradores | **Masmorra** (One Page Dungeon), **Caverna**, **Cidade/Vila** (Medieval Fantasy City) e **Região** (Perilous Shores). Semente, estilos, exportar PNG ou **Enviar para a mesa**. **Mundo interligado**: povoados, ruínas e cavernas da região, e castelo, catedral e esgotos da cidade abrem o gerador naquele lugar |
| Música | Músicas e efeitos sincronizados para todos, com volume próprio de cada jogador. Importa a biblioteca do DM Dungeon Music |
| Backup | Backup da campanha inteira em `.zip` e importação. Cópias automáticas ao abrir a mesa e de hora em hora (ficam as últimas 24), com botão de restaurar |
| Celular | Layout próprio: ferramentas embaixo, painel lateral recolhível, fichas em tela cheia, pinça para zoom e toque duplo |

### Enviar mapa para a mesa

O botão cria uma página nova com o mapa na camada do mapa. Números das salas, armadilhas (`!`) e portas secretas (`S`) vão para a **camada do mestre**. A descrição da masmorra vira um **texto** só seu, no diário. A névoa já começa cobrindo tudo, com a ferramenta *Sala* pronta para revelar.

### Fichas e tokens

Arraste uma ficha do diário para o tabuleiro para criar o token dela. A barra de vida do token fica ligada ao campo `hp` da ficha, nos dois sentidos.

### Mundo interligado

Gere uma **região** e mande para a mesa. Cada povoado, ruína e caverna ganha um marcador dourado na camada do mestre. Dê dois cliques no marcador para abrir o gerador naquele lugar, com o mesmo nome. Na cidade, o castelo, a catedral e o mercado (esgotos) abrem a masmorra de cada um. O caminho (região › cidade › masmorra) aparece no topo do gerador para voltar. Depois que o lugar vai para a mesa, o marcador passa a levar direto à página dele.

### Iluminação

Masmorras e cavernas geradas trazem paredes e portas: marque *Iluminação dinâmica* antes de enviar, ou ligue depois na ferramenta **Paredes** (`W`), onde também dá para desenhar paredes e portas à mão. Arrastar a ficha de um jogador para a mesa já cria o token com visão. Dê luz ao token no painel dele, ou use *Tocha para os jogadores*.

### Atalhos

`V` selecionar · `R` régua · `D` desenhar · `T` áreas de magia · `F` névoa (mestre) · `W` paredes (mestre) · setas movem o token · `Delete` apaga · `Ctrl+Z` / `Ctrl+Y` desfaz e refaz · `Ctrl+C` / `Ctrl+V` / `Ctrl+D` copia, cola e duplica · `Ctrl+A` seleciona a camada (mestre) · `Shift`+arrastar seleciona em área · `Alt` ao soltar desliga o encaixe na grade · botão direito arrasta a visão ou abre o menu do token.

## Dados

Tudo fica em `~/.dm_dungeon_music/mesa/`: o `config.json` com a chave do mestre e a porta, e uma pasta por campanha em `campaigns/<id>/` (`campaign.json` + arquivos enviados + `snapshots/` com as cópias automáticas). Campanhas excluídas vão para `campaigns/_lixeira_…`.

No saguão, **Backup (.zip)** baixa a campanha inteira (fichas, mapas, imagens e músicas) e **Importar backup** cria uma campanha nova a partir dele, em outro PC por exemplo. **Cópias automáticas** volta a campanha para um momento anterior. O estado atual também vira cópia, então dá para desfazer.

## Créditos

Monstros e magias do compêndio: *System Reference Document 5.1*, da Wizards of the Coast, sob a licença [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/), via [5e-bits/5e-database](https://github.com/5e-bits/5e-database). Os textos estão em inglês. Os geradores foram inspirados nos de [watabou](https://watabou.github.io), mas o código é próprio.

## Desenvolvimento

```bash
npm install
npm test           # testes (dados, permissões, fichas, visão, backup)
npm run typecheck
npm run build      # gera dist/
npm start          # servidor na porta 7777 (PORT=... para trocar)
node scripts/build-srd.ts   # refaz client/data/srd-*.json a partir do SRD (já vêm prontos; precisa de internet)
```

O servidor é Node + TypeScript direto (sem compilar), em `server/`. A interface é React + Canvas em `client/`, e o código compartilhado (tipos, dados, protocolo) fica em `shared/`.
