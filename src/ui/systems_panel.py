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
        self._build_never_going_home(f)
        self._build_apocalypse_world(f)
        self._build_vampire(f)
        self._build_deadlands(f)
        self._build_blades(f)

        ttk.Separator(f, orient="horizontal").pack(fill="x", padx=20, pady=(20, 8))
        ttk.Label(f,
                  text="Novos sistemas serão adicionados em futuras atualizações!",
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

    # ------------------------------------------------------------------ #
    #  Never Going Home                                                    #
    # ------------------------------------------------------------------ #

    def _build_never_going_home(self, parent):
        card = ttk.LabelFrame(parent, text="  Never Going Home  ", padding=10)
        card.pack(fill="x", padx=20, pady=8)

        sec = _CollapsibleSection(card, "Lore e Ambientacao")
        self._info(sec.content,
            "Never Going Home e um RPG indie de horror sobrenatural ambientado na Primeira Guerra Mundial "
            "(1914-1918). Os personagens sao soldados consumidos pela guerra e pelo Alem — entidades "
            "sobrenaturais que habitam as trincheiras devastadas da Franca e da Belgica. "
            "Ao contrario de outros jogos, aqui a morte e o fracasso sao esperados. "
            "A questao nao e se os personagens vao sobreviver, mas o que os tornara em monstros antes disso."
        )
        self._info(sec.content,
            "Principais temas: desumanizacao pela guerra, trauma, perda de identidade, horror cosmico "
            "em escala humana. O jogo usa o horror pessoal e nao o combate heroico como motor narrativo."
        )

        sec = _CollapsibleSection(card, "Mecanicas Centrais")
        self._subtitle(sec.content, "Pool de d6")
        self._info(sec.content,
            "Role um numero de d6 igual ao Atributo + Especialidade relevante. "
            "Cada dado mostrando 4, 5 ou 6 conta como um Sucesso. "
            "1 sucesso: resultado parcial. 2+: sucesso pleno."
        )
        self._subtitle(sec.content, "Atributos")
        self._info(sec.content,
            "Fisico — forca e resistencia corporal\n"
            "Mental — raciocinio e presenca de espirito\n"
            "Social — persuasao e carisma\n"
            "Espiritual — conexao com o Alem e resistencia ao horror"
        )
        self._subtitle(sec.content, "Scars (Cicatrizes)")
        self._info(sec.content,
            "Cada trauma fisico ou psicologico deixa uma Scar. As Scars sao mecanicas: "
            "podem dar bonus situacionais mas tambem impor penalidades. "
            "Acumular Scars e a unica forma de 'progredir' — voce fica mais poderoso mas menos humano."
        )
        self._subtitle(sec.content, "Manifestacoes")
        self._info(sec.content,
            "Ao ganhar Scars suficientes, os personagens desenvolvem Manifestacoes do Alem — "
            "dons sobrenaturais ligados ao trauma. Ex: sentir o medo alheio, ver os mortos, "
            "ignorar dor fisica. Sao poderes malditos, nao escolhidos."
        )

        sec = _CollapsibleSection(card, "Links e Recursos")
        self._link(sec.content, "Site oficial — Wet Ink Games", "https://wetinkgames.com/never-going-home/")
        self._link(sec.content, "Never Going Home no Itch.io", "https://wetinkgames.itch.io/never-going-home")

    # ------------------------------------------------------------------ #
    #  Apocalypse World / PbtA                                            #
    # ------------------------------------------------------------------ #

    def _build_apocalypse_world(self, parent):
        card = ttk.LabelFrame(parent, text="  Apocalypse World (PbtA)  ", padding=10)
        card.pack(fill="x", padx=20, pady=8)

        sec = _CollapsibleSection(card, "Lore e Ambientacao")
        self._info(sec.content,
            "Apocalypse World, de Vincent Baker (2010), fundou o movimento Powered by the Apocalypse (PbtA). "
            "O cenario e um pos-apocalipse deliberadamente vago: nao importa o que destruiu o mundo, "
            "importa o que as pessoas fazem agora. Violencia, politica e sobrevivencia sao os pilares. "
            "PbtA influenciou dezenas de jogos: Dungeon World, Masks, Monster of the Week, Blades in the Dark."
        )

        sec = _CollapsibleSection(card, "Mecanicas: Moves")
        self._subtitle(sec.content, "Rolagem basica")
        self._info(sec.content,
            "Role 2d6 + Stat relevante (Cool, Hard, Hot, Sharp ou Weird).\n"
            "10+: Sucesso pleno.\n"
            "7-9: Sucesso parcial — voce consegue, mas com custo ou escolha dificil.\n"
            "6-: Falha — o MC faz um Move. A historia avanca de qualquer jeito."
        )
        self._subtitle(sec.content, "Moves")
        self._info(sec.content,
            "Moves sao acoes com gatilhos narrativos: 'Quando voce age sob pressao, role +Cool.' "
            "Moves basicos: Seize by Force, Go Aggro, Act Under Fire, Read a Person, "
            "Read a Sitch, Open Brain (Psychic Maelstrom), Manipulate, Help/Interfere, Barter."
        )
        self._subtitle(sec.content, "Playbooks")
        self._info(sec.content,
            "Battlebabe, Gunlugger, Hardholder, Hocus, Maestro D, Operator, Savvyhead, Skinner. "
            "Cada Playbook tem Moves exclusivos e define a relacao do personagem com o mundo e o poder."
        )
        self._subtitle(sec.content, "MC — Mestre de Cerimonias")
        self._info(sec.content,
            "O MC nao rola dados. Usa Fronts (ameacas com Clocks) e faz Moves apenas em falhas (6-). "
            "Principio central: 'Be a fan of the characters, not their enemy.'"
        )

        sec = _CollapsibleSection(card, "Links e Recursos")
        self._link(sec.content, "Site oficial — Apocalypse World", "http://apocalypse-world.com/")
        self._link(sec.content, "PbtA Wiki", "https://pbta.wiki/")
        self._link(sec.content, "Reddit r/PBtA", "https://www.reddit.com/r/PBtA/")
        self._link(sec.content, "Dungeon World (PbtA fantasy)", "https://dungeon-world.com/")

    # ------------------------------------------------------------------ #
    #  Vampire: The Masquerade                                             #
    # ------------------------------------------------------------------ #

    def _build_vampire(self, parent):
        card = ttk.LabelFrame(parent, text="  Vampire: The Masquerade (V5)  ", padding=10)
        card.pack(fill="x", padx=20, pady=8)

        sec = _CollapsibleSection(card, "Lore: O Mundo das Trevas")
        self._info(sec.content,
            "Vampire: The Masquerade (White Wolf / Paradox) e um RPG de horror pessoal no Mundo das Trevas "
            "— uma versao sombria da realidade moderna. Voce e um vampiro (Kindred): imortal, poderoso, "
            "e amaldicoado pela Maldicao de Caim. A Mascara (Masquerade) e o pacto que mantem os vampiros "
            "ocultos da humanidade — viola-la pode significar a Segunda Morte."
        )
        self._info(sec.content,
            "A 5a Edicao (V5, 2018) reintroduz a Fome (Hunger) como mecanica central. "
            "A politica vampirica e dominada pela Camarilla e pelos Anarquistas."
        )

        sec = _CollapsibleSection(card, "Clas e Disciplines (V5)")
        self._subtitle(sec.content, "Clas da Camarilla")
        self._info(sec.content,
            "Brujah: Potence, Celerity, Presence — rebeldes apaixonados\n"
            "Gangrel: Animalism, Fortitude, Protean — selvagens nomades\n"
            "Malkavian: Auspex, Dominate, Obfuscate — profeticos e loucos\n"
            "Nosferatu: Animalism, Obfuscate, Potence — espias deformados\n"
            "Toreador: Auspex, Celerity, Presence — artistas sedutores\n"
            "Tremere: Auspex, Blood Sorcery, Dominate — feiticeiros hermeticos\n"
            "Ventrue: Dominate, Fortitude, Presence — aristocratas dominadores"
        )

        sec = _CollapsibleSection(card, "Mecanicas V5")
        self._subtitle(sec.content, "Hunger Dice")
        self._info(sec.content,
            "A Fome (Hunger 1-5) substitui dados normais por Hunger Dice. "
            "Hunger Die com 1 = Bestial Failure (a Besta assume o controle). "
            "Dois 10s = Messy Critical (sucesso brutal e bestial). "
            "Reduzir Hunger exige beber sangue — colocando a Mascara em risco."
        )
        self._subtitle(sec.content, "Humanidade")
        self._info(sec.content,
            "Humanity (0-10) mede o quanto o vampiro ainda e humano. "
            "Atos de monstruosidade triggerram testes de Stain que reduzem Humanity. "
            "Humanity 0 = torpor eterno ou dragao (monstro sem controle). "
            "Recuperar Humanity exige mudancas narrativas profundas."
        )

        sec = _CollapsibleSection(card, "Links e Recursos")
        self._link(sec.content, "World of Darkness oficial", "https://www.worldofdarkness.com/")
        self._link(sec.content, "Reddit r/VtM", "https://www.reddit.com/r/vtm/")
        self._link(sec.content, "V5 Wiki — Fandom", "https://whitewolf.fandom.com/wiki/Vampire:_The_Masquerade_(5th_Edition)")

    # ------------------------------------------------------------------ #
    #  Deadlands: The Weird West                                           #
    # ------------------------------------------------------------------ #

    def _build_deadlands(self, parent):
        card = ttk.LabelFrame(parent, text="  Deadlands: The Weird West  ", padding=10)
        card.pack(fill="x", padx=20, pady=8)

        sec = _CollapsibleSection(card, "Lore: O Weird West")
        self._info(sec.content,
            "Deadlands e um RPG de faroeste sobrenatural de Shane Lacy Hensley (1996), pela Pinnacle. "
            "Ambientado em 1879 num EUA alternativo onde a Guerra Civil ainda nao terminou, "
            "mortos-vivos caminham pelo Oeste e o ghost rock — mineral sobrenatural — "
            "alimenta uma revolucao tecnologica torta. Horror pulp americano com acao cinematografica."
        )

        sec = _CollapsibleSection(card, "Mecanicas: Savage Worlds")
        self._subtitle(sec.content, "Sistema Savage Worlds Adventure Edition")
        self._info(sec.content,
            "Cada Traito tem um dado (d4 a d12). Wild Cards (PCs) rolam tambem um Wild Die (d6) "
            "e usam o maior resultado. Target Number: 4. Cada 4 acima = 1 Raise (sucesso extra)."
        )
        self._subtitle(sec.content, "Arcanos Sobrenaturais")
        self._info(sec.content,
            "Hucksters — feiticeiros que jogam cartas com o Diabo para lancar Hexes.\n"
            "Shamans — poderes espirituais de tradicoes nativas americanas.\n"
            "Preachers — fe divina que manifesta milagres reais.\n"
            "Mad Scientists — inventores de dispositivos absurdos com ghost rock.\n"
            "Harrowed — mortos-vivos controlados por uma entidade boa, lutando contra a natureza bestial."
        )
        self._subtitle(sec.content, "Iniciativa com Cartas")
        self._info(sec.content,
            "Iniciativa determinada por cartas de baralho. Jokers valem acao extra. "
            "O baralho cria momentos imprevistos e cinematograficos."
        )

        sec = _CollapsibleSection(card, "Links e Recursos")
        self._link(sec.content, "Pinnacle Entertainment — Deadlands", "https://peginc.com/deadlands/")
        self._link(sec.content, "Reddit r/deadlands", "https://www.reddit.com/r/deadlands/")
        self._link(sec.content, "Deadlands Wiki — Fandom", "https://deadlands.fandom.com/wiki/Deadlands_Wiki")

    # ------------------------------------------------------------------ #
    #  Blades in the Dark                                                  #
    # ------------------------------------------------------------------ #

    def _build_blades(self, parent):
        card = ttk.LabelFrame(parent, text="  Blades in the Dark  ", padding=10)
        card.pack(fill="x", padx=20, pady=8)

        sec = _CollapsibleSection(card, "Lore: Doskvol")
        self._info(sec.content,
            "Blades in the Dark (John Harper, 2017) e um RPG de heist urbano em Doskvol — "
            "cidade industrial de fantasia vitoriana rodeada por raios eletricos que contem fantasmas. "
            "O sol foi destruido ha seculos; o mundo e permanentemente escuro. "
            "Os personagens formam uma gang criminosa (Crew) que realiza Scores (golpes) "
            "para ganhar dinheiro e reputacao em meio a facoes rivais perigosas."
        )

        sec = _CollapsibleSection(card, "Mecanicas Centrais")
        self._subtitle(sec.content, "Rolagem de Acao")
        self._info(sec.content,
            "Role um pool de d6 (valor da Acao). Use o dado mais alto:\n"
            "6: Sucesso pleno.\n"
            "4-5: Sucesso parcial — com consequencia ou custo.\n"
            "1-3: Falha — as coisas pioram.\n"
            "Zero dados: Role 2d6, use o menor."
        )
        self._subtitle(sec.content, "Posicao e Efeito")
        self._info(sec.content,
            "Antes de rolar, o GM define Posicao (Controlled / Risky / Desperate) e "
            "Efeito (Limited / Standard / Great). Negociados entre GM e jogador."
        )
        self._subtitle(sec.content, "Flashbacks")
        self._info(sec.content,
            "Durante um Score, qualquer jogador pode declarar um Flashback: "
            "'Antes de entrar, eu preparei uma saida secreta.' "
            "Elimina a necessidade de planejar tudo antes do Score comecar. "
            "Custo: 0-2 Stress, definido pelo GM."
        )
        self._subtitle(sec.content, "Stress e Trauma")
        self._info(sec.content,
            "Personagens tem 9 pontos de Stress, gastos para resistir a consequencias ou usar habilidades. "
            "Ao encher, o personagem sofre um Trauma e vai para recuperacao. "
            "4 Traumas = personagem se aposenta da vida criminosa."
        )
        self._subtitle(sec.content, "Playbooks")
        self._info(sec.content,
            "Cutter (combatente) | Hound (cacador/arqueiro) | Leech (engenheiro/venenos)\n"
            "Lurk (infiltrador) | Slide (manipulador social) | Spider (estrategista)\n"
            "Whisper (ocultista — acessa o mundo fantasmagorico)"
        )

        sec = _CollapsibleSection(card, "Links e Recursos")
        self._link(sec.content, "Site oficial — Blades in the Dark", "https://bladesinthedark.com/")
        self._link(sec.content, "SRD gratuito (Blades)", "https://bladesinthedark.com/greetings-scoundrel")
        self._link(sec.content, "John Harper no Itch.io", "https://johnharper.itch.io/blades-in-the-dark")
        self._link(sec.content, "Reddit r/bladesinthedark", "https://www.reddit.com/r/bladesinthedark/")
        self._link(sec.content, "Hacks e derivados de BitD", "https://bladesinthedark.com/hacks-and-games")
