"""
DM - Dungeon Music
Painel do Criador de Sistemas de RPG.

Layout:
  ┌─[Session Bar]──────────────────────────────────────────────────────────┐
  │ ┌─[Sidebar: fases/progresso]─┐  ┌─[Content: passo atual]─────────────┐│
  │ │  Fase 1: Fundação  ✓       │  │  [Título do passo]                  ││
  │ │  Fase 2: Mecânicas  ●      │  │  [Contexto do sistema base]         ││
  │ │  Fase 3: Personagens       │  │  [Widget de resposta]               ││
  │ │  ...                       │  │                                      ││
  │ └────────────────────────────┘  │  [< Anterior]         [Próximo >]   ││
  │                                  └────────────────────────────────────┘│
  └────────────────────────────────────────────────────────────────────────┘
"""

import tkinter as tk
from tkinter import ttk, messagebox, simpledialog, filedialog
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.ui.theme import COLORS
from src.i18n.translator import t
from src.system_creator.system_manager import SystemManager
from src.system_creator.wizard_steps import (
    WIZARD_STEPS, TOTAL_STEPS, PHASES,
    get_step, should_show_step, count_visible_steps,
)
from src.system_creator.base_systems import get_example, get_all_labels, BASE_SYSTEMS
from src.system_creator.sheet_fields import build_field_list, PREDEFINED_FIELDS, suggest_fields_from_answers
from src.system_creator.exporter import (
    export, PIL_AVAILABLE, REPORTLAB_AVAILABLE, DOCX_AVAILABLE
)

# ─────────────────────────────────────────────────────────────────────────────
# TUTORIAL
# ─────────────────────────────────────────────────────────────────────────────

TUTORIAL_TEXT = """🗺  TUTORIAL — CRIADOR DE SISTEMAS

Como funciona:
  1. Crie ou carregue um sistema na barra superior.
  2. Siga o wizard linear passo a passo (22 perguntas em 6 fases).
  3. A cada passo você vê um exemplo do sistema base que escolheu.
  4. Pode salvar e continuar depois — o progresso é mantido.
  5. No final, exporte em TXT (documento), PNG (ficha) ou PDF.

Fases do Wizard:
  ① Fundação    — base, nome, gênero
  ② Mecânicas   — dados, resolução, magia, combate, progressão
  ③ Personagens — atributos, perícias, arquétipos, traços
  ④ Mundo & Lore — cenário, facções, temas (opcional)
  ⑤ Ficha       — layout e campos da ficha de personagem
  ⑥ Conclusão   — formatos de exportação e notas finais

Dicas:
  • Campos marcados com * são obrigatórios.
  • Você pode voltar e mudar respostas anteriores a qualquer momento.
  • O exemplo em amarelo mostra como o sistema base escolhido resolve o mesmo problema.
  • Campos de lista aceitam Enter para adicionar itens.
  • Na ficha, largura '2' ocupa toda a linha; '1' ocupa metade.
"""


def _show_tutorial(parent):
    win = tk.Toplevel(parent)
    win.title(t("creator.tutorial.title"))
    win.geometry("640x520")
    win.configure(bg=COLORS["bg"])
    win.grab_set()

    txt = tk.Text(win, wrap="word", bg=COLORS["surface"], fg=COLORS["text"],
                  font=("Segoe UI", 10), relief="flat", padx=16, pady=12, bd=0)
    txt.pack(fill="both", expand=True, padx=16, pady=(16, 8))
    txt.insert("1.0", TUTORIAL_TEXT)
    txt.config(state="disabled")

    ttk.Button(win, text=t("creator.tutorial.close_btn"), command=win.destroy).pack(pady=(0, 12))


# ─────────────────────────────────────────────────────────────────────────────
# SESSION BAR
# ─────────────────────────────────────────────────────────────────────────────

class _SessionBar(ttk.Frame):
    def __init__(self, parent, mgr: SystemManager, on_load, on_create, on_delete, on_rename, on_tutorial):
        super().__init__(parent)
        self._mgr = mgr
        self._on_load = on_load
        self._on_create = on_create
        self._on_delete = on_delete
        self._on_rename = on_rename

        self._var = tk.StringVar()

        # Combo
        ttk.Label(self, text=t("creator.session.system_label")).pack(side="left", padx=(0, 4))
        self._combo = ttk.Combobox(self, textvariable=self._var, width=24, state="readonly")
        self._combo.pack(side="left", padx=(0, 8))
        self._combo.bind("<<ComboboxSelected>>", lambda e: on_load(self._var.get()))

        ttk.Button(self, text=t("creator.session.new_btn"),     command=on_create,  width=8).pack(side="left", padx=2)
        ttk.Button(self, text=t("creator.session.rename_btn"),  command=on_rename,  width=9).pack(side="left", padx=2)
        ttk.Button(self, text=t("creator.session.delete_btn"),  command=on_delete,  width=8).pack(side="left", padx=2)
        ttk.Button(self, text=t("creator.session.tutorial_btn"),command=on_tutorial,width=10).pack(side="left", padx=(12, 0))

        self.refresh()

    def refresh(self):
        systems = self._mgr.list_systems()
        self._combo["values"] = systems
        if systems and self._var.get() not in systems:
            self._var.set(systems[0])

    def current(self) -> str:
        return self._var.get()

    def set_current(self, name: str):
        self._var.set(name)


# ─────────────────────────────────────────────────────────────────────────────
# SIDEBAR DE PROGRESSO
# ─────────────────────────────────────────────────────────────────────────────

class _ProgressSidebar(tk.Frame):
    def __init__(self, parent):
        super().__init__(parent, bg=COLORS["surface"], width=200)
        self.pack_propagate(False)
        self._items = {}   # phase_index → (frame, label_widget)
        self._build()

    def _build(self):
        ttk.Label(self, text=t("creator.sidebar.progress"), style="Subtitle.TLabel",
                  background=COLORS["surface"]).pack(pady=(12, 8), padx=8, anchor="w")

        for idx, phase_name in PHASES:
            row = tk.Frame(self, bg=COLORS["surface"])
            row.pack(fill="x", padx=8, pady=2)

            bullet = tk.Label(row, text="○", bg=COLORS["surface"],
                               fg=COLORS["text_muted"], font=("Segoe UI", 12))
            bullet.pack(side="left")

            lbl = tk.Label(row, text=t(f"creator.phases.{idx}"), bg=COLORS["surface"],
                            fg=COLORS["text_muted"], font=("Segoe UI", 10), anchor="w")
            lbl.pack(side="left", padx=(4, 0), fill="x", expand=True)

            self._items[idx] = (row, bullet, lbl)

    def update_state(self, current_phase: int, completed_phases: set):
        for idx, (row, bullet, lbl) in self._items.items():
            if idx in completed_phases:
                bullet.config(text="✓", fg=COLORS["success"])
                lbl.config(fg=COLORS["success"], font=("Segoe UI", 10, "bold"))
                row.config(bg=COLORS["surface"])
            elif idx == current_phase:
                bullet.config(text="●", fg=COLORS["primary"])
                lbl.config(fg=COLORS["primary"], font=("Segoe UI", 10, "bold"))
                row.config(bg=COLORS.get("surface_alt", COLORS["card"]))
            else:
                bullet.config(text="○", fg=COLORS["text_muted"])
                lbl.config(fg=COLORS["text_muted"], font=("Segoe UI", 10))
                row.config(bg=COLORS["surface"])


# ─────────────────────────────────────────────────────────────────────────────
# WIDGETS DE RESPOSTA
# ─────────────────────────────────────────────────────────────────────────────

class _ChoiceWidget(ttk.Frame):
    """Botões de radio para escolha única."""
    def __init__(self, parent, options: list):
        super().__init__(parent)
        self._var = tk.StringVar()
        for value, label, *rest in options:
            desc = rest[0] if rest else ""
            row = ttk.Frame(self)
            row.pack(fill="x", pady=2)
            rb = ttk.Radiobutton(row, text=label, variable=self._var, value=value)
            rb.pack(side="left")
            if desc:
                ttk.Label(row, text=f"  — {desc}", foreground=COLORS["text_muted"],
                           font=("Segoe UI", 9)).pack(side="left")

    def get(self):
        return self._var.get() or None

    def set(self, value):
        self._var.set(value or "")


class _ChoiceCardsWidget(tk.Frame):
    """Cards clicáveis para escolha do sistema base."""
    def __init__(self, parent, options: list):
        super().__init__(parent, bg=COLORS["bg"])
        self._var = tk.StringVar()
        self._cards = {}

        # Grid 2 colunas
        canvas = tk.Canvas(self, bg=COLORS["bg"], highlightthickness=0, height=320)
        sb = ttk.Scrollbar(self, orient="vertical", command=canvas.yview)
        canvas.configure(yscrollcommand=sb.set)
        sb.pack(side="right", fill="y")
        canvas.pack(side="left", fill="both", expand=True)

        inner = tk.Frame(canvas, bg=COLORS["bg"])
        canvas.create_window((0, 0), window=inner, anchor="nw")

        def _on_configure(e):
            canvas.configure(scrollregion=canvas.bbox("all"))

        inner.bind("<Configure>", _on_configure)

        for i, (value, label, desc) in enumerate(options):
            col = i % 2
            row_idx = i // 2
            card = tk.Frame(inner, bg=COLORS["card"], relief="flat",
                             cursor="hand2", padx=12, pady=10)
            card.grid(row=row_idx, column=col, padx=6, pady=6, sticky="nsew")
            inner.columnconfigure(col, weight=1)

            title_lbl = tk.Label(card, text=label, bg=COLORS["card"],
                                  fg=COLORS["text"], font=("Segoe UI", 11, "bold"), anchor="w")
            title_lbl.pack(fill="x")
            desc_lbl = tk.Label(card, text=desc, bg=COLORS["card"],
                                 fg=COLORS["text_muted"], font=("Segoe UI", 9), anchor="w",
                                 wraplength=250)
            desc_lbl.pack(fill="x")

            self._cards[value] = (card, title_lbl, desc_lbl)

            def _click(v=value):
                self._var.set(v)
                self._refresh_cards()

            for w in [card, title_lbl, desc_lbl]:
                w.bind("<Button-1>", lambda e, v=value: _click(v))

        self._canvas = canvas
        self._inner = inner

    def _refresh_cards(self):
        selected = self._var.get()
        for value, (card, tl, dl) in self._cards.items():
            if value == selected:
                card.config(bg=COLORS["primary"])
                tl.config(bg=COLORS["primary"], fg="#ffffff")
                dl.config(bg=COLORS["primary"], fg="#e0d8ff")
            else:
                card.config(bg=COLORS["card"])
                tl.config(bg=COLORS["card"], fg=COLORS["text"])
                dl.config(bg=COLORS["card"], fg=COLORS["text_muted"])

    def get(self):
        return self._var.get() or None

    def set(self, value):
        self._var.set(value or "")
        self._refresh_cards()


class _MultiCheckWidget(ttk.Frame):
    """Checkboxes para seleção múltipla."""
    def __init__(self, parent, options: list):
        super().__init__(parent)
        self._vars = {}

        canvas = tk.Canvas(self, bg=COLORS["bg"], highlightthickness=0, height=260)
        sb = ttk.Scrollbar(self, orient="vertical", command=canvas.yview)
        canvas.configure(yscrollcommand=sb.set)
        sb.pack(side="right", fill="y")
        canvas.pack(side="left", fill="both", expand=True)

        inner = ttk.Frame(canvas)
        canvas.create_window((0, 0), window=inner, anchor="nw")
        inner.bind("<Configure>", lambda e: canvas.configure(scrollregion=canvas.bbox("all")))

        for value, label, desc in options:
            var = tk.BooleanVar()
            self._vars[value] = var
            row = ttk.Frame(inner)
            row.pack(fill="x", pady=1)
            ttk.Checkbutton(row, text=label, variable=var).pack(side="left")
            if desc:
                ttk.Label(row, text=f"— {desc}", foreground=COLORS["text_muted"],
                           font=("Segoe UI", 9)).pack(side="left", padx=4)

        canvas.bind("<Enter>", lambda e: canvas.bind_all("<MouseWheel>",
                    lambda ev: canvas.yview_scroll(-1 * (ev.delta // 120), "units")))
        canvas.bind("<Leave>", lambda e: canvas.unbind_all("<MouseWheel>"))

    def get(self):
        return [v for v, var in self._vars.items() if var.get()]

    def set(self, values):
        values = values or []
        for v, var in self._vars.items():
            var.set(v in values)


class _TextWidget(ttk.Frame):
    """Campo de texto curto."""
    def __init__(self, parent, placeholder: str = ""):
        super().__init__(parent)
        self._entry = ttk.Entry(self, font=("Segoe UI", 11), width=48)
        self._entry.pack(fill="x", pady=4)
        if placeholder:
            self._entry.insert(0, placeholder)

    def get(self):
        v = self._entry.get().strip()
        return v if v else None

    def set(self, value):
        self._entry.delete(0, "end")
        if value:
            self._entry.insert(0, value)


class _TextLongWidget(ttk.Frame):
    """Área de texto longa."""
    def __init__(self, parent):
        super().__init__(parent)
        self._text = tk.Text(self, height=7, wrap="word", font=("Segoe UI", 10),
                              bg=COLORS["surface"], fg=COLORS["text"],
                              insertbackground=COLORS["text"], relief="flat",
                              padx=8, pady=6, bd=1)
        self._text.pack(fill="both", expand=True)
        sb = ttk.Scrollbar(self, orient="vertical", command=self._text.yview)
        self._text.configure(yscrollcommand=sb.set)
        sb.pack(side="right", fill="y")

    def get(self):
        v = self._text.get("1.0", "end-1c").strip()
        return v if v else None

    def set(self, value):
        self._text.delete("1.0", "end")
        if value:
            self._text.insert("1.0", value)


class _ListEditorWidget(tk.Frame):
    """Editor de lista (adicionar/remover itens)."""
    def __init__(self, parent, placeholder: str = "Digite e pressione Enter ou +"):
        super().__init__(parent, bg=COLORS["bg"])
        self._items = []

        top = ttk.Frame(self)
        top.pack(fill="x", pady=(0, 4))

        self._entry = ttk.Entry(top, font=("Segoe UI", 10), width=36)
        self._entry.pack(side="left", fill="x", expand=True, padx=(0, 4))
        self._entry.bind("<Return>", lambda e: self._add())

        ttk.Button(top, text="+", command=self._add, width=3).pack(side="left")

        list_frame = tk.Frame(self, bg=COLORS["surface"], relief="flat", bd=1)
        list_frame.pack(fill="both", expand=True)

        self._listbox = tk.Listbox(list_frame, height=6,
                                    bg=COLORS["surface"], fg=COLORS["text"],
                                    selectbackground=COLORS["primary"],
                                    font=("Segoe UI", 10), relief="flat", bd=0)
        self._listbox.pack(side="left", fill="both", expand=True)
        sb = ttk.Scrollbar(list_frame, orient="vertical", command=self._listbox.yview)
        self._listbox.config(yscrollcommand=sb.set)
        sb.pack(side="right", fill="y")

        ttk.Button(self, text="Remover selecionado", command=self._remove).pack(anchor="e", pady=2)

    def _add(self):
        val = self._entry.get().strip()
        if val:
            self._items.append(val)
            self._listbox.insert("end", val)
            self._entry.delete(0, "end")

    def _remove(self):
        sel = self._listbox.curselection()
        if sel:
            idx = sel[0]
            self._listbox.delete(idx)
            del self._items[idx]

    def get(self):
        return list(self._items) if self._items else None

    def set(self, values):
        self._listbox.delete(0, "end")
        self._items = list(values) if values else []
        for v in self._items:
            self._listbox.insert("end", v)


# ─────────────────────────────────────────────────────────────────────────────
# CONTEÚDO DO PASSO
# ─────────────────────────────────────────────────────────────────────────────

class _StepContent(tk.Frame):
    """Frame que renderiza o conteúdo de um passo do wizard."""

    def __init__(self, parent, on_prev, on_next):
        super().__init__(parent, bg=COLORS["bg"])
        self._on_prev = on_prev
        self._on_next = on_next
        self._widget = None
        self._step = None

        # ── Cabeçalho do passo ──────────────────────────────────────────────
        self._header = tk.Frame(self, bg=COLORS["card"], pady=10, padx=16)
        self._header.pack(fill="x")

        self._phase_label = tk.Label(
            self._header, text="", bg=COLORS["card"],
            fg=COLORS["primary"], font=("Segoe UI", 9, "bold")
        )
        self._phase_label.pack(anchor="w")

        self._title_label = tk.Label(
            self._header, text="", bg=COLORS["card"],
            fg=COLORS["text"], font=("Segoe UI", 15, "bold")
        )
        self._title_label.pack(anchor="w")

        self._progress_label = tk.Label(
            self._header, text="", bg=COLORS["card"],
            fg=COLORS["text_muted"], font=("Segoe UI", 9)
        )
        self._progress_label.pack(anchor="e")

        # Scrollable content area
        self._scroll_canvas = tk.Canvas(self, bg=COLORS["bg"], highlightthickness=0)
        self._scroll_canvas.pack(fill="both", expand=True)
        _vsb = ttk.Scrollbar(self._scroll_canvas, orient="vertical",
                               command=self._scroll_canvas.yview)
        self._scroll_canvas.configure(yscrollcommand=_vsb.set)
        _vsb.place(relx=1.0, rely=0, relheight=1.0, anchor="ne")

        self._inner = tk.Frame(self._scroll_canvas, bg=COLORS["bg"])
        self._inner_id = self._scroll_canvas.create_window(
            (0, 0), window=self._inner, anchor="nw"
        )
        self._inner.bind("<Configure>", self._on_inner_configure)
        self._scroll_canvas.bind("<Configure>", self._on_canvas_configure)

        # ── Navegação ───────────────────────────────────────────────────────
        nav = tk.Frame(self, bg=COLORS["card"], pady=10, padx=16)
        nav.pack(fill="x", side="bottom")

        self._prev_btn = ttk.Button(nav, text=t("creator.nav.prev"), command=on_prev, width=14)
        self._prev_btn.pack(side="left")

        self._step_counter = tk.Label(nav, text="", bg=COLORS["card"],
                                       fg=COLORS["text_muted"], font=("Segoe UI", 9))
        self._step_counter.pack(side="left", expand=True)

        self._next_btn = ttk.Button(nav, text=t("creator.nav.next"), command=on_next,
                                     width=14, style="Accent.TButton")
        self._next_btn.pack(side="right")

    def _on_inner_configure(self, e):
        self._scroll_canvas.configure(scrollregion=self._scroll_canvas.bbox("all"))

    def _on_canvas_configure(self, e):
        self._scroll_canvas.itemconfig(self._inner_id, width=e.width - 20)

    def render_step(self, step: dict, current_answer, base_system: str, step_num: int, total: int):
        self._step = step

        # Header
        self._phase_label.config(text=t("creator.step.phase_label", num=step['phase_index'] + 1, phase=t(f"creator.phases.{step['phase_index']}")))
        req = " *" if step.get("required") else ""
        self._title_label.config(text=step["question"] + req)
        self._progress_label.config(text=t("creator.step.progress", num=step_num, total=total))
        self._step_counter.config(text=f"{step_num} / {total}")

        # Limpa inner
        for child in self._inner.winfo_children():
            child.destroy()

        # Hint
        hint = step.get("hint", "")
        if hint:
            tk.Label(self._inner, text=hint, bg=COLORS["bg"],
                      fg=COLORS["text_muted"], font=("Segoe UI", 9),
                      wraplength=600, justify="left").pack(
                anchor="w", padx=16, pady=(12, 0))

        # Exemplo do sistema base
        example_key = step.get("example_key")
        if example_key and base_system:
            ex_text = get_example(base_system, example_key)
            if ex_text:
                ex_frame = tk.Frame(self._inner, bg=COLORS.get("warning_bg", "#2a2510"),
                                     relief="flat", bd=1)
                ex_frame.pack(fill="x", padx=16, pady=(8, 0))
                tk.Label(ex_frame, text=t("creator.step.example_prefix", system=base_system),
                          bg=ex_frame["bg"], fg=COLORS.get("warning", "#f0c040"),
                          font=("Segoe UI", 9, "bold")).pack(anchor="w", padx=8, pady=(4, 0))
                tk.Label(ex_frame, text=ex_text, bg=ex_frame["bg"],
                          fg=COLORS.get("warning", "#f0c040"),
                          font=("Segoe UI", 9), wraplength=580, justify="left").pack(
                    anchor="w", padx=8, pady=(2, 6))

        # Widget de resposta
        widget_type = step.get("widget", "text")
        options = step.get("options", [])

        if widget_type == "choice_cards":
            self._widget = _ChoiceCardsWidget(self._inner, options)
        elif widget_type == "choice":
            self._widget = _ChoiceWidget(self._inner, options)
        elif widget_type == "multicheck":
            self._widget = _MultiCheckWidget(self._inner, options)
        elif widget_type == "text_long":
            self._widget = _TextLongWidget(self._inner)
        elif widget_type == "list_editor":
            self._widget = _ListEditorWidget(self._inner)
        else:
            self._widget = _TextWidget(self._inner)

        if current_answer is not None:
            self._widget.set(current_answer)

        self._widget.pack(fill="both", expand=True, padx=16, pady=12)

        # Prev btn
        self._prev_btn.config(state="normal" if step_num > 1 else "disabled")

    def get_answer(self):
        if self._widget:
            return self._widget.get()
        return None

    def set_finish_mode(self, has_export_result: bool = False):
        """Troca o botão Próximo por Finalizar/Exportar na última etapa."""
        self._next_btn.config(text=t("creator.nav.finish"))


# ─────────────────────────────────────────────────────────────────────────────
# PAINEL PRINCIPAL
# ─────────────────────────────────────────────────────────────────────────────

class SystemCreatorPanel(ttk.Frame):
    """Painel completo do Criador de Sistemas."""

    def __init__(self, parent):
        super().__init__(parent, padding=0)
        self._mgr = SystemManager()
        self._system_data = None
        self._current_step_index = 0   # índice em WIZARD_STEPS
        self._dirty = False
        self._save_job = None

        self._build_ui()
        self._load_initial()

    # ─────────────────────────────────────────────────────────────────────────
    def _build_ui(self):
        # Session bar
        session_frame = ttk.Frame(self, padding=(8, 6))
        session_frame.pack(fill="x")
        self._session_bar = _SessionBar(
            session_frame, self._mgr,
            on_load=self._load_system,
            on_create=self._new_system,
            on_delete=self._delete_system,
            on_rename=self._rename_system,
            on_tutorial=lambda: _show_tutorial(self),
        )
        self._session_bar.pack(fill="x")

        # Aviso Alfa
        alfa_bar = tk.Frame(self, bg="#7c2d12", pady=3)
        alfa_bar.pack(fill="x")
        tk.Label(
            alfa_bar,
            text=t("creator.alpha_warning"),
            bg="#7c2d12", fg="#fed7aa",
            font=("Segoe UI", 9, "bold"),
        ).pack()

        ttk.Separator(self, orient="horizontal").pack(fill="x", padx=8)

        # Empty state placeholder
        self._empty_frame = tk.Frame(self, bg=COLORS["bg"])
        self._empty_frame.place(relx=0.5, rely=0.5, anchor="center")
        tk.Label(self._empty_frame, text=t("creator.empty.title"),
                  bg=COLORS["bg"], fg=COLORS["text_muted"],
                  font=("Segoe UI", 14)).pack(pady=(0, 8))
        ttk.Button(self._empty_frame, text=t("creator.empty.subtitle"),
                    command=self._new_system).pack()

        # Main layout (sidebar + content)
        self._main_frame = tk.Frame(self, bg=COLORS["bg"])
        # (packed when a system is loaded)

        self._sidebar = _ProgressSidebar(self._main_frame)
        self._sidebar.pack(side="left", fill="y", padx=(8, 0), pady=8)

        self._step_content = _StepContent(
            self._main_frame,
            on_prev=self._prev_step,
            on_next=self._next_step,
        )
        self._step_content.pack(side="left", fill="both", expand=True, padx=8, pady=8)

    def _load_initial(self):
        systems = self._mgr.list_systems()
        if systems:
            self._load_system(systems[0])
        else:
            self._show_empty(True)

    def _show_empty(self, show: bool):
        if show:
            self._main_frame.pack_forget()
            self._empty_frame.place(relx=0.5, rely=0.5, anchor="center")
        else:
            self._empty_frame.place_forget()
            self._main_frame.pack(fill="both", expand=True)

    # ─────────────────────────────────────────────────────────────────────────
    # CRUD SESSÕES
    # ─────────────────────────────────────────────────────────────────────────

    def _new_system(self):
        name = simpledialog.askstring(
            t("creator.new_system_title"), t("creator.new_system_prompt"),
            parent=self, initialvalue="Meu Sistema"
        )
        if not name or not name.strip():
            return
        name = name.strip()
        if name in self._mgr.list_systems():
            messagebox.showwarning(t("creator.error.title"), t("creator.error.exists", name=name), parent=self)
            return
        data = self._mgr.create_system(name)
        self._session_bar.refresh()
        self._session_bar.set_current(name)
        self._load_system(name)

    def _load_system(self, name: str):
        if not name:
            return
        data = self._mgr.load_system(name)
        if data is None:
            return
        self._system_data = data
        self._current_step_index = data.get("current_step", 0)
        self._dirty = False
        self._show_empty(False)
        self._render_current_step()

    def _delete_system(self):
        name = self._session_bar.current()
        if not name:
            return
        if not messagebox.askyesno(t("creator.delete_confirm_title"), t("creator.delete_confirm_body", name=name), parent=self):
            return
        self._mgr.delete_system(name)
        self._session_bar.refresh()
        systems = self._mgr.list_systems()
        if systems:
            self._load_system(systems[0])
            self._session_bar.set_current(systems[0])
        else:
            self._system_data = None
            self._show_empty(True)

    def _rename_system(self):
        old = self._session_bar.current()
        if not old:
            return
        new = simpledialog.askstring(t("creator.rename_title"), t("creator.rename_prompt", name=old), parent=self, initialvalue=old)
        if not new or not new.strip() or new.strip() == old:
            return
        new = new.strip()
        if not self._mgr.rename_system(old, new):
            messagebox.showerror(t("creator.error.title"), t("creator.error.rename_failed"), parent=self)
            return
        self._session_bar.refresh()
        self._session_bar.set_current(new)
        if self._system_data:
            self._system_data["name"] = new

    # ─────────────────────────────────────────────────────────────────────────
    # WIZARD NAVIGATION
    # ─────────────────────────────────────────────────────────────────────────

    def _render_current_step(self):
        if self._system_data is None:
            return

        answers = self._system_data.get("answers", {})

        # Encontrar o índice visível correto
        idx = self._current_step_index
        # Pular passos invisíveis
        while idx < TOTAL_STEPS and not should_show_step(WIZARD_STEPS[idx], answers):
            idx += 1
        if idx >= TOTAL_STEPS:
            self._show_completion()
            return

        self._current_step_index = idx
        self._system_data["current_step"] = idx
        step = WIZARD_STEPS[idx]

        # Número visível do passo (contar apenas passos visíveis até aqui)
        visible_before = sum(
            1 for i, s in enumerate(WIZARD_STEPS)
            if i < idx and should_show_step(s, answers)
        )
        step_num = visible_before + 1
        total_visible = count_visible_steps(answers)

        current_answer = answers.get(step["answer_key"])

        # Pré-selecionar campos da ficha com base nas respostas anteriores
        if step["answer_key"] == "sheet_fields" and current_answer is None:
            current_answer = suggest_fields_from_answers(answers)

        base_system = answers.get("base_system", "")

        self._step_content.render_step(step, current_answer, base_system, step_num, total_visible)

        # Último passo?
        if self._is_last_visible_step(idx, answers):
            self._step_content.set_finish_mode()

        # Atualizar sidebar
        completed = self._get_completed_phases(answers)
        self._sidebar.update_state(step["phase_index"], completed)

    def _is_last_visible_step(self, current_idx: int, answers: dict) -> bool:
        for i in range(current_idx + 1, TOTAL_STEPS):
            if should_show_step(WIZARD_STEPS[i], answers):
                return False
        return True

    def _get_completed_phases(self, answers: dict) -> set:
        """Fases onde todos os passos obrigatórios foram respondidos."""
        completed = set()
        for phase_idx, phase_name in PHASES:
            phase_steps = [s for s in WIZARD_STEPS
                           if s["phase_index"] == phase_idx and should_show_step(s, answers)]
            required = [s for s in phase_steps if s.get("required")]
            if required and all(answers.get(s["answer_key"]) for s in required):
                completed.add(phase_idx)
        return completed

    def _next_step(self):
        if self._system_data is None:
            return

        # Salvar resposta atual
        step = WIZARD_STEPS[self._current_step_index]
        answer = self._step_content.get_answer()

        if step.get("required") and (answer is None or answer == [] or answer == ""):
            messagebox.showwarning(t("creator.warning.required_field"),
                                    t("creator.warning.required_body"), parent=self)
            return

        answers = self._system_data.setdefault("answers", {})
        answers[step["answer_key"]] = answer

        # Verificar se é o último passo
        if self._is_last_visible_step(self._current_step_index, answers):
            self._finalize()
            return

        # Avançar para próximo passo visível
        idx = self._current_step_index + 1
        while idx < TOTAL_STEPS and not should_show_step(WIZARD_STEPS[idx], answers):
            idx += 1
        self._current_step_index = idx
        self._system_data["current_step"] = idx
        self._schedule_save()
        self._render_current_step()

    def _prev_step(self):
        if self._system_data is None or self._current_step_index == 0:
            return

        answers = self._system_data.get("answers", {})
        # Salvar resposta atual sem validação
        step = WIZARD_STEPS[self._current_step_index]
        answer = self._step_content.get_answer()
        answers[step["answer_key"]] = answer

        idx = self._current_step_index - 1
        while idx >= 0 and not should_show_step(WIZARD_STEPS[idx], answers):
            idx -= 1
        if idx < 0:
            idx = 0
        self._current_step_index = idx
        self._system_data["current_step"] = idx
        self._schedule_save()
        self._render_current_step()

    # ─────────────────────────────────────────────────────────────────────────
    # FINALIZAÇÃO & EXPORTAÇÃO
    # ─────────────────────────────────────────────────────────────────────────

    def _finalize(self):
        """Coleta última resposta, monta sheet_config e abre diálogo de exportação."""
        if self._system_data is None:
            return

        answers = self._system_data.setdefault("answers", {})
        step = WIZARD_STEPS[self._current_step_index]
        answer = self._step_content.get_answer()
        answers[step["answer_key"]] = answer

        # Construir sheet_config a partir das respostas
        selected_keys = answers.get("sheet_fields", [])
        if selected_keys:
            fields = build_field_list(selected_keys)
        else:
            fields = []

        self._system_data["sheet_config"] = {
            "title": answers.get("system_name", self._system_data.get("name", "Sistema")),
            "fields": fields,
            "layout": answers.get("sheet_layout", "standard"),
            "theme": "dark",
        }
        self._system_data["completed"] = True
        self._mgr.save_system(self._system_data["name"], self._system_data)

        self._show_export_dialog()

    def _show_export_dialog(self):
        """Janela de exportação — 4 formatos para Documento e para Ficha."""
        answers = self._system_data.get("answers", {})

        win = tk.Toplevel(self)
        win.title(t("creator.export.title"))
        win.geometry("560x560")
        win.configure(bg=COLORS["bg"])
        win.grab_set()

        tk.Label(win, text="Exportar", bg=COLORS["bg"],
                  fg=COLORS["text"], font=("Segoe UI", 16, "bold")).pack(pady=(16, 2), padx=20, anchor="w")
        tk.Label(win, text="Escolha os formatos para cada tipo de arquivo:",
                  bg=COLORS["bg"], fg=COLORS["text_muted"],
                  font=("Segoe UI", 10)).pack(padx=20, anchor="w")

        # ── Disponibilidade das libs ──────────────────────────────────────
        _AVAIL = {
            "txt":  True,
            "word": DOCX_AVAILABLE,
            "png":  PIL_AVAILABLE,
            "pdf":  REPORTLAB_AVAILABLE,
        }
        _DEPS = {
            "txt":  "",
            "word": "pip install python-docx",
            "png":  "pip install Pillow",
            "pdf":  "pip install reportlab",
        }
        _LABELS = {
            "txt":  "TXT",
            "word": "Word (.docx)",
            "png":  "PNG",
            "pdf":  "PDF",
        }

        sys_req  = answers.get("export_system_formats", ["txt", "pdf"])
        sheet_req = answers.get("export_sheet_formats",  ["pdf", "png"])

        sys_vars   = {}
        sheet_vars = {}

        def _make_section(parent, title: str, var_dict: dict, requested: list):
            frame = tk.LabelFrame(parent, text=f"  {title}  ",
                                   bg=COLORS["surface"], fg=COLORS["primary"],
                                   font=("Segoe UI", 10, "bold"),
                                   padx=12, pady=8)
            frame.pack(fill="x", padx=20, pady=(8, 0))
            for fmt in ("txt", "word", "png", "pdf"):
                avail = _AVAIL[fmt]
                var = tk.BooleanVar(value=(fmt in requested and avail))
                var_dict[fmt] = var
                row = ttk.Frame(frame)
                row.pack(fill="x", pady=1)
                cb = ttk.Checkbutton(row, text=_LABELS[fmt], variable=var)
                cb.pack(side="left")
                if not avail:
                    cb.config(state="disabled")
                    ttk.Label(row, text=f"  (requer: {_DEPS[fmt]})",
                               foreground=COLORS["text_muted"],
                               font=("Segoe UI", 8)).pack(side="left")

        _make_section(win, "Documento do Sistema", sys_vars,   sys_req)
        _make_section(win, "Ficha de Personagem",  sheet_vars, sheet_req)

        # ── Pasta de saída ────────────────────────────────────────────────
        dir_frame = ttk.Frame(win)
        dir_frame.pack(fill="x", padx=20, pady=10)

        out_dir_var = tk.StringVar(value=os.path.join(
            os.path.expanduser("~"), ".dm_dungeon_music", "exports"))
        ttk.Label(dir_frame, text="Pasta:").pack(side="left", padx=(0, 4))
        ttk.Entry(dir_frame, textvariable=out_dir_var, width=34).pack(side="left", fill="x", expand=True)
        ttk.Button(dir_frame, text="...", width=3,
                    command=lambda: out_dir_var.set(
                        filedialog.askdirectory(initialdir=out_dir_var.get()) or out_dir_var.get()
                    )).pack(side="left", padx=(4, 0))

        # ── Log de resultado ──────────────────────────────────────────────
        result_text = tk.Text(win, height=6, bg=COLORS["surface"], fg=COLORS["text"],
                               font=("Segoe UI", 9), state="disabled",
                               relief="flat", padx=8, pady=6)
        result_text.pack(fill="both", expand=True, padx=20, pady=(0, 6))

        def _do_export():
            s_fmts = [f for f, v in sys_vars.items()   if v.get()]
            sh_fmts = [f for f, v in sheet_vars.items() if v.get()]
            if not s_fmts and not sh_fmts:
                messagebox.showwarning("Aviso", "Selecione ao menos um formato.", parent=win)
                return
            results = export(self._system_data, s_fmts, sh_fmts, base_dir=out_dir_var.get())
            result_text.config(state="normal")
            result_text.delete("1.0", "end")
            for key, path in results.items():
                icon = "✅" if not str(path).startswith("ERRO") else "❌"
                label = key.replace("sistema_", "Sistema ").replace("ficha_", "Ficha ").upper()
                result_text.insert("end", f"{icon} {label}: {path}\n")
            result_text.config(state="disabled")
            self._system_data["exported"] = True
            self._mgr.save_system(self._system_data["name"], self._system_data)

        btn_row = tk.Frame(win, bg=COLORS["bg"])
        btn_row.pack(fill="x", padx=20, pady=(0, 16))
        ttk.Button(btn_row, text="Exportar", command=_do_export,
                    style="Accent.TButton", width=12).pack(side="left")
        ttk.Button(btn_row, text="Fechar", command=win.destroy, width=10).pack(side="right")

    # ─────────────────────────────────────────────────────────────────────────
    # COMPLETION SCREEN
    # ─────────────────────────────────────────────────────────────────────────

    def _show_completion(self):
        """Tela final após o último passo."""
        for child in self._step_content._inner.winfo_children():
            child.destroy()

        name = self._system_data.get("name", "Sistema")
        self._step_content._phase_label.config(text="Concluído!")
        self._step_content._title_label.config(text=f"✔ Sistema '{name}' está pronto!")
        self._step_content._progress_label.config(text="")
        self._step_content._step_counter.config(text="")
        self._step_content._prev_btn.config(state="disabled")
        self._step_content._next_btn.config(text="Exportar Novamente", command=self._show_export_dialog)

        inner = self._step_content._inner
        tk.Label(inner, text="Parabéns! Você completou o wizard.",
                  bg=COLORS["bg"], fg=COLORS["text"],
                  font=("Segoe UI", 13)).pack(pady=(20, 4))
        tk.Label(inner,
                  text="Use o botão 'Exportar Novamente' para gerar os arquivos a qualquer momento.",
                  bg=COLORS["bg"], fg=COLORS["text_muted"],
                  font=("Segoe UI", 10), wraplength=500).pack(pady=4)

        ttk.Button(inner, text="Exportar Agora", command=self._show_export_dialog,
                    style="Accent.TButton").pack(pady=16)

    # ─────────────────────────────────────────────────────────────────────────
    # AUTO-SAVE
    # ─────────────────────────────────────────────────────────────────────────

    def _schedule_save(self):
        if self._save_job:
            self.after_cancel(self._save_job)
        self._save_job = self.after(800, self._auto_save)

    def _auto_save(self):
        if self._system_data:
            self._mgr.save_system(self._system_data["name"], self._system_data)
        self._save_job = None
