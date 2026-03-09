"""
DM - Dungeon Music
Definição dos 22 passos do Wizard de Criação de Sistemas.

Cada passo é um dict com:
  id          str     — identificador único
  phase       str     — fase (Fundação / Mecânicas / Personagens / Mundo / Ficha / Conclusão)
  phase_index int     — índice da fase (0-5)
  title       str     — título curto para sidebar
  question    str     — pergunta principal exibida ao usuário
  hint        str     — texto de ajuda adicional
  widget      str     — tipo de widget: "choice", "text", "multicheck", "slider", "list_editor"
  options     list    — para "choice" e "multicheck": lista de (value, label) ou (value, label, description)
  example_key str     — chave no dict examples do sistema base para exibir contexto
  required    bool    — se a resposta é obrigatória
  answer_key  str     — chave em answers{} onde salvar a resposta
"""

PHASES = [
    (0, "Fundação"),
    (1, "Mecânicas"),
    (2, "Personagens"),
    (3, "Mundo & Lore"),
    (4, "Ficha"),
    (5, "Conclusão"),
]

WIZARD_STEPS = [
    # ─────────────────────────────── FASE 0: FUNDAÇÃO ──────────────────────────
    {
        "id": "base_system",
        "phase": "Fundação",
        "phase_index": 0,
        "title": "Sistema Base",
        "question": "Qual sistema servirá de inspiração para o seu?",
        "hint": (
            "Isso define os exemplos que aparecem ao longo do wizard. "
            "Você não precisa seguir o sistema escolhido — use como ponto de partida."
        ),
        "widget": "choice_cards",
        "options": [
            ("D&D 5e",                   "D&D 5ª Edição",                "Fantasy épica, d20, classes e níveis"),
            ("Warhammer 40.000 RPG",     "Warhammer 40K RPG",            "Grimdark sci-fi, d100 percentual"),
            ("Dark Heresy 2e",           "Dark Heresy 2e",               "Investigação paranoica, Inquisitório"),
            ("Never Going Home",         "Never Going Home",             "Horror WWI, pool de d6, cicatrizes"),
            ("Apocalypse World",         "Apocalypse World",             "PbtA pós-apo, Moves, 2d6"),
            ("Vampire: The Masquerade",  "Vampire: The Masquerade",      "Horror pessoal, vampiros, pool d10"),
            ("Deadlands",                "Deadlands: Weird West",        "Faroeste sobrenatural, Savage Worlds"),
            ("Blades in the Dark",       "Blades in the Dark",           "Heist vitoriano, pool d6, flashbacks"),
        ],
        "example_key": None,
        "required": True,
        "answer_key": "base_system",
    },
    {
        "id": "system_name",
        "phase": "Fundação",
        "phase_index": 0,
        "title": "Nome do Sistema",
        "question": "Como se chama o seu sistema?",
        "hint": "Escolha um nome memorável. Pode ser mudado depois.",
        "widget": "text",
        "options": [],
        "example_key": None,
        "required": True,
        "answer_key": "system_name",
    },
    {
        "id": "genre",
        "phase": "Fundação",
        "phase_index": 0,
        "title": "Gênero & Tom",
        "question": "Qual o gênero e tom do seu sistema?",
        "hint": "Defina a atmosfera principal. Você pode combinar múltiplos gêneros.",
        "widget": "multicheck",
        "options": [
            ("fantasy_alta",    "Alta Fantasia",         "Magia abundante, heróis épicos, dragões"),
            ("fantasy_baixa",   "Baixa Fantasia",        "Magia rara, personagens mortais, realismo"),
            ("horror",          "Horror",                "Terror, suspense, perda de controle"),
            ("scifi_hard",      "Ficção Científica Hard","Tecnologia plausível, espaço, colonização"),
            ("scifi_soft",      "Ficção Científica Soft","Cyberpunk, pós-humano, space opera"),
            ("western",         "Faroeste",              "Fronteiras, duelos, pistoleiros"),
            ("investigacao",    "Investigação",          "Mistérios, conspirações, detetives"),
            ("politico",        "Intriga Política",      "Cortes, alianças, traições"),
            ("horror_cosmico",  "Horror Cósmico",        "Entidades além da compreensão"),
            ("postapoc",        "Pós-Apocalíptico",      "Sobrevivência, ruínas, reconstrução"),
            ("historico",       "Histórico",             "Baseado em períodos reais da história"),
            ("mitologico",      "Mitológico",            "Deuses, heróis míticos, epopéias"),
            ("steampunk",       "Steampunk",             "Vapor, engrenagens, Era Vitoriana"),
            ("urbano",          "Contemporâneo/Urbano",  "Mundo moderno, segredos ocultos"),
        ],
        "example_key": "tone",
        "required": True,
        "answer_key": "genre",
    },

    # ─────────────────────────────── FASE 1: MECÂNICAS ─────────────────────────
    {
        "id": "core_resolution",
        "phase": "Mecânicas",
        "phase_index": 1,
        "title": "Mecânica Central",
        "question": "Como funciona a resolução de ações no seu sistema?",
        "hint": "Essa é a espinha dorsal do jogo — o que o jogador rola para saber se conseguiu.",
        "widget": "choice",
        "options": [
            ("d20_target",      "d20 + modificador vs. CD fixo",        "Como D&D 5e / Pathfinder"),
            ("d100_under",      "d100 ≤ valor da perícia",              "Como WH40K, Call of Cthulhu"),
            ("pool_d6_count",   "Pool de d6 — contar sucessos",         "Como WoD, Never Going Home"),
            ("pool_d10_count",  "Pool de d10 — contar sucessos",        "Como Vampire: The Masquerade"),
            ("2d6_plus",        "2d6 + stat (7+ / 10+ / falha)",        "Como PbtA / Apocalypse World"),
            ("dice_step",       "Dado de característica (d4 a d12)",    "Como Savage Worlds / Deadlands"),
            ("single_d6_high",  "Pool d6 — use maior resultado",        "Como Blades in the Dark / PBTA"),
            ("custom",          "Personalizado (descrever)",            "Crie sua própria mecânica"),
        ],
        "example_key": "conflict",
        "required": True,
        "answer_key": "core_resolution",
    },
    {
        "id": "dice_types",
        "phase": "Mecânicas",
        "phase_index": 1,
        "title": "Dados Usados",
        "question": "Quais tipos de dados o sistema utiliza?",
        "hint": "Marque todos os dados que aparecem nas mecânicas. Dados especiais podem ser descritos na pergunta seguinte.",
        "widget": "multicheck",
        "options": [
            ("d4",   "d4",   "4 faces"),
            ("d6",   "d6",   "6 faces — o mais comum"),
            ("d8",   "d8",   "8 faces"),
            ("d10",  "d10",  "10 faces"),
            ("d12",  "d12",  "12 faces"),
            ("d20",  "d20",  "20 faces — icônico"),
            ("d100", "d100", "Percentual (d10×d10)"),
        ],
        "example_key": None,
        "required": True,
        "answer_key": "dice_types",
    },
    {
        "id": "success_failure",
        "phase": "Mecânicas",
        "phase_index": 1,
        "title": "Sucesso Parcial",
        "question": "Existe um resultado intermediário entre sucesso e falha?",
        "hint": (
            "Sistemas como PbtA (7-9) e Blades in the Dark (4-5) têm 'sucesso com custo'. "
            "Isso cria mais drama mas torna o jogo mais complexo."
        ),
        "widget": "choice",
        "options": [
            ("binario",       "Binário: Sucesso ou Falha",              "Simples e direto"),
            ("tres_niveis",   "3 níveis: Sucesso / Parcial / Falha",    "Como PbtA, Blades in the Dark"),
            ("graus",         "Graus de sucesso/falha por margem",      "Como WH40K (cada 10 = 1 grau)"),
            ("critico",       "Críticos e Fumbles em extremos",         "D&D com nat20/nat1"),
        ],
        "example_key": "conflict",
        "required": True,
        "answer_key": "success_failure",
    },
    {
        "id": "health_system",
        "phase": "Mecânicas",
        "phase_index": 1,
        "title": "Sistema de Saúde",
        "question": "Como os personagens rastreiam dano e saúde?",
        "hint": "Defina o quão letal o jogo é.",
        "widget": "choice",
        "options": [
            ("hp_classico",     "Pontos de Vida (HP) numéricos",         "D&D, Pathfinder"),
            ("hp_localizado",   "HP com localização de dano",            "WH40K — braço, perna, cabeça"),
            ("wound_track",     "Trilha de Ferimentos (caixas)",         "Savage Worlds, Blades in the Dark"),
            ("harm_stress",     "Harm + Stress como recursos separados", "Blades in the Dark"),
            ("conditions",      "Condições descritivas sem número",      "PbtA — você está 'gravemente ferido'"),
            ("clocks",          "Relógios de progresso (clocks)",        "Countdown por evento"),
        ],
        "example_key": None,
        "required": True,
        "answer_key": "health_system",
    },
    {
        "id": "magic_system",
        "phase": "Mecânicas",
        "phase_index": 1,
        "title": "Sistema de Magia",
        "question": "O sistema tem magia ou poderes especiais?",
        "hint": "Você pode ter múltiplos tipos de poderes ou nenhum.",
        "widget": "multicheck",
        "options": [
            ("sem_magia",     "Sem magia — sistema mundano/realista",    ""),
            ("slots_spells",  "Magias com slots limitados",               "Como D&D — espaços por nível"),
            ("mana_pool",     "Pool de mana/energia gastável",            ""),
            ("risk_magic",    "Magia com risco de falha catastrófica",    "WH40K Psíquico, Perils of the Warp"),
            ("rituals",       "Rituais lentos e custosos",                "Call of Cthulhu, Ars Magica"),
            ("card_magic",    "Magia com cartas/aleatoriedade extra",     "Deadlands Hucksters"),
            ("moves_powers",  "Poderes como Moves narrativos",            "PbtA Weird, Dungeon World"),
            ("disciplines",   "Poderes organizados por disciplinas/clãs", "Vampire: The Masquerade"),
            ("ki_focus",      "Ki/Chi/Foco interno",                      "Artes marciais, monges"),
            ("tech_powers",   "Poderes tecnológicos (implantes, armas)",  "Cyberpunk, Shadowrun"),
            ("psionics",      "Poderes psíquicos/mentais",                "Star Wars d6, Dark Heresy"),
        ],
        "example_key": "magic_system",
        "required": False,
        "answer_key": "magic_system",
    },
    {
        "id": "advancement",
        "phase": "Mecânicas",
        "phase_index": 1,
        "title": "Progressão",
        "question": "Como os personagens evoluem?",
        "hint": "Defina o ritmo de crescimento.",
        "widget": "choice",
        "options": [
            ("xp_niveis",    "XP → Níveis com habilidades pré-definidas",   "D&D, Pathfinder"),
            ("xp_livre",     "XP gasto livremente em perícias/atributos",   "WH40K, Conan"),
            ("marcos",       "Marcos narrativos (milestones)",               "D&D variante, Fate"),
            ("scars_trauma", "Trauma/Cicatrizes como progressão",            "Never Going Home, Kult"),
            ("advances",     "Advances por rank (Savage Worlds)",            "Deadlands"),
            ("moves_xp",     "XP por Beliefs + desbloquear Moves",          "PbtA, Blades in the Dark"),
            ("sem_avanço",   "Sem progressão mecânica — história pura",      "Fiasco, alguns one-shots"),
        ],
        "example_key": "advancement",
        "required": True,
        "answer_key": "advancement",
    },
    {
        "id": "combat_style",
        "phase": "Mecânicas",
        "phase_index": 1,
        "title": "Combate",
        "question": "Como o combate é conduzido?",
        "hint": "Isso define o ritmo e o foco das cenas de ação.",
        "widget": "multicheck",
        "options": [
            ("turno_iniciativa", "Turnos com iniciativa (ordem importa)",    "D&D, WH40K"),
            ("cinematografico",  "Cinematográfico e rápido",                 "Savage Worlds, Blades"),
            ("miniaturas",       "Suporte a miniaturas e mapa de quadrícula","D&D tático"),
            ("teatro_mente",     "Teatro da mente — sem mapa",               "PbtA, narrativo"),
            ("letal_realista",   "Letal e realista (morrer rápido)",         "WH40K, OSR, DCC"),
            ("heroico",          "Heróico — PCs são difíceis de matar",      "D&D 5e, Savage Worlds"),
            ("social_fight",     "Combate social com mesmas mecânicas",      "Vampire, Burning Wheel"),
            ("flashback",        "Planejamento por flashback (ação após)",   "Blades in the Dark"),
        ],
        "example_key": "conflict",
        "required": True,
        "answer_key": "combat_style",
    },
    {
        "id": "recovery_rest",
        "phase": "Mecânicas",
        "phase_index": 1,
        "title": "Recuperação",
        "question": "Como personagens recuperam saúde e recursos gastos?",
        "hint": "Define o ritmo do jogo — rápida recuperação = mais ação; lenta = mais tensão.",
        "widget": "multicheck",
        "options": [
            ("descanso_longo",   "Descanso longo (noite inteira)",             "Como D&D — recupera tudo"),
            ("descanso_curto",   "Descanso curto (1h)",                        "D&D — recupera parcial"),
            ("curativos_items",  "Itens de cura (poções, bandagens)",          "Gasto de recurso"),
            ("magia_cura",       "Magia de cura por aliados",                  "Clérigos, Chamanes"),
            ("downtime",         "Downtime entre sessões/aventuras",           "Blades in the Dark"),
            ("sem_recuperacao",  "Sem recuperação automática — tudo tem custo","Horror, OSR"),
            ("narrativa",        "Recuperação narrativa (quando faz sentido)", "PbtA, Fate"),
            ("clocks_cura",      "Relógios de recuperação (clocks)",           "Blades in the Dark"),
        ],
        "example_key": None,
        "required": False,
        "answer_key": "recovery_rest",
    },
    {
        "id": "social_mechanics",
        "phase": "Mecânicas",
        "phase_index": 1,
        "title": "Interação Social",
        "question": "Como funciona a interação social e negociação no sistema?",
        "hint": "Defina se conversas e manipulação têm mecânicas próprias.",
        "widget": "choice",
        "options": [
            ("livre_rp",        "Roleplay puro — sem dados para social",         "Narrativo e imersivo"),
            ("mesmo_sistema",   "Mesma mecânica que o restante (perícias)",      "D&D, WH40K"),
            ("moves_sociais",   "Moves narrativos específicos para social",      "PbtA — Manipulate, Seduce"),
            ("recursos_social", "Recursos específicos (Influência, Reputação)",  "WoD, Blades in the Dark"),
            ("confronto_rival", "Confronto social = combate com palavras",       "WoD, Burning Wheel"),
        ],
        "example_key": "social",
        "required": False,
        "answer_key": "social_mechanics",
    },
    {
        "id": "equipment_categories",
        "phase": "Mecânicas",
        "phase_index": 1,
        "title": "Equipamentos & Itens",
        "question": "Quais categorias de itens e equipamentos existem no sistema?",
        "hint": "Marque todas que fazem sentido para o gênero e mecânicas do seu sistema.",
        "widget": "multicheck",
        "options": [
            ("armas_corpo",     "Armas corpo-a-corpo",                            "Espadas, facas, machados"),
            ("armas_distancia", "Armas à distância",                              "Arcos, pistolas, rifles"),
            ("armas_fogo",      "Armas de fogo modernas/futuristas",              "Pistolas, rifles, explosivos"),
            ("armaduras",       "Armaduras e proteções",                          "Couro, aço, escudos"),
            ("pocoes_cura",     "Poções e consumíveis de cura",                   "Ervas, poções mágicas"),
            ("itens_magicos",   "Itens mágicos / tecnológicos especiais",         "Artefatos, implantes"),
            ("ferramentas",     "Ferramentas e equipamentos de ofício",           "Ladrão, alquimia, culinária"),
            ("montaria",        "Montarias e veículos",                           "Cavalos, naves, carros"),
            ("moeda_barter",    "Sistema de moeda ou escambo",                    "Ouro, créditos, Barter"),
            ("suprimentos",     "Suprimentos de sobrevivência",                   "Comida, água, munição"),
            ("itens_focus",     "Foco ou catalisador para magia",                 "Grimório, varinha, símbolo"),
            ("carga_peso",      "Sistema de carga / encumbrance",                 "Limita itens carregados"),
            ("qualidade_dano",  "Itens com qualidade / durabilidade",             "Itens podem quebrar"),
            ("sem_itens",       "Sem sistema de equipamentos detalhado",          "Narrativo / abstrato"),
        ],
        "example_key": "exploration",
        "required": False,
        "answer_key": "equipment_categories",
    },

    # ─────────────────────────────── FASE 2: PERSONAGENS ───────────────────────
    {
        "id": "attributes_type",
        "phase": "Personagens",
        "phase_index": 2,
        "title": "Atributos",
        "question": "Como são os atributos do personagem?",
        "hint": "Atributos são as características fundamentais que definem o que o personagem é.",
        "widget": "choice",
        "options": [
            ("6_classicos",    "6 atributos clássicos (D&D-style)",         "FOR, DES, CON, INT, SAB, CAR"),
            ("9_wod",          "9 atributos WoD (Físico/Social/Mental 3×3)", "Vampire, WoD"),
            ("5_curtos",       "5 atributos simples",                       "Savage Worlds, PBTA"),
            ("4_grupos",       "4 atributos amplos",                        "Never Going Home, Fate"),
            ("stats_free",     "Atributos customizados (você define)",      "Sistema próprio"),
            ("sem_atributos",  "Sem atributos — apenas perícias",           "Minimalista"),
        ],
        "example_key": "character_creation",
        "required": True,
        "answer_key": "attributes_type",
    },
    {
        "id": "custom_attributes",
        "phase": "Personagens",
        "phase_index": 2,
        "title": "Defina Atributos",
        "question": "Liste os atributos do seu sistema (um por linha):",
        "hint": (
            "Ex: Força, Agilidade, Intelecto, Vontade\n"
            "Você pode usar nomes temáticos — como 'Grit' (Coragem) para Faroeste."
        ),
        "widget": "list_editor",
        "options": [],
        "example_key": "character_creation",
        "required": False,
        "answer_key": "custom_attributes",
        "depends_on": ("attributes_type", "stats_free"),
    },
    {
        "id": "skills_system",
        "phase": "Personagens",
        "phase_index": 2,
        "title": "Perícias",
        "question": "Como funcionam as perícias no seu sistema?",
        "hint": "Perícias são especializações dentro dos atributos ou áreas de competência.",
        "widget": "choice",
        "options": [
            ("lista_fixa",     "Lista fixa de perícias + proficiência",      "D&D — você sabe ou não"),
            ("percentual",     "Valor numérico percentual por perícia",      "WH40K, BRP, CoC"),
            ("ranks",          "Ranks de proficiência (d4 a d12)",           "Savage Worlds"),
            ("moves_skills",   "Ações narrativas (Moves)",                   "PbtA — cada ação é uma Move"),
            ("pool_dots",      "Pontos (●●●○○) por especialidade",          "WoD, Vampire"),
            ("free_skill",     "Perícias livres definidas pelo jogador",     "Minimalista"),
        ],
        "example_key": "character_creation",
        "required": True,
        "answer_key": "skills_system",
    },
    {
        "id": "archetypes",
        "phase": "Personagens",
        "phase_index": 2,
        "title": "Arquétipos / Classes",
        "question": "Personagens seguem arquétipos, classes ou são livres?",
        "hint": "Classes restringem mas dão identidade. Liberdade total pode gerar personagens sem foco.",
        "widget": "choice",
        "options": [
            ("classes_rigidas",  "Classes fixas com habilidades por nível",    "D&D — Guerreiro, Mago, etc."),
            ("playbooks",        "Playbooks (arquétipos narrativos)",           "PbtA, Blades in the Dark"),
            ("classes_multi",    "Classes com multiclasse",                     "D&D, Pathfinder"),
            ("career_system",    "Carreiras com histórico acumulado",           "WH40K, Traveller"),
            ("livre",            "Construção totalmente livre por pontos",      "WoD, GURPS, Savage Worlds"),
            ("conceito",         "Conceito narrativo sem mecânica de classe",   "Fate Core"),
        ],
        "example_key": "character_creation",
        "required": True,
        "answer_key": "archetypes",
    },
    {
        "id": "special_traits",
        "phase": "Personagens",
        "phase_index": 2,
        "title": "Vantagens & Falhas",
        "question": "O sistema tem vantagens, feitos, edges, hindrances ou traços especiais?",
        "hint": "Esses elementos personalizam o personagem além da classe/arquétipo.",
        "widget": "multicheck",
        "options": [
            ("feitos_feats",   "Feitos / Feats",                     "D&D 5e, Pathfinder"),
            ("edges_hindr",    "Edges & Hindrances",                 "Savage Worlds, Deadlands"),
            ("meritos_falhas", "Méritos & Defeitos",                 "WoD, Vampire"),
            ("talentos",       "Árvore de Talentos",                 "WH40K, SWTOR-style"),
            ("backgrounds",    "Antecedentes narrativos",            "D&D 5e, Call of Cthulhu"),
            ("traumas_scars",  "Traumas / Cicatrizes como mecânica", "Never Going Home, Kult"),
            ("sem_especiais",  "Sem traços especiais",               "Sistema minimalista"),
        ],
        "example_key": "character_creation",
        "required": False,
        "answer_key": "special_traits",
    },
    {
        "id": "key_abilities",
        "phase": "Personagens",
        "phase_index": 2,
        "title": "Habilidades Especiais",
        "question": "Liste as principais habilidades ou poderes únicos do sistema (opcional):",
        "hint": (
            "Exemplos: 'Segundo Fôlego' (D&D Guerreiro), 'Ataque Furtivo' (Ladino), "
            "'Dominate' (Vampire), 'Seize by Force' (PbtA). "
            "Essas serão listadas na ficha e no documento."
        ),
        "widget": "list_editor",
        "options": [],
        "example_key": "character_creation",
        "required": False,
        "answer_key": "key_abilities",
    },
    {
        "id": "death_rules",
        "phase": "Personagens",
        "phase_index": 2,
        "title": "Morte & Consequências",
        "question": "O que acontece quando um personagem é derrotado ou morre?",
        "hint": "Define o peso das consequências e o quão letal é o sistema.",
        "widget": "choice",
        "options": [
            ("morte_imediata",   "Morte imediata ao zerar HP",                   "OSR, WH40K — letal"),
            ("inconsciente",     "Fica inconsciente — pode ser estabilizado",    "D&D 5e"),
            ("ferido_grave",     "Ferimentos graves permanentes",                "WH40K, Savage Worlds"),
            ("trauma_retire",    "Trauma / Aposentadoria do personagem",         "Blades in the Dark"),
            ("morte_narrativa",  "Morte somente por escolha narrativa",          "PbtA — 'failing forward'"),
            ("ressurreicao",     "Morte seguida de possível ressurreição",       "D&D com magia"),
            ("legado",           "Morte cria um legado mecânico para o próximo", "Ironsworn"),
        ],
        "example_key": "conflict",
        "required": False,
        "answer_key": "death_rules",
    },

    # ─────────────────────────────── FASE 3: MUNDO & LORE ──────────────────────
    {
        "id": "setting",
        "phase": "Mundo & Lore",
        "phase_index": 3,
        "title": "Cenário",
        "question": "Descreva brevemente o cenário do sistema (opcional):",
        "hint": (
            "Pode ser um mundo já existente ou algo inteiramente novo. "
            "Ex: 'Cidade portuária vitoriana com guildas criminosas e fantasmas reais.'"
        ),
        "widget": "text_long",
        "options": [],
        "example_key": "setting",
        "required": False,
        "answer_key": "setting",
    },
    {
        "id": "factions",
        "phase": "Mundo & Lore",
        "phase_index": 3,
        "title": "Facções & Política",
        "question": "Existem facções, organizações ou forças políticas no cenário?",
        "hint": "Facções criam tensão e motivação para aventuras.",
        "widget": "list_editor",
        "options": [],
        "example_key": "social",
        "required": False,
        "answer_key": "factions",
    },
    {
        "id": "themes",
        "phase": "Mundo & Lore",
        "phase_index": 3,
        "title": "Temas Centrais",
        "question": "Quais temas o sistema quer explorar?",
        "hint": "Temas guiam o Mestre na criação de aventuras e dilemas morais.",
        "widget": "multicheck",
        "options": [
            ("redenção",       "Redenção & Queda",           ""),
            ("poder_corrupto", "Poder que corrompe",          ""),
            ("sobrevivencia",  "Sobrevivência",               ""),
            ("identidade",     "Identidade & Pertencimento",  ""),
            ("lealdade",       "Lealdade & Traição",          ""),
            ("guerra",         "Custo da Guerra",             ""),
            ("esperança",      "Esperança no caos",           ""),
            ("conspiracao",    "Conspiração & Paranoia",      ""),
            ("humanidade",     "O que nos torna humanos",     ""),
            ("ambição",        "Ambição & Sacrifício",        ""),
            ("familia",        "Família & Vínculos",          ""),
            ("monstro",        "Monstro interior",            ""),
        ],
        "example_key": "tone",
        "required": False,
        "answer_key": "themes",
    },

    # ─────────────────────────────── FASE 4: FICHA ──────────────────────────────
    {
        "id": "sheet_layout",
        "phase": "Ficha",
        "phase_index": 4,
        "title": "Layout da Ficha",
        "question": "Como você quer que a ficha de personagem seja organizada?",
        "hint": "Isso define a estrutura visual do documento exportado.",
        "widget": "choice",
        "options": [
            ("standard",    "Padrão: seções em colunas",        "Como D&D 5e — informação densa"),
            ("minimal",     "Minimalista: campos essenciais",    "Compacta, uma página"),
            ("narrative",   "Narrativa: foco em texto/historia","Como Fate Core — aspectos em destaque"),
            ("tracker",     "Tracker: foco em recursos/marcação","Blades — stress, harm, relógios"),
            ("portrait",    "Retrato: imagem em destaque",       "Ficha com arte do personagem"),
        ],
        "example_key": None,
        "required": True,
        "answer_key": "sheet_layout",
    },
    {
        "id": "sheet_fields",
        "phase": "Ficha",
        "phase_index": 4,
        "title": "Campos da Ficha",
        "question": "Quais campos devem aparecer na ficha?",
        "hint": (
            "Selecione todos os elementos desejados. "
            "Na próxima tela você poderá adicionar campos personalizados."
        ),
        "widget": "multicheck",
        "options": [
            # Identidade
            ("nome",          "Nome do personagem",                 ""),
            ("jogador",       "Nome do jogador",                    ""),
            ("classe_arq",    "Classe / Arquétipo / Playbook",      ""),
            ("nivel_rank",    "Nível / Rank / Geração",             ""),
            ("raca_origem",   "Raça / Origem / Mundo Natal",        ""),
            ("antecedente",   "Antecedente / Background",           ""),
            ("alinhamento",   "Alinhamento / Convicções",           ""),
            ("aparencia",     "Aparência / Look",                   ""),
            ("imagem",        "Retrato / Arte do personagem",       ""),
            # Atributos & Perícias
            ("atributos",     "Bloco de Atributos",                 ""),
            ("modificadores", "Modificadores de Atributo",          ""),
            ("pericias",      "Lista de Perícias",                  ""),
            ("proficiencias", "Proficiências e Talentos",           ""),
            ("salvaguardas",  "Salvaguardas / Resistências",        ""),
            # Combate
            ("pv_hp",         "Pontos de Vida / HP",                ""),
            ("ca_defesa",     "CA / Defesa / Parry",                ""),
            ("iniciativa",    "Iniciativa / Velocidade",            ""),
            ("wounds",        "Trilha de Ferimentos",               ""),
            ("stress",        "Stress / Willpower",                 ""),
            ("ataques",       "Ataques e armas",                    ""),
            # Recursos
            ("mana_energia",  "Mana / Energia / Power Points",      ""),
            ("slots_magia",   "Slots de Magia",                     ""),
            ("fate_points",   "Fate Points / Bennie / Pontos",      ""),
            ("xp_counter",    "Contador de XP",                     ""),
            # Poderes
            ("poderes",       "Lista de Poderes / Magias / Moves",  ""),
            ("disciplines",   "Disciplines / Arcanums",             ""),
            ("inventario",    "Inventário / Equipamentos",          ""),
            ("moedas",        "Moedas / Recursos / Barter",         ""),
            # Narrativa
            ("tracos",        "Traços de Personalidade",            ""),
            ("vinculos",      "Vínculos / Touchstones",             ""),
            ("ideais",        "Ideais / Beliefs",                   ""),
            ("defeitos",      "Defeitos / Hindrances",              ""),
            ("faccao",        "Facção / Lealdade",                  ""),
            ("notas",         "Espaço de Notas livres",             ""),
            # Especiais
            ("insanidade",    "Insanidade / Corruption",            ""),
            ("humanidade",    "Humanidade / Moral",                 ""),
            ("hunger_fome",   "Fome / Hunger",                      ""),
            ("clocks",        "Relógios de Progresso (Clocks)",     ""),
            ("reputacao",     "Reputação / Influence / Bounty",     ""),
            ("hx_historia",   "Hx / Histórico com outros PCs",      ""),
        ],
        "example_key": None,
        "required": True,
        "answer_key": "sheet_fields",
    },

    # ─────────────────────────────── FASE 5: CONCLUSÃO ─────────────────────────
    {
        "id": "export_system_formats",
        "phase": "Conclusão",
        "phase_index": 5,
        "title": "Exportar Sistema",
        "question": "Em quais formatos exportar o Documento do Sistema?",
        "hint": "O documento descreve todas as mecânicas, regras e configurações do sistema.",
        "widget": "multicheck",
        "options": [
            ("txt",  "TXT — Texto simples",              "Sem formatação, abre em qualquer editor"),
            ("word", "Word (.docx) — Documento editável","Requer: pip install python-docx"),
            ("png",  "PNG — Imagem do documento",        "Requer: pip install Pillow"),
            ("pdf",  "PDF — Documento formatado",        "Requer: pip install reportlab"),
        ],
        "example_key": None,
        "required": True,
        "answer_key": "export_system_formats",
    },
    {
        "id": "export_sheet_formats",
        "phase": "Conclusão",
        "phase_index": 5,
        "title": "Exportar Ficha",
        "question": "Em quais formatos exportar a Ficha de Personagem?",
        "hint": "A ficha contém todos os campos que você configurou na fase anterior.",
        "widget": "multicheck",
        "options": [
            ("txt",  "TXT — Ficha em texto simples",     "Pode imprimir ou preencher no editor"),
            ("word", "Word (.docx) — Ficha editável",    "Requer: pip install python-docx"),
            ("png",  "PNG — Ficha como imagem visual",   "Requer: pip install Pillow"),
            ("pdf",  "PDF — Ficha formatada para impressão", "Requer: pip install reportlab"),
        ],
        "example_key": None,
        "required": True,
        "answer_key": "export_sheet_formats",
    },
    {
        "id": "final_notes",
        "phase": "Conclusão",
        "phase_index": 5,
        "title": "Notas Finais",
        "question": "Alguma observação ou ideia adicional para o sistema? (opcional)",
        "hint": "Essas notas serão incluídas no documento exportado.",
        "widget": "text_long",
        "options": [],
        "example_key": None,
        "required": False,
        "answer_key": "final_notes",
    },
]

TOTAL_STEPS = len(WIZARD_STEPS)


def get_step(index: int) -> dict:
    if 0 <= index < TOTAL_STEPS:
        return WIZARD_STEPS[index]
    return None


def get_steps_for_phase(phase_index: int) -> list:
    return [s for s in WIZARD_STEPS if s["phase_index"] == phase_index]


def should_show_step(step: dict, answers: dict) -> bool:
    """Retorna False se o passo depende de uma resposta específica que não foi dada."""
    dep = step.get("depends_on")
    if dep is None:
        return True
    key, value = dep
    ans = answers.get(key)
    if isinstance(ans, list):
        return value in ans
    return ans == value


def count_visible_steps(answers: dict) -> int:
    return sum(1 for s in WIZARD_STEPS if should_show_step(s, answers))
