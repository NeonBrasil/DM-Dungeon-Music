"""
DM - Dungeon Music
Dados de referência dos 8 sistemas base para o Criador de Sistemas.
Cada sistema contém: descrição, mecânicas principais, exemplos por tópico,
sugestões de ficha e links úteis.
"""

# ─────────────────────────────────────────────────────────────────────────────
# Estrutura por sistema: dict com chaves usadas pelo wizard para exibir
# exemplos contextuais em cada passo.
# ─────────────────────────────────────────────────────────────────────────────

BASE_SYSTEMS = {
    "D&D 5e": {
        "label": "Dungeons & Dragons 5ª Edição",
        "genre": "Fantasy épica de alta aventura",
        "description": (
            "O sistema mais popular do mundo. Focado em aventura heroica em mundos "
            "de fantasia medieval. Usa d20 como dado central com atributos (STR, DEX, CON, INT, WIS, CHA), "
            "bônus de proficiência, e classes altamente detalhadas com habilidades por nível."
        ),
        "core_mechanic": (
            "Role um d20, adicione o modificador relevante (atributo + proficiência). "
            "Resultado ≥ CD (Classe de Dificuldade) = sucesso."
        ),
        "dice": ["d4", "d6", "d8", "d10", "d12", "d20", "d100"],
        "attributes": ["Força", "Destreza", "Constituição", "Inteligência", "Sabedoria", "Carisma"],
        "resolution": "d20 + modificador vs CD fixo",
        "health": "Pontos de Vida (PV) por dado de vida da classe + mod CON por nível",
        "magic": "Sistema de espaços de magia por nível (Slots). Magias de 1º a 9º círculo.",
        "advancement": "XP por encontros/objetivos → níveis de 1 a 20. Marcos opcionais.",
        "combat": (
            "Turnos em iniciativa (d20+DEX). Ações: atacar, conjurar, correr, empurrar, etc. "
            "Vantagem/desvantagem: role 2d20, use maior/menor."
        ),
        "character_sheet_elements": [
            "Nome, Raça, Classe, Nível, Antecedente, Alinhamento",
            "6 Atributos (3–18) e seus modificadores",
            "Salvaguardas, Perícias com proficiência",
            "CA, Iniciativa, Deslocamento",
            "Pontos de Vida máx/atual, Dado de Vida",
            "Ataques e Magias",
            "Traços de personalidade, Ideais, Vínculos, Defeitos",
            "Equipamentos e moedas",
            "Habilidades de classe, raça e antecedente",
        ],
        "sheet_presets": [
            {"label": "Guerreiro", "fields": ["Força", "Destreza", "CA", "PV", "Ataques", "Segundo Fôlego"]},
            {"label": "Mago", "fields": ["Inteligência", "Espaços de Magia", "Truques", "Lista de Magias"]},
            {"label": "Ladino", "fields": ["Destreza", "Furtividade", "Ataque Furtivo", "Perícias"]},
        ],
        "examples": {
            "tone": "Heroico, épico, aventureiro. Os personagens são excepcionais.",
            "setting": "Forgotten Realms, Eberron, Ravenloft, Planescape — qualquer fantasia.",
            "conflict": "Combate tático com miniaturas ou teatro da mente. Encontros balanceados por CR.",
            "advancement": "Cada nível traz novas habilidades de classe, às vezes Feitos ou aumento de atributo.",
            "magic_system": "Arcana, Divina, Druídica etc. Slots se recuperam com descanso longo/curto.",
            "social": "Testes de CHA (Persuasão, Enganação, Intimidação). Não substitui roleplay.",
            "exploration": "Ritmo de jornada, suprimentos, armadilhas, puzzles. Dados para navegação.",
            "character_creation": "Escolha raça + classe + antecedente. Distribua atributos (point buy, standard array ou roll 4d6).",
        },
        "inspirations": ["The Lord of the Rings", "Conan", "Dragonlance", "Forgotten Realms novels"],
        "links": [
            ("SRD Oficial (EN)", "https://5e.tools/"),
            ("D&D Beyond", "https://www.dndbeyond.com/"),
        ],
    },

    "Warhammer 40.000 RPG": {
        "label": "Warhammer 40.000 RPG (Dark Heresy / Rogue Trader / Deathwatch)",
        "genre": "Ficção científica sombria, horror cósmico, grimdark",
        "description": (
            "Ambientado no universo W40K do 41º Milênio. Os personagens são agentes do Inquisitório, "
            "Rogue Traders, Marines Espaciais ou guerrilheiros da Guarda Imperial. "
            "Sistema percentual (d100): role abaixo da perícia para ter sucesso. "
            "Tema central: sobrevivência, corrupção, fanatismo e guerra sem fim contra o Caos."
        ),
        "core_mechanic": (
            "Role d100. Se o resultado for ≤ ao valor da perícia/característica, é um sucesso. "
            "Graus de Sucesso/Falha baseados na diferença."
        ),
        "dice": ["d5", "d10", "d100"],
        "attributes": [
            "Força Corporal", "Destreza", "Robustez", "Inteligência",
            "Percepção", "Força de Vontade", "Carisma", "Agilidade", "Influência"
        ],
        "resolution": "d100 ≤ Perícia/Característica = sucesso",
        "health": "Ferimentos (Wounds). Dano localizado por hit location (cabeça, braços, tronco, pernas).",
        "magic": (
            "Psíquicos canalizam o Imaterium. Poderes com risco de Fenômenos Psíquicos e Perils of the Warp. "
            "Alta recompensa, altíssimo risco de possessão/corrupção."
        ),
        "advancement": "XP gasto em perícias, características e talentos. Sem níveis fixos — progressão contínua.",
        "combat": (
            "Turno com Ações padrão/completas/reação. Hit locations determinam efeitos graves. "
            "Armas de fogo com munição, recarga, dispersão. Críticos causam efeitos permanentes."
        ),
        "character_sheet_elements": [
            "Nome, Mundo de Origem, Antecedente, Carreira",
            "9 Características (2d10+20 típico)",
            "Ferimentos, Armadura por localização, Iniciativa",
            "Perícias treinadas e não-treinadas",
            "Talentos e Traços Especiais",
            "Pontuação de Insanidade e Corrupção",
            "Equipamentos, armas, implantes",
            "Influência e Lealdade (Rogue Trader)",
        ],
        "sheet_presets": [
            {"label": "Acolyte (Dark Heresy)", "fields": ["Carreira", "Insanidade", "Corrupção", "Ferimentos", "Armas"]},
            {"label": "Space Marine (Deathwatch)", "fields": ["Chapter", "Solo Mode", "Squad Mode", "Demeanour", "Special Abilities"]},
        ],
        "examples": {
            "tone": "Grimdark. Nenhuma vitória é limpa. A humanidade sobrevive à custa de tudo.",
            "setting": "Hive Worlds, nave-colméia Rogue Trader, planetas de guerra, estações da Inquisição.",
            "conflict": "Combate letal e brutal. Até granadas são perigosas para o usuário.",
            "advancement": "XP comprado livremente em perícias e características — sem classes rígidas.",
            "magic_system": "Poderes Psíquicos arriscados: sucesso pode invocar Daemons. Nunca é 'seguro'.",
            "social": "Influência como recurso. Interrogatório, extorsão, manipulação são ferramentas.",
            "exploration": "Investigação de heresia, rastreamento de cultistas, arqueologia tecnológica.",
            "character_creation": "Escolha mundo natal → antecedente → carreira. Cada combo dá perícias/talentos únicos.",
        },
        "inspirations": ["Warhammer 40K lore", "Event Horizon", "Aliens", "1984"],
        "links": [
            ("Cubicle 7 (atual publisher)", "https://cubicle7games.com/warhammer-40000-roleplay/"),
        ],
    },

    "Dark Heresy 2e": {
        "label": "Dark Heresy 2ª Edição",
        "genre": "Investigação, horror, paranoia — Inquisitório W40K",
        "description": (
            "Foco nos Acolytes do Inquisitório investigando heresia, cultos do Caos e ameaças xenos. "
            "Sistema percentual como WH40K RPG mas com mecânicas refinadas: "
            "Influence (recurso social), Subtlety (furtividade da célula), e Infamy of the Inquisitor. "
            "2ª Edição (Fantasy Flight Games) é considerada a mais polida do sistema."
        ),
        "core_mechanic": "d100 ≤ Perícia = sucesso. Graus de Sucesso determinam qualidade.",
        "dice": ["d5", "d10", "d100"],
        "attributes": [
            "Weapon Skill", "Ballistic Skill", "Strength", "Toughness",
            "Agility", "Intelligence", "Perception", "Willpower", "Fellowship"
        ],
        "resolution": "d100 ≤ Característica = sucesso",
        "health": "Wounds + Criticals por hit location. Sangramento, membros perdidos.",
        "magic": "Psíquicos com Psi Rating e poderes de disciplinas. Perils of the Warp sempre presentes.",
        "advancement": "XP gasto em Aptidões. Cada Aptidão reduz custo de perícias e talentos relacionados.",
        "combat": "Letal. Regras para cobertura, surpresa, moral. Armas de plasma superaquecem.",
        "character_sheet_elements": [
            "Nome, Homeworld, Background, Role",
            "9 Características base + bônus de homeworld",
            "Aptidões (definem especialização)",
            "Wounds, Fate Points, Insanity, Corruption",
            "Influence e Subtlety da célula",
            "Perícias com ranks, Talentos",
            "Equipamento, Armadura por localização",
        ],
        "sheet_presets": [
            {"label": "Investigador", "fields": ["Background", "Role", "Aptidões", "Influence", "Subtlety"]},
        ],
        "examples": {
            "tone": "Paranoico, investigativo. Ninguém é de confiança. A heresia muda de forma.",
            "setting": "Segtor Calixis — um setor decadente e cheio de segredos sombrios.",
            "conflict": "Infiltração, interrogatório, confronto tático. Evite combate aberto quando possível.",
            "advancement": "Aptidões criam 'builds' especializados. Ex: Aptidão 'Psíquico' + 'Conhecimento'.",
            "magic_system": "Psíquicos são ativos mas sempre perigosos — cada sessão pode mudar um personagem permanentemente.",
            "social": "Influence pool para chamar favores. Subtlety — se cair a 0, a célula queimou a identidade.",
            "exploration": "Investigação por pistas, testemunhas, documentos corrompidos e horrores cósmicos.",
            "character_creation": "Homeworld + Background + Role = matriz de Aptidões e habilidades iniciais únicas.",
        },
        "inspirations": ["Inquisitor (jogo de tabuleiro)", "Eisenhorn novels (Dan Abnett)", "Call of Cthulhu"],
        "links": [
            ("Dark Heresy 2e (PDF)", "https://www.drivethrurpg.com/product/130769/Dark-Heresy-Second-Edition"),
        ],
    },

    "Never Going Home": {
        "label": "Never Going Home",
        "genre": "Horror WWI, sobrenatural, guerra de trincheiras",
        "description": (
            "RPG indie de horror sobrenatural ambientado na Primeira Guerra Mundial. "
            "Os soldados são consumidos pela guerra e pelo Além. "
            "Sistema simples de d6 com 'Scars' (cicatrizes físicas e psicológicas) que modificam o personagem. "
            "A morte é esperada; o horror é inevitável. Voltarão para casa? Provavelmente não."
        ),
        "core_mechanic": (
            "Role um pool de d6s (atributo + perícia). Cada resultado ≥ 4 é um sucesso. "
            "1 sucesso = resultado parcial. 3+ sucessos = sucesso completo."
        ),
        "dice": ["d6"],
        "attributes": ["Físico", "Mental", "Social", "Espiritual"],
        "resolution": "Pool de d6 — conte sucessos (≥4)",
        "health": "Ferimentos físicos e Scars psicológicos. Acumular Scars muda como o personagem age.",
        "magic": (
            "O Além é real. Soldados desenvolvem Manifestações — poderes sombrios ligados às cicatrizes. "
            "Ex: Ver os mortos, sentir medo alheio, ignorar dor."
        ),
        "advancement": "Cicatrizes (Scars) funcionam como avanço — cada trauma muda o personagem.",
        "combat": "Brutal e rápido. Armas de WWI matam em 1-2 golpes. Não há combate heroico.",
        "character_sheet_elements": [
            "Nome, País, Patente, Motivação",
            "4 Atributos (d6 pool)",
            "Especialidades (perícias narrow)",
            "Scars (físicas e psíquicas — lista e efeitos)",
            "Manifestações do Além",
            "Equipamento de guerra",
            "O que te faz continuar lutando (âncora)",
        ],
        "sheet_presets": [
            {"label": "Soldado", "fields": ["Patente", "Físico", "Scars", "Manifestação", "Âncora"]},
        ],
        "examples": {
            "tone": "Horror pessoal, perda, desumanização. A guerra consome tudo.",
            "setting": "Trincheiras da França 1914-1918. Lama, ratos, gás, e algo pior nas sombras.",
            "conflict": "Mais sobrevivência e horror que combate heroico. Cada confronto tem custo.",
            "advancement": "Scars = crescimento torcido. Você fica mais poderoso mas cada vez menos humano.",
            "magic_system": "Manifestações surgem de trauma. São dons malditos, não poderes escolhidos.",
            "social": "Laços entre soldados (Bonds) são mecânicos — têm valor de dado para ajudar uns aos outros.",
            "exploration": "Patrulhas noturas, missões suicidas, anomalias sobrenaturais nas trincheiras.",
            "character_creation": "Histórico pessoal + motivação para lutar. O passado civil ainda pesa.",
        },
        "inspirations": ["All Quiet on the Western Front", "Paths of Glory", "Lovecraft", "1917 (filme)"],
        "links": [
            ("Never Going Home (Wet Ink Games)", "https://wetinkgames.com/never-going-home/"),
        ],
    },

    "Apocalypse World": {
        "label": "Apocalypse World",
        "genre": "Pós-apocalíptico, drama humano, ficção cinética",
        "description": (
            "RPG indie de Vincent Baker que fundou o movimento Powered by the Apocalypse (PbtA). "
            "Foco em drama humano num mundo pós-colapso. Mecânica central: Moves — ações com gatilhos narrativos. "
            "Role 2d6 + stat. 10+ = sucesso. 7-9 = sucesso com custo. 6- = falha e o MC faz um Move."
        ),
        "core_mechanic": "2d6 + Stat. 10+ sucesso, 7-9 sucesso parcial, 6- falha (MC age).",
        "dice": ["d6"],
        "attributes": ["Cool", "Hard", "Hot", "Sharp", "Weird"],
        "resolution": "2d6 + Stat: 10+ / 7-9 / 6-",
        "health": "Harm track (0-6). Harm 4+ = condições debilitantes. Harm 6 = morte.",
        "magic": (
            "O Weird stat acessa o 'psychic maelstrom' — a mente coletiva do apocalipse. "
            "Poderes não são mágica tradicional; são leituras do caos humano."
        ),
        "advancement": "Experiência por falhas e por 'fim de sessão'. Desbloqueia novos Moves.",
        "combat": "Moves de combate: Seize by Force, Go Aggro, Sucker Someone. Resultados sempre narrativos.",
        "character_sheet_elements": [
            "Nome, Look (aparência em palavras)",
            "Playbook (arquétipo): Battlebabe, Gunlugger, Hardholder, etc.",
            "5 Stats (-2 a +3)",
            "Harm track e condições",
            "Basic Moves (todos os personagens)",
            "Playbook Moves (específicos do arquétipo)",
            "Hx (história com outros PCs)",
            "Equipamentos e Barter (moeda pós-apo)",
        ],
        "sheet_presets": [
            {"label": "Hardholder", "fields": ["Holding", "Gang", "Moves de Holder", "Barter"]},
            {"label": "Battlebabe", "fields": ["Custom Weapons", "In-Brain Puppet Strings", "Cool Moves"]},
        ],
        "examples": {
            "tone": "Tenso, urgente, pessoal. Relacionamentos importam tanto quanto sobrevivência.",
            "setting": "Um mundo pós-apocalipse indefinido — cada grupo define o que aconteceu.",
            "conflict": "Moves tornam conflitos sempre interessantes — falha avança história, não a bloqueia.",
            "advancement": "Avançar desbloqueando Moves do Playbook ou de outros Playbooks.",
            "magic_system": "Psychic Maelstrom: leituras estranhas, manipulação de mentes, ecos do passado.",
            "social": "'Going Manipulation' (Hot) — convence alguém te fazendo uma promessa. Eles decidem.",
            "exploration": "Seizes, Reads (Sharp) para entender situações. O mundo responde aos personagens.",
            "character_creation": "Escolha o Playbook → nomeie → distribua Stats → defina Hx com outros PCs.",
        },
        "inspirations": ["Mad Max", "The Road", "Book of Eli", "Children of Men"],
        "links": [
            ("Apocalypse World (lulu)", "http://apocalypse-world.com/"),
            ("PbtA SRD", "https://pbta.wiki/"),
        ],
    },

    "Vampire: The Masquerade": {
        "label": "Vampire: The Masquerade (5ª Edição)",
        "genre": "Horror pessoal, drama político, sobrenatural gótico",
        "description": (
            "Jogo da linha World of Darkness. Você é um vampiro — imortal, poderoso e amaldiçoado. "
            "A Masquerade é o segredo da existência vampírica. A Fome é mecânica central na V5: "
            "vampiros são monstros que lutam contra sua natureza bestial (a Besta). "
            "Sistema de pool de d10s com fome que substitui dados normais por Hunger Dice."
        ),
        "core_mechanic": (
            "Pool de d10s (Atributo + Habilidade). Cada ≥6 = sucesso. "
            "Críticos (2 d10s com 10) = sucesso extra. Hunger Dice: resultados 1 = Bestial Failure, "
            "10 = Messy Critical. A Fome (1-5) contamina a rolagem."
        ),
        "dice": ["d10"],
        "attributes": [
            "Força", "Destreza", "Vigor",         # Físicos
            "Carisma", "Manipulação", "Aparência",  # Sociais
            "Percepção", "Inteligência", "Raciocínio"  # Mentais
        ],
        "resolution": "Pool d10 (≥6 = sucesso) com Hunger Dice",
        "health": "Saúde (boxes). Vampiros também têm Willpower. Aggravated damage não cura facilmente.",
        "magic": (
            "Disciplines (Poderes vampíricos por clã): Dominate, Presence, Animalism, Celerity, "
            "Protean, Obfuscate, Potence, Fortitude, Auspex, Blood Sorcery, etc."
        ),
        "advancement": "XP gasto em Atributos, Habilidades, Disciplines e Backgrounds.",
        "combat": "Rápido e letal. Vampiros são superiores a humanos. Aggravated damage por fogo/luz solar.",
        "character_sheet_elements": [
            "Nome mortal e vampírico, Clã, Geração, Sire",
            "Predator Type (como você bebe sangue)",
            "3 grupos de Atributos × 3 = 9 atributos",
            "Habilidades (Skills) em 3 grupos",
            "Disciplines (poderes do Clã)",
            "Backgrounds e Méritos",
            "Hunger (1-5), Humanity (0-10)",
            "Saúde, Willpower",
            "Convictions e Touchstones (âncoras de humanidade)",
            "Chronicle Tenets e Coterie Sheet",
        ],
        "sheet_presets": [
            {"label": "Brujah (Rebelde)", "fields": ["Potence", "Celerity", "Presence", "Frenzy threshold"]},
            {"label": "Tremere (Mago)", "fields": ["Auspex", "Blood Sorcery", "Dominate", "Coterie rituals"]},
            {"label": "Nosferatu (Espião)", "fields": ["Obfuscate", "Animalism", "Potence", "Informants"]},
        ],
        "examples": {
            "tone": "Gothic, pessoal, político. A maior ameaça é você mesmo e os outros vampiros.",
            "setting": "Qualquer cidade moderna. Sociedade vampírica (Camarilla, Anarquistas, Sabbat).",
            "conflict": "Jogatina política, traição, fome não controlada, dilemas morais.",
            "advancement": "XP por sessão. A Humanity cai por atos de monstruosidade — sem XP que recupere.",
            "magic_system": "Disciplines são poderes específicos do Clã. Blood Sorcery (Tremere) é mais versátil.",
            "social": "Dominate (controla mentes), Presence (atrai/aterroriza). Política vampírica é cruel.",
            "exploration": "Investigar a própria morte, conspiração da Camarilla, segredos de séculos.",
            "character_creation": "Escolha Clã → Predator Type → distribua atributos (7/5/3) → habilidades (8/8) → 3 Disciplines.",
        },
        "inspirations": ["Interview with the Vampire", "True Blood", "What We Do in the Shadows", "Bram Stoker's Dracula"],
        "links": [
            ("World of Darkness oficial", "https://www.worldofdarkness.com/"),
            ("V5 SRD (Paradox)", "https://www.worldofdarkness.com/dark-pack"),
        ],
    },

    "Deadlands": {
        "label": "Deadlands: The Weird West",
        "genre": "Faroeste sobrenatural, horror americano, steampunk",
        "description": (
            "Faroeste alternativo: é 1879, a Guerra Civil ainda não acabou, mortos-vivos vagam pelo Oeste, "
            "e 'ghost rock' (minério sobrenatural) alimenta uma revolução tecnocientífica torta. "
            "Usa Savage Worlds como base. Personagens têm Arcanos (poderes mágicos do Weird West): "
            "Hucksters (mágicos jogadores de cartas), Shamans (nativos com espíritos), "
            "Preachers (fé divina) e Mad Scientists (ciência louca com ghost rock)."
        ),
        "core_mechanic": (
            "Savage Worlds: Role o dado da Trait (d4 a d12) + Wild Die (d6) se for Wild Card (personagem principal). "
            "Use o maior resultado. Atingiu o Target Number (TN=4) = sucesso. "
            "Cada 4 acima = Raise (sucesso extra)."
        ),
        "dice": ["d4", "d6", "d8", "d10", "d12"],
        "attributes": ["Agilidade", "Astúcia", "Espírito", "Força", "Vigor"],
        "resolution": "Dado da Trait vs TN 4 (+ Wild Die para Wild Cards)",
        "health": "Wounds (0-3 para PCs), Shaken status. 3 Wounds = Incapacitado.",
        "magic": (
            "Arcanos: Hucksters usam baralho de cartas para magias. Shamans invocam espíritos. "
            "Mad Scientists constroem dispositivos absurdos com ghost rock (que podem explodir)."
        ),
        "advancement": "Advances: suba Traits, desbloqueie Edges, melhore perícias.",
        "combat": "Rápido e cinematográfico. Jokers na iniciativa = ações extras. Cartas para iniciativa.",
        "character_sheet_elements": [
            "Nome, Conceito, Denominação (Huckster, Preacher, etc.)",
            "5 Atributos (d4 a d12)",
            "Perícias (d4 a d12)",
            "Edges (vantagens) e Hindrances (desvantagens)",
            "Pace, Parry, Toughness",
            "Wounds, Fatigue, Bennies",
            "Arcano e Poderes (se aplicável)",
            "Equipamentos do Faroeste (colt, rifle, laço...)",
            "Bounties e Deeds (reputação)",
        ],
        "sheet_presets": [
            {"label": "Huckster", "fields": ["Hexes", "Baralho pessoal", "Faith in the Hunting Grounds"]},
            {"label": "Lawman", "fields": ["Intimidation", "Shooting", "Notice", "Reputation"]},
            {"label": "Mad Scientist", "fields": ["Weird Science Power", "Ghost Rock devices", "Gizmos"]},
        ],
        "examples": {
            "tone": "Ação cinematográfica, horror pulp, humor negro. Herói improvável num mundo torto.",
            "setting": "Weird West: Arizona, Nevada, Texas. Cidades mineiras, ferrovias, terras nativas.",
            "conflict": "Duelos ao amanhecer, perseguições de trem, hordas de mortos-vivos.",
            "advancement": "Ranks: Novice → Seasoned → Veteran → Heroic → Legendary. Advances por rank.",
            "magic_system": "Hucksters apostam com o diabo para lançar magias. Shamans honram pactos espirituais.",
            "social": "Persuasion, Intimidation, Taunt. Reputação importa — Heroes têm Bounties.",
            "exploration": "Mapas do Weird West, rumores em saloons, pistoleiros rivais, segredos do governo.",
            "character_creation": "Distribua pontos em Atributos + Perícias. Escolha Edges/Hindrances. Defina Arcano se quiser.",
        },
        "inspirations": ["Jonah Hex", "True Grit", "Bone Tomahawk", "From Dusk Till Dawn"],
        "links": [
            ("Pinnacle Entertainment (Deadlands)", "https://peginc.com/deadlands/"),
            ("Savage Worlds SRD", "https://www.pegfansite.com/"),
        ],
    },

    "Blades in the Dark": {
        "label": "Blades in the Dark",
        "genre": "Heist urbano, fantasia vitoriana sombria, crime",
        "description": (
            "RPG de John Harper. Sua gang de criminosos opera em Doskvol, cidade industrial fantasiosa "
            "rodeada por raios elétricos para conter fantasmas. "
            "Mecânica central: Scores (missões) com Phase de Engajamento. "
            "Flashbacks narrativos durante a missão para 'retroativamente planejar'. "
            "Sistema de posição e efeito: você define COMO age, o risco é negociado."
        ),
        "core_mechanic": (
            "Pool de d6 (ação). Role, use o maior. "
            "6 = sucesso. 4-5 = sucesso com complicação. 1-3 = falha com consequências. "
            "Zero dados = role 2d6, use o menor."
        ),
        "dice": ["d6"],
        "attributes": ["Insight", "Prowess", "Resolve"],
        "resolution": "Pool d6 — maior resultado: 6 / 4-5 / 1-3",
        "health": "Harm (1-3 por nível de gravidade). Stress (0-9). Trauma ao encher Stress.",
        "magic": (
            "Attunement — acesso ao mundo fantasmagórico (o Vazio). Ghosts, Demons, Leviathans. "
            "Arquétipos: Whisper (ocultista), Ghost Touched, artefatos eletro-plasmáticos."
        ),
        "advancement": "XP por ações e Beliefs. Crew também avança separadamente.",
        "combat": "Posição define risco. Sem HP bar — cada Hit tem consequência narrativa imediata.",
        "character_sheet_elements": [
            "Nome, Alias, Looks",
            "Playbook: Cutter, Hound, Leech, Lurk, Slide, Spider, Whisper",
            "3 Atributos (Insight/Prowess/Resolve) com ações (d1-d4)",
            "Stress e Trauma",
            "Harm (3 níveis: menor/médio/severo)",
            "Special Abilities do Playbook",
            "Items (slots de carga: leve/pesada)",
            "Friends & Rivals (lista de contatos)",
            "XP triggers por Belief/Playbook",
            "Crew Sheet (separada): Turf, Reputation, Heat, Wanted Level",
        ],
        "sheet_presets": [
            {"label": "Cutter (Combatente)", "fields": ["Skirmish", "Wreck", "Bodyguard", "Vigor ability"]},
            {"label": "Spider (Mastermind)", "fields": ["Command", "Consort", "Sway", "Crew advancement"]},
            {"label": "Whisper (Ocultista)", "fields": ["Attunement", "Ghost field", "Arcane abilities"]},
        ],
        "examples": {
            "tone": "Noir criminal, atmosfera vitoriana opressiva. Cada Score tem custo pessoal.",
            "setting": "Doskvol: cidade eterna sob raios elétricos, portos, distritos criminosos, casas de ópio.",
            "conflict": "Heist tático com flashbacks. Posição é tudo — Desperate vs Controlled.",
            "advancement": "XP por tentar ações com baixo rank e por cumprir Beliefs. Crew sobe separado.",
            "magic_system": "Fantasmas são reais e perigosos. Attunement abre o Vazio. Artefatos raros e instáveis.",
            "social": "Consort e Sway para relações. Faction clocks determinam alianças políticas da cidade.",
            "exploration": "Gather Info antes do Score. Flashbacks durante. Downtime entre missions.",
            "character_creation": "Escolha Playbook → distribua pontos de ação → escolha Special Abilities → defina contatos.",
        },
        "inspirations": ["Dishonored", "Peaky Blinders", "The Lies of Locke Lamora", "From Hell"],
        "links": [
            ("Blades in the Dark SRD", "https://bladesinthedark.com/"),
            ("John Harper Itch.io", "https://johnharper.itch.io/blades-in-the-dark"),
        ],
    },
}

# Lista ordenada para o wizard
BASE_SYSTEM_KEYS = list(BASE_SYSTEMS.keys())


def get_system(key: str) -> dict:
    return BASE_SYSTEMS.get(key, {})


def get_example(system_key: str, topic: str) -> str:
    """Retorna o exemplo de um tópico para o sistema dado."""
    sys_data = BASE_SYSTEMS.get(system_key, {})
    return sys_data.get("examples", {}).get(topic, "")


def get_all_labels() -> list:
    """Retorna lista de (key, label) para exibição."""
    return [(k, v["label"]) for k, v in BASE_SYSTEMS.items()]
