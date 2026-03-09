"""
DM - Dungeon Music
Definição dos tipos de campo para a ficha de personagem.
Usado tanto pelo wizard quanto pelo exportador.
"""

# Tipos de campo suportados na ficha
FIELD_TYPES = {
    "text":       "Texto curto",
    "text_long":  "Texto longo (área)",
    "number":     "Número",
    "checkbox":   "Checkbox (sim/não)",
    "track":      "Trilha de marcação (□□□□□)",
    "dots":       "Pontos (●●●○○)",
    "slots":      "Slots (lista de caixas)",
    "list":       "Lista de itens",
    "table":      "Tabela (linhas e colunas)",
    "image":      "Retrato / Imagem",
    "divider":    "Separador / Título de seção",
}

# Campos pré-definidos com seus tipos e configurações padrão
PREDEFINED_FIELDS = {
    "nome":          {"label": "Nome",                "type": "text",     "width": 2},
    "jogador":       {"label": "Jogador",             "type": "text",     "width": 1},
    "classe_arq":    {"label": "Classe / Arquétipo",  "type": "text",     "width": 1},
    "nivel_rank":    {"label": "Nível / Rank",        "type": "number",   "width": 1, "min": 1, "max": 30},
    "raca_origem":   {"label": "Raça / Origem",       "type": "text",     "width": 1},
    "antecedente":   {"label": "Antecedente",         "type": "text",     "width": 1},
    "alinhamento":   {"label": "Alinhamento",         "type": "text",     "width": 1},
    "aparencia":     {"label": "Aparência",           "type": "text_long","width": 2},
    "imagem":        {"label": "Retrato",             "type": "image",    "width": 1},

    "atributos":     {"label": "Atributos",           "type": "table",    "width": 2,
                      "columns": ["Atributo", "Valor", "Mod"]},
    "modificadores": {"label": "Modificadores",       "type": "table",    "width": 1,
                      "columns": ["Atributo", "Mod"]},
    "pericias":      {"label": "Perícias",            "type": "table",    "width": 2,
                      "columns": ["Perícia", "Valor", "Prof"]},
    "proficiencias": {"label": "Proficiências",       "type": "text_long","width": 2},
    "salvaguardas":  {"label": "Salvaguardas",        "type": "table",    "width": 1,
                      "columns": ["Tipo", "Bônus"]},

    "pv_hp":         {"label": "Pontos de Vida",      "type": "track",    "width": 1, "max": 30},
    "ca_defesa":     {"label": "CA / Defesa",         "type": "number",   "width": 1},
    "iniciativa":    {"label": "Iniciativa",          "type": "number",   "width": 1},
    "wounds":        {"label": "Ferimentos",          "type": "track",    "width": 1, "max": 6,
                      "labels": ["Leve", "Médio", "Severo"]},
    "stress":        {"label": "Stress",              "type": "track",    "width": 1, "max": 9},
    "ataques":       {"label": "Ataques",             "type": "table",    "width": 2,
                      "columns": ["Arma", "Bônus", "Dano", "Tipo"]},

    "mana_energia":  {"label": "Mana / Energia",      "type": "track",    "width": 1, "max": 20},
    "slots_magia":   {"label": "Slots de Magia",      "type": "table",    "width": 2,
                      "columns": ["Círculo", "Total", "Gastos"]},
    "fate_points":   {"label": "Pontos de Destino",   "type": "track",    "width": 1, "max": 5},
    "xp_counter":    {"label": "XP",                  "type": "number",   "width": 1},

    "poderes":       {"label": "Magias / Poderes",    "type": "list",     "width": 2},
    "disciplines":   {"label": "Disciplines",         "type": "table",    "width": 2,
                      "columns": ["Discipline", "Nível", "Poderes"]},
    "inventario":    {"label": "Inventário",          "type": "list",     "width": 2},
    "moedas":        {"label": "Riqueza / Moedas",    "type": "table",    "width": 1,
                      "columns": ["Tipo", "Quantidade"]},

    "tracos":        {"label": "Traços de Personalidade", "type": "text_long", "width": 2},
    "vinculos":      {"label": "Vínculos",            "type": "list",     "width": 1},
    "ideais":        {"label": "Ideais / Beliefs",    "type": "text_long","width": 1},
    "defeitos":      {"label": "Defeitos",            "type": "text_long","width": 1},
    "faccao":        {"label": "Facção / Lealdade",   "type": "text",     "width": 1},
    "notas":         {"label": "Notas",               "type": "text_long","width": 2},

    "insanidade":    {"label": "Insanidade",          "type": "track",    "width": 1, "max": 10},
    "humanidade":    {"label": "Humanidade",          "type": "track",    "width": 1, "max": 10},
    "hunger_fome":   {"label": "Fome (Hunger)",       "type": "track",    "width": 1, "max": 5},
    "clocks":        {"label": "Relógios",            "type": "table",    "width": 1,
                      "columns": ["Clock", "Segmentos", "Progresso"]},
    "reputacao":     {"label": "Reputação",           "type": "number",   "width": 1},
    "hx_historia":   {"label": "Hx / História",       "type": "table",    "width": 2,
                      "columns": ["Personagem", "Hx", "Notas"]},
}


def build_field_list(selected_keys: list, custom_fields: list = None) -> list:
    """
    Retorna a lista de campos para a ficha com base nas chaves selecionadas.
    custom_fields: lista de dicts com {label, type, width, ...}
    """
    fields = []
    for key in selected_keys:
        fd = PREDEFINED_FIELDS.get(key)
        if fd:
            fields.append({"key": key, **fd})
    if custom_fields:
        for cf in custom_fields:
            fields.append({"key": f"custom_{cf['label'].lower().replace(' ', '_')}", **cf})
    return fields


def suggest_fields_from_answers(answers: dict) -> list:
    """
    Sugere uma lista de chaves de campos para a ficha com base nas respostas
    anteriores do wizard. Retorna lista ordenada de chaves de PREDEFINED_FIELDS.
    """
    suggested = []

    def add(*keys):
        for k in keys:
            if k not in suggested and k in PREDEFINED_FIELDS:
                suggested.append(k)

    # ── Identidade (sempre presentes) ──────────────────────────────────
    add("nome", "jogador")

    base = answers.get("base_system", "")
    arch = answers.get("archetypes", "")
    health = answers.get("health_system", "")
    magic = answers.get("magic_system") or []
    skills = answers.get("skills_system", "")
    traits = answers.get("special_traits") or []
    adv = answers.get("advancement", "")
    combat = answers.get("combat_style") or []

    # ── Arquétipo / Classe ─────────────────────────────────────────────
    if arch and arch != "livre":
        add("classe_arq")

    # ── Nível / Rank ───────────────────────────────────────────────────
    if adv in ("xp_niveis", "advances"):
        add("nivel_rank")
    elif arch in ("classes_rigidas", "classes_multi", "career_system", "playbooks"):
        add("nivel_rank")

    # ── Origem / Antecedente ───────────────────────────────────────────
    if "backgrounds" in traits or base == "D&D 5e":
        add("raca_origem", "antecedente")
    elif base in ("Warhammer 40.000 RPG", "Dark Heresy 2e"):
        add("raca_origem")  # homeworld

    # ── Atributos sempre presentes ─────────────────────────────────────
    add("atributos")
    if answers.get("attributes_type") not in ("sem_atributos",):
        add("modificadores")

    # ── Perícias ───────────────────────────────────────────────────────
    if skills and skills != "free_skill":
        add("pericias")
    if skills == "lista_fixa" or "feitos_feats" in traits:
        add("proficiencias")
    if base == "D&D 5e":
        add("salvaguardas")

    # ── Combate ────────────────────────────────────────────────────────
    if "turno_iniciativa" in combat:
        add("iniciativa")
    add("ca_defesa")
    if combat:
        add("ataques")

    # ── Saúde ──────────────────────────────────────────────────────────
    if health == "hp_classico":
        add("pv_hp")
    elif health == "hp_localizado":
        add("pv_hp", "wounds")
    elif health == "wound_track":
        add("wounds")
    elif health == "harm_stress":
        add("wounds", "stress")
    elif health == "conditions":
        add("stress")
    else:
        add("pv_hp")

    # ── Magia / Poderes ────────────────────────────────────────────────
    if magic and "sem_magia" not in magic:
        add("poderes")
    if "slots_spells" in magic:
        add("slots_magia")
    if "mana_pool" in magic:
        add("mana_energia")
    if "disciplines" in magic:
        add("disciplines")
    if "psionics" in magic or "tech_powers" in magic:
        add("poderes")

    # ── Recursos / Pontos ─────────────────────────────────────────────
    if adv in ("xp_niveis", "xp_livre", "advances", "moves_xp"):
        add("xp_counter")
    if base in ("Deadlands", "Never Going Home", "Apocalypse World"):
        add("fate_points")
    if base == "D&D 5e":
        add("fate_points")  # Inspiration

    # ── Traços narrativos ─────────────────────────────────────────────
    if "meritos_falhas" in traits or base == "D&D 5e":
        add("tracos", "ideais", "vinculos", "defeitos")
    elif "backgrounds" in traits:
        add("tracos", "antecedente")
    if "traumas_scars" in traits or base == "Never Going Home":
        add("insanidade")

    # ── Especiais por sistema base ─────────────────────────────────────
    if base == "Vampire: The Masquerade":
        add("hunger_fome", "humanidade", "hx_historia", "faccao")
    elif base == "Blades in the Dark":
        add("stress", "clocks", "hx_historia", "reputacao")
    elif base == "Apocalypse World":
        add("hx_historia", "stress")
    elif base in ("Warhammer 40.000 RPG", "Dark Heresy 2e"):
        add("insanidade", "faccao")
    elif base == "Deadlands":
        add("reputacao", "faccao")
    elif base == "Never Going Home":
        add("insanidade", "vinculos")

    # ── Inventário / Equipamentos (quase sempre útil) ──────────────────
    add("inventario", "moedas")

    # ── Aparência / Imagem ─────────────────────────────────────────────
    add("aparencia")

    # ── Notas livres ───────────────────────────────────────────────────
    add("notas")

    return suggested
