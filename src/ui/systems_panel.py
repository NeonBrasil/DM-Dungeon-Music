"""
DM - Dungeon Music
Painel de Sistemas de RPG com secoes expansiveis.
Cobre D&D 5e, Tormenta20 e Warhammer 40.000 RPG.
"""

import tkinter as tk
from tkinter import ttk
import webbrowser

from src.ui.theme import COLORS


class _CollapsibleSection:
    """Secao expansivel/colapsavel."""

    def __init__(self, parent, title: str, expanded: bool = False):
        self._title = title
        self.expanded = expanded

        self.container = ttk.Frame(parent)
        self.container.pack(fill="x", pady=2)

        header = ttk.Frame(self.container)
        header.pack(fill="x")

        self._btn = ttk.Button(
            header,
            text=("v " if expanded else "> ") + title,
            command=self._toggle,
        )
        self._btn.pack(fill="x")

        self.content = ttk.Frame(self.container, padding=(15, 4, 4, 4))
        if expanded:
            self.content.pack(fill="x")

    def _toggle(self):
        self.expanded = not self.expanded
        if self.expanded:
            self.content.pack(fill="x")
            self._btn.config(text="v " + self._title)
        else:
            self.content.pack_forget()
            self._btn.config(text="> " + self._title)


class SystemsPanel(ttk.Frame):
    """Painel principal de Sistemas de RPG."""

    def __init__(self, parent, **kwargs):
        super().__init__(parent, **kwargs)
        self._build()

    # ------------------------------------------------------------------ #
    #  Layout base com scroll                                              #
    # ------------------------------------------------------------------ #

    def _build(self):
        canvas = tk.Canvas(self, bg=COLORS["bg"], highlightthickness=0)
        scrollbar = ttk.Scrollbar(self, orient="vertical", command=canvas.yview)

        self._scroll_frame = ttk.Frame(canvas)
        frame_id = canvas.create_window((0, 0), window=self._scroll_frame, anchor="nw")

        def _on_frame_configure(e):
            canvas.configure(scrollregion=canvas.bbox("all"))

        def _on_canvas_configure(e):
            canvas.itemconfig(frame_id, width=e.width)

        self._scroll_frame.bind("<Configure>", _on_frame_configure)
        canvas.bind("<Configure>", _on_canvas_configure)
        canvas.configure(yscrollcommand=scrollbar.set)

        # Mousewheel apenas quando o cursor esta sobre este canvas
        canvas.bind("<Enter>", lambda _e: canvas.bind_all(
            "<MouseWheel>",
            lambda e: canvas.yview_scroll(-1 * (e.delta // 120), "units")
        ))
        canvas.bind("<Leave>", lambda _e: canvas.unbind_all("<MouseWheel>"))

        scrollbar.pack(side="right", fill="y")
        canvas.pack(side="left", fill="both", expand=True)

        f = self._scroll_frame

        ttk.Label(f, text="Sistemas de RPG",
                  font=("Segoe UI", 18, "bold")).pack(pady=(20, 4))
        ttk.Label(f, text="Referencias, lore e regras para sua campanha",
                  foreground=COLORS["text_muted"],
                  font=("Segoe UI", 10)).pack(pady=(0, 14))

        self._build_dnd5e(f)
        self._build_tormenta20(f)
        self._build_warhammer40k(f)

        ttk.Separator(f, orient="horizontal").pack(fill="x", padx=20, pady=(20, 8))
        ttk.Label(f,
                  text="Novas funcionalidades estão a caminho. Fique ligado nas proximas atualizações!",
                  foreground=COLORS["text_muted"],
                  font=("Segoe UI", 9)).pack(pady=(0, 20))

    # ------------------------------------------------------------------ #
    #  Helpers                                                             #
    # ------------------------------------------------------------------ #

    def _link(self, parent, label: str, url: str):
        ttk.Button(
            parent, text=label,
            command=lambda: webbrowser.open(url),
            style="Accent.TButton"
        ).pack(fill="x", pady=2)

    def _info(self, parent, text: str):
        ttk.Label(
            parent, text=text,
            foreground=COLORS["text_muted"],
            font=("Segoe UI", 9),
            wraplength=700,
            justify="left"
        ).pack(anchor="w", pady=(2, 6))

    def _subtitle(self, parent, text: str):
        ttk.Label(parent, text=text,
                  font=("Segoe UI", 10, "bold")).pack(anchor="w", pady=(8, 2))

    # ------------------------------------------------------------------ #
    #  D&D 5e                                                              #
    # ------------------------------------------------------------------ #

    def _build_dnd5e(self, parent):
        card = ttk.LabelFrame(parent, text="  D&D 5a Edicao  ", padding=10)
        card.pack(fill="x", padx=20, pady=8)

        # Lore
        sec = _CollapsibleSection(card, "Lore e Ambientacao")
        self._info(sec.content,
            "D&D 5e se passa por padrao nos Forgotten Realms, um mundo de alta fantasia com magia, "
            "deuses ativos, imperios antigos e racas diversas. O continente de Faerun abriga cidades "
            "icônicas como Baldur's Gate, Waterdeep, Neverwinter e Candlekeep. O cenario foi criado "
            "por Ed Greenwood em 1967 e se tornou o mais popular de D&D. Outros cenarios oficiais "
            "incluem Eberron (fantasia industrial com magitech), Ravenloft (horror gotico), "
            "Spelljammer (viagem espacial magica) e Planescape (multiverso filosofico).")
        self._subtitle(sec.content, "Links de Lore:")
        self._link(sec.content, "Forgotten Realms Wiki (completa)", "https://forgottenrealms.fandom.com/wiki/Main_Page")
        self._link(sec.content, "D&D Fandom Wiki", "https://dnd-5e.fandom.com/wiki/D%26D_5e_Wiki")
        self._link(sec.content, "Planescape & Multiverso", "https://forgottenrealms.fandom.com/wiki/Cosmology")
        self._link(sec.content, "Eberron Wiki", "https://eberron.fandom.com/wiki/Eberron_Wiki")

        # Regras
        sec = _CollapsibleSection(card, "Regras e Mecanicas")
        self._info(sec.content,
            "D&D 5e usa d20 como dado principal. Testes de habilidade, jogadas de ataque e saves "
            "usam d20 + modificador vs CD (Classe de Dificuldade). O sistema de "
            "Vantagem/Desvantagem (rolar 2d20 e pegar o maior/menor) substitui modificadores "
            "situacionais. Combate e dividido em rodadas de 6 segundos com Acao, Acao Bonus "
            "e Reacao. Iniciativa determina a ordem. Ataques de Oportunidade ocorrem quando "
            "um inimigo sai do alcance. Condicoes (agarrado, atordoado, etc.) afetam o combate. "
            "Descanso Curto (1h) recupera Dados de Vida; Descanso Longo (8h) recupera tudo.")
        self._subtitle(sec.content, "Referencias de Regras:")
        self._link(sec.content, "D&D 5e SRD Completo (5thSRD)", "https://5thsrd.org")
        self._link(sec.content, "D&D 5e Wikidot (regras detalhadas)", "https://dnd5e.wikidot.com")
        self._link(sec.content, "Open5e - SRD Open Source", "https://open5e.com")
        self._link(sec.content, "Basic Rules (oficial, gratis)", "https://www.dndbeyond.com/sources/basic-rules")
        self._link(sec.content, "Regras de Combate detalhadas (Wikidot)", "https://dnd5e.wikidot.com/combat")

        # Classes e Racas
        sec = _CollapsibleSection(card, "Classes e Racas")
        self._info(sec.content,
            "13 classes principais: Barbaro (furia), Bardo (magia arcana + suporte), "
            "Clerico (magia divina), Druida (magia natural), Guerreiro (combate versatil), "
            "Monge (artes marciais), Paladino (guerreiro sagrado), Ranger (explorador), "
            "Ladino (furtividade), Feiticeiro (magia inata), Bruxo (pacto sobrenatural), "
            "Mago (estudo arcano) e Artificer (magia tecnologica). "
            "Cada classe tem subclasses a partir do nivel 3. "
            "Racas basicas: Humano, Elfo, Anao, Halfling, Draconato, Gnomo, Meio-Elfo, Meio-Orc e Tiefling.")
        self._link(sec.content, "D&D Beyond - Construtor de Personagem", "https://www.dndbeyond.com/characters/builder")
        self._link(sec.content, "Classes (Wikidot)", "https://dnd5e.wikidot.com/classes")
        self._link(sec.content, "Racas (Wikidot)", "https://dnd5e.wikidot.com/lineages")
        self._link(sec.content, "Subclasses (D&D Beyond)", "https://www.dndbeyond.com/subclasses")

        # Magias
        sec = _CollapsibleSection(card, "Magia e Feiticos")
        self._info(sec.content,
            "Magia em 5e usa slots de magia por nivel (1-9). Classes distintas conhecem ou "
            "preparam magias de formas diferentes: Magos estudam um grimorio e preparam por dia; "
            "Feiticeiros conhecem poucas magias mas tem Pontos de Feiticeria para metamagia; "
            "Bruxos tem poucos slots que recuperam no Descanso Curto. "
            "Magias de Ritual nao gastam slots. Magias de Concentracao exigem atencao continua. "
            "Cantrips (truques) sao de uso ilimitado e escalam com nivel.")
        self._link(sec.content, "Lista completa de feiticos (D&D Beyond)", "https://www.dndbeyond.com/spells")
        self._link(sec.content, "Feiticos por classe (Wikidot)", "https://dnd5e.wikidot.com/spells")
        self._link(sec.content, "Feiticos (Open5e)", "https://open5e.com/spells/spells")

        # Ferramentas
        sec = _CollapsibleSection(card, "Ferramentas, Mesas Virtuais e Comunidade")
        self._link(sec.content, "D&D Beyond (plataforma oficial)", "https://www.dndbeyond.com")
        self._link(sec.content, "Roll20 - Mesa Virtual", "https://roll20.net")
        self._link(sec.content, "Foundry VTT", "https://foundryvtt.com")
        self._link(sec.content, "Reddit r/DnD", "https://www.reddit.com/r/DnD/")
        self._link(sec.content, "Reddit r/dndnext (5e especifico)", "https://www.reddit.com/r/dndnext/")
        self._link(sec.content, "D&D subreddit PT-BR", "https://www.reddit.com/r/rpg_brasil/")

    # ------------------------------------------------------------------ #
    #  Tormenta20                                                          #
    # ------------------------------------------------------------------ #

    def _build_tormenta20(self, parent):
        card = ttk.LabelFrame(parent, text="  Tormenta20  ", padding=10)
        card.pack(fill="x", padx=20, pady=8)

        # Lore
        sec = _CollapsibleSection(card, "Lore e Ambientacao")
        self._info(sec.content,
            "Tormenta20 se passa em Arton, o 'Mundo de Tormenta'. Uma forca maligna chamada Tormenta "
            "(tempestade de energia caotica e purpura) ameaca consumir o mundo pelas bordas do mapa. "
            "Arton e um continente de fantasia medieval criado pelo brasileiro Marcelo Cassaro. "
            "Cidades importantes: Valkaria (capital imperial), Porto Maldicao (pirataria e intrigas), "
            "Norm (mercadores e neutralidade), Ahlen (academica), Bielefeld (religiao), "
            "Malpetrim (cidade dos aventureiros). "
            "O cenario mistura alta fantasia com humor brasileiro, drama intenso e referencias culturais unicas. "
            "A Tormenta e habitada por criaturas corrompidas chamadas Lefou e governada por um Tio do Caos.")
        self._link(sec.content, "Wiki Tormenta (Fandom PT)", "https://tormenta.fandom.com/pt/wiki/")
        self._link(sec.content, "Jamboe Editora (editora oficial)", "https://www.jamboeditora.com.br")
        self._link(sec.content, "Mapa de Arton (Wiki)", "https://tormenta.fandom.com/pt/wiki/Arton")
        self._link(sec.content, "Historia de Arton (Wiki)", "https://tormenta.fandom.com/pt/wiki/Historia_de_Arton")

        # Regras
        sec = _CollapsibleSection(card, "Regras e Mecanicas")
        self._info(sec.content,
            "Tormenta20 usa d20 como base, com diferencas do D&D 5e: "
            "usa Pontos de Magia (PM) no lugar de slots de magia - cada magia tem um custo em PM. "
            "Atributos sao os mesmos 6 do D&D (FOR, DES, CON, INT, SAB, CAR). "
            "3 defesas: Defesa (CA), Fortitude (resistencia fisica) e Vontade (resistencia mental). "
            "Testes: d20 + atributo + ranques de pericia vs CD. "
            "Poderes substituem feats - existem centenas divididos por tipo (combate, magia, etc). "
            "Sistema de Origem define background e da beneficios mecanicos e de roleplay. "
            "Pontos de Experiencia tradicionais; nivel maximo 20.")
        self._link(sec.content, "Regras no Tormenta Wiki", "https://tormenta.fandom.com/pt/wiki/Tormenta20")
        self._link(sec.content, "SRD Tormenta20 (conteudo livre oficial)", "https://t20.jamboeditora.com.br/srd/")
        self._link(sec.content, "Regras de Combate (Wiki)", "https://tormenta.fandom.com/pt/wiki/Combate_(T20)")

        # Classes
        sec = _CollapsibleSection(card, "Classes")
        self._info(sec.content,
            "15 classes base em Tormenta20: "
            "Arcanista (mago generalista), Barbaro (furia), Bardo (versatil e social), "
            "Bucaneiro (combatente agil e pirata), Cacador (explorador e rastreador), "
            "Cavaleiro (guerreiro montado e lider), Clerigo (devoto divino), "
            "Druida (natureza), Guerreiro (combatente puro), Inventor (criacao de itens magicos), "
            "Ladino (furtividade e esperteza), Lutador (artes marciais), "
            "Nobre (social e lideranca), Paladino (guerreiro sagrado) e outros. "
            "Cada classe tem multiplos caminhos de desenvolvimento via escolha de poderes.")
        self._link(sec.content, "Todas as Classes (Wiki)", "https://tormenta.fandom.com/pt/wiki/Categoria:Classes_(T20)")
        self._link(sec.content, "Construtor de personagem T20 (Fichas.app)", "https://fichas.app")

        # Racas
        sec = _CollapsibleSection(card, "Racas de Arton")
        self._info(sec.content,
            "Racas unicas de Arton alem das classicas (Humano, Elfo, Anao):\n"
            "- Dahllan: filhos das plantas, se tornam arvores ao morrer\n"
            "- Lefou: humanoides corrompidos pela Tormenta, estigmatizados\n"
            "- Minotauro: meio-humano, meio-touro; honrado e forte\n"
            "- Osteon: mortos-vivos conscientes em busca de redenção\n"
            "- Qareen: genios do desejo, metade humano metade genio\n"
            "- Sereia/Tritao: seres aquaticos com cantos magicos\n"
            "- Goblin: inteligentes e tecnologicos em Arton\n"
            "- Sílfide: seres aereos etéreos")
        self._link(sec.content, "Racas (Wiki Tormenta)", "https://tormenta.fandom.com/pt/wiki/Categoria:Ra%C3%A7as_(T20)")

        # Deuses
        sec = _CollapsibleSection(card, "Deuses e Religiao")
        self._info(sec.content,
            "O panteao de Arton e rico e ativo - os deuses interferem diretamente no mundo:\n"
            "- Azgher: deus do Sol, luz e fogo\n"
            "- Khalmyr: deus da lei, justica e protecao\n"
            "- Megalokk: deus dos monstros e forca brutal\n"
            "- Nimb: deus do acaso, loucura e imprevisibilidade\n"
            "- Sszzaas: deus dos repteis, traicao e veneno\n"
            "- Tanna-Toh: deusa do conhecimento, magia e biblioteca\n"
            "- Valkaria: deusa guerreira e padroeira do imperio\n"
            "- Hyninn: deus dos ladinos, liberdade e astúcia\n"
            "- Thyatis: deusa da morte e destino\n"
            "Clerigos dedicados ganham poderes baseados no dominio do seu deus.")
        self._link(sec.content, "Panteao de Arton (Wiki)", "https://tormenta.fandom.com/pt/wiki/Deuses_de_Arton")

        # Comunidade
        sec = _CollapsibleSection(card, "Comunidade e Ferramentas")
        self._link(sec.content, "Tormenta no Reddit (PT)", "https://www.reddit.com/r/Tormenta/")
        self._link(sec.content, "RPG Brasil Reddit (comunidade geral)", "https://www.reddit.com/r/rpg_brasil/")
        self._link(sec.content, "Loja Jamboe - livros digitais T20", "https://www.jamboeditora.com.br/categoria/tormenta20/")
        self._link(sec.content, "Roll20 PT-BR", "https://roll20.net")

    # ------------------------------------------------------------------ #
    #  Warhammer 40k RPG                                                   #
    # ------------------------------------------------------------------ #

    def _build_warhammer40k(self, parent):
        card = ttk.LabelFrame(parent, text="  Warhammer 40.000 RPG  ", padding=10)
        card.pack(fill="x", padx=20, pady=8)

        # Lore universo
        sec = _CollapsibleSection(card, "Lore e Universo 40k")
        self._info(sec.content,
            "O universo de Warhammer 40.000 se passa no ano 40.999 em uma galaxia em guerra permanente. "
            "O Imperium da Humanidade governa milhoes de planetas sob a tutela do Imperador Eterno, "
            "preso ao Trono de Ouro ha 10.000 anos apos a Heresia de Horus, sustentando o "
            "Astronomican (farol psiquico para navegacao entre as estrelas). "
            "A galaxia e dividida pela Cicatriz de Noctis (fenda no Immaterium). "
            "A humanidade e ameacada por: Caos (demonios e guerreiros corrompidos), "
            "Orks (fungo belicoso), Eldar (elfos espaciais decadentes), "
            "Tiranideos (enxame devorador galactico), Necrons (mortos-vivos de metal antigos) e T'au. "
            "Frase classica: 'In the grim darkness of the far future, there is only war.'")
        self._link(sec.content, "Warhammer 40k Wiki (Fandom)", "https://warhammer40k.fandom.com/wiki/Warhammer_40k_Wiki")
        self._link(sec.content, "Lexicanum - Enciclopedia 40k", "https://wh40k.lexicanum.com/wiki/Main_Page")
        self._link(sec.content, "Warhammer Community (oficial)", "https://www.warhammer-community.com")
        self._link(sec.content, "Reddit r/Warhammer40k", "https://www.reddit.com/r/Warhammer40k/")

        # Horus Heresy
        sec = _CollapsibleSection(card, "Horus Heresy - A Grande Traicao (M30-31)")
        self._info(sec.content,
            "A Horus Heresy e o evento mais catastrofico da historia do Imperium, ocorrido 10.000 anos "
            "antes do presente do jogo. Horus Lupercal, o Primarca mais amado do Imperador e "
            "Comandante Supremo das Legioes, foi corrompido pelo Caos durante a campanha em Davin. "
            "Ele convenceu metade das 18 Legioes Espaciais a se voltarem contra o Imperador, "
            "incluindo: Sons of Horus, Word Bearers, Night Lords, Iron Warriors, Alpha Legion, "
            "Thousand Sons, Death Guard, World Eaters e Emperor's Children. "
            "O conflito culminou no Assedio de Terra: Horus foi morto pelo proprio Imperador, "
            "que ficou mortalmente ferido e foi colocado no Trono de Ouro. "
            "Os traidores fugiram para o Eye of Terror, onde se tornaram os Guerreiros do Caos atuais. "
            "Os Primarcas leais (como Roboute Guilliman e Sanguinius, morto por Horus) sao venerados como santos.")
        self._link(sec.content, "Horus Heresy - Wiki completa", "https://warhammer40k.fandom.com/wiki/Horus_Heresy")
        self._link(sec.content, "Lexicanum - Horus Heresy", "https://wh40k.lexicanum.com/wiki/Horus_Heresy")
        self._link(sec.content, "Primarcas - Wiki", "https://warhammer40k.fandom.com/wiki/Primarchs")
        self._link(sec.content, "Assedio de Terra - Wiki", "https://warhammer40k.fandom.com/wiki/Siege_of_Terra")

        # RPGs do universo
        sec = _CollapsibleSection(card, "Os RPGs do Universo 40k")
        self._info(sec.content,
            "Existem varios RPGs oficiais ambientados no universo 40k, todos jogaveis online sem miniaturas:\n\n"
            "WRATH & GLORY (atual, Cubicle 7):\n"
            "O mais recente e acessivel. Permite jogar como multiplos tipos de personagem "
            "(humanos, Space Marines, Eldar) na mesma campanha. Sistema de pool de d6.\n\n"
            "DARK HERESY 2e (Fantasy Flight Games, legado):\n"
            "Jogadores sao Acólitos da Inquisicao investigando heresia, caos e ameacas ao Imperium. "
            "Estilo investigativo e de horror. Considerado o RPG 40k mais popular.\n\n"
            "ROGUE TRADER (FFG, legado):\n"
            "Jogadores sao comerciantes imperiais com carta-patente para explorar o espaco selvagem "
            "alem das fronteiras do Imperium. Foco em exploracao e comercio.\n\n"
            "DEATHWATCH (FFG, legado):\n"
            "Jogadores sao Space Marines de elite de diferentes Chapters trabalhando juntos "
            "contra ameacas xenos. Combate pesado e intenso.\n\n"
            "BLACK CRUSADE (FFG, legado):\n"
            "Jogadores sao Renegados e Guerreiros do Caos servindo aos Deuses do Caos. "
            "Perspectiva dos 'viloes'. Unico e controverso.\n\n"
            "ONLY WAR (FFG, legado):\n"
            "Soldados comuns do Astra Militarum (Guarda Imperial) em campanhas de guerra em massa.")
        self._link(sec.content, "Wrath & Glory - Cubicle 7 (atual)", "https://www.cubicle7games.com/product-category/warhammer-40000-roleplay/")
        self._link(sec.content, "Dark Heresy 2e - Fantasy Flight (legado)", "https://www.fantasyflightgames.com/en/products/dark-heresy-second-edition/")
        self._link(sec.content, "Reddit r/40krpg (comunidade de RPG 40k)", "https://www.reddit.com/r/40krpg/")
        self._link(sec.content, "Dark Heresy Wiki", "https://dark-heresy.fandom.com/wiki/Dark_Heresy_Wiki")
        self._link(sec.content, "Todos os RPGs 40k FFG (legado)", "https://www.fantasyflightgames.com/en/products/#/universe/12/")

        # Sistema de regras
        sec = _CollapsibleSection(card, "Sistema de Regras - Wrath & Glory e Dark Heresy")
        self._info(sec.content,
            "WRATH & GLORY - Pool de d6:\n"
            "Cada acao usa um numero de d6 igual ao Atributo + Habilidade relevante. "
            "Resultado 4-5 = 1 sucesso (icone); resultado 6 = 2 sucessos (icone exaltado). "
            "O 'Dado da Gloria' (cor diferente) pode gerar Wrath (complicacoes narrativas) "
            "ou Exaltation (bônus extras) se tirar 6. "
            "Personagens tem Wounds (ferimentos fisicos) e Shock (trauma mental/psiquico). "
            "Sistema de Corruption rastreia contaminacao pelo Caos.\n\n"
            "DARK HERESY / FFG - Percentil (d100):\n"
            "Sistema baseado em porcentagem: cada Habilidade tem um valor de 1-100. "
            "Para ter sucesso, o jogador rola d100 abaixo do valor da habilidade. "
            "Graus de Sucesso/Falha determinam o quao bem foi a acao. "
            "Combate e mortal: ferimentos podem ser permanentes. "
            "Sistema de Corrucao e Insanidade rastreiam a degradacao mental e espiritual. "
            "Pontos de Destino permitem evitar mortes certas.")
        self._link(sec.content, "Regras Wrath & Glory (PDF Cubicle 7)", "https://www.cubicle7games.com/product-category/warhammer-40000-roleplay/")
        self._link(sec.content, "Dark Heresy 2e - Regras e Errata (FFG)", "https://www.fantasyflightgames.com/en/products/dark-heresy-second-edition/")

        # Faccoes
        sec = _CollapsibleSection(card, "Principais Faccoes do Universo")
        self._info(sec.content,
            "IMPERIUM DA HUMANIDADE:\n"
            "- Adeptus Astartes (Space Marines): super-soldados geneticamente modificados em Chapters\n"
            "- Astra Militarum: Guarda Imperial, bilhoes de soldados humanos comuns\n"
            "- Inquisicao: agentes secretos cacando heresia, mutacao e influencia do Caos\n"
            "- Adeptus Mechanicus: sacerdotes-tecnologos adoradores do Omnissiah/Imperador\n"
            "- Adepta Sororitas: Irmas de Batalha, guerreiras fanaticamente devotas\n\n"
            "FORCAS DO CAOS:\n"
            "- Legions Traidoras: Space Marines corrompidos pela Heresia de Horus\n"
            "- Exercitos dos 4 Deuses: Khorne (sangue/guerra), Tzeentch (mudanca/magia), "
            "Nurgle (decadencia/doenca), Slaanesh (excesso/prazer)\n\n"
            "XENOS (especies alienígenas):\n"
            "- Orks: fungo belicoso e caótico, existem apenas para lutar\n"
            "- Eldar: elfos espaciais com tecnologia ancestra e habilidades psiquicas\n"
            "- Tiranideos: enxame extragalactico que devora planetas inteiros\n"
            "- Necrons: mortos-vivos de metal que dormiam por 60 milhoes de anos\n"
            "- T'au: especie jovem e tecnologica; pregam o 'Bem Maior'")
        self._link(sec.content, "Todas as Faccoes (Wiki)", "https://warhammer40k.fandom.com/wiki/Factions")
        self._link(sec.content, "Space Marines - Wiki", "https://warhammer40k.fandom.com/wiki/Space_Marines")
        self._link(sec.content, "Caos - Wiki", "https://warhammer40k.fandom.com/wiki/Chaos")
        self._link(sec.content, "Inquisicao - Wiki", "https://warhammer40k.fandom.com/wiki/Inquisition")

        # Comunidade
        sec = _CollapsibleSection(card, "Comunidade e Recursos Online")
        self._link(sec.content, "Reddit r/40krpg (RPG online 40k)", "https://www.reddit.com/r/40krpg/")
        self._link(sec.content, "Reddit r/Warhammer40k", "https://www.reddit.com/r/Warhammer40k/")
        self._link(sec.content, "Reddit r/HorusHeresy", "https://www.reddit.com/r/HorusHeresy/")
        self._link(sec.content, "Roll20 - Wrath & Glory compendium", "https://roll20.net/compendium/wrath-and-glory/")
        self._link(sec.content, "Warhammer Community (noticias e lore)", "https://www.warhammer-community.com/warhammer-40000/")
