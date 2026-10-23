// Layout da mesa: barra superior, ferramentas, tabuleiro, barra lateral e janelas.
import type { ReactNode } from "react";
import { game } from "../game.ts";
import { Chat } from "../chat/Chat.tsx";
import { Icon } from "../ui/Icon.tsx";
import { Board } from "./Board.tsx";
import { Inspector } from "./Inspector.tsx";
import { Library } from "./Library.tsx";
import { PagePanel } from "./PagePanel.tsx";
import { Toolbar } from "./Toolbar.tsx";
import { TopBar } from "./TopBar.tsx";
import { TurnTracker } from "./TurnTracker.tsx";
import { ui, useViewPage, type SideTab } from "./ui.ts";
import { GeneratorStudio } from "../gen/GeneratorStudio.tsx";
import { sendToTable } from "../gen/sendToTable.ts";
import { Journal } from "../sheets/Journal.tsx";
import { SheetWindow } from "../sheets/SheetWindow.tsx";
import { HandoutWindow } from "../sheets/HandoutWindow.tsx";
import { TemplateEditor } from "../sheets/TemplateEditor.tsx";
import { Jukebox } from "../audio/Jukebox.tsx";
import { Compendium, SrdWindow } from "../compendium/Compendium.tsx";
import { audioPrefs, startAudio, stopAudio, unlockAudio } from "../audio/engine.ts";
import { useEffect } from "react";
import { Toasts } from "../ui/Toast.tsx";
import { MacroBar, QueryModal } from "../chat/MacroBar.tsx";
import { useDiceWatcher } from "../dice3d/watch.ts";
import { Cards } from "./Cards.tsx";

interface TabDef { id: SideTab; icon: string; title: string; gmOnly?: boolean; render: () => ReactNode }

const TABS: TabDef[] = [
  { id: "chat", icon: "message", title: "Chat e dados", render: () => <Chat /> },
  { id: "journal", icon: "book", title: "Fichas e textos", render: () => <Journal /> },
  { id: "music", icon: "music", title: "Música e efeitos", render: () => <Jukebox /> },
  { id: "compendium", icon: "paw", title: "Compêndio (bestiário e itens do mestre, magias D&D 5e)", render: () => <Compendium /> },
  { id: "cards", icon: "cards", title: "Cartas e baralhos", render: () => <Cards /> },
  { id: "library", icon: "image", title: "Biblioteca de imagens", gmOnly: true, render: () => <Library /> },
  { id: "page", icon: "sliders", title: "Página e campanha", gmOnly: true, render: () => <PagePanel /> },
];

function Sidebar() {
  const role = game.use((s) => s.role);
  const tab = ui.use((s) => s.sideTab);
  const collapsed = ui.use((s) => s.sideCollapsed);
  const tabs = TABS.filter((t) => !t.gmOnly || role === "gm");
  const current = tabs.find((t) => t.id === tab) ?? tabs[0];
  return (
    <div className={`sidebar ${collapsed ? "collapsed" : ""}`}>
      <div className="side-tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={`icon-btn ${!collapsed && t.id === current.id ? "active" : ""}`}
            title={t.title}
            onClick={() => ui.set({ sideTab: t.id, sideCollapsed: false })}
          >
            <Icon name={t.icon} />
          </button>
        ))}
        <span className="spacer" />
        <button className="icon-btn" title={collapsed ? "Abrir painel" : "Recolher painel"} onClick={() => ui.set({ sideCollapsed: !collapsed })}>
          <Icon name={collapsed ? "chevronLeft" : "chevronRight"} />
        </button>
      </div>
      {!collapsed && <div className="side-body">{current.render()}</div>}
    </div>
  );
}

export function Table() {
  const status = game.use((s) => s.status);
  const generator = ui.use((s) => s.generator);
  const genPreset = ui.use((s) => s.genPreset);
  const viewPage = useViewPage();
  const sheets = ui.use((s) => s.sheets);
  const audioBlocked = audioPrefs.use((s) => s.blocked);
  useEffect(() => {
    startAudio();
    return () => stopAudio();
  }, []);
  const handouts = ui.use((s) => s.handouts);
  const srd = ui.use((s) => s.srd);
  useDiceWatcher();
  return (
    <div className="table">
      <TopBar />
      <Toolbar />
      <div className="board-area">
        <Board />
        <Inspector />
        <MacroBar />
        {status === "closed" && <div className="status-banner">Conexão perdida — tentando reconectar…</div>}
        {audioBlocked && (
          <button className="status-banner audio" onClick={unlockAudio}>
            <Icon name="volume" size={14} /> O mestre está tocando música — clique para ouvir
          </button>
        )}
      </div>
      <Sidebar />
      <TurnTracker />
      {sheets.map((id) => <SheetWindow key={id} id={id} />)}
      {handouts.map((id) => <HandoutWindow key={id} id={id} />)}
      {srd.map((k) => <SrdWindow key={k} k={k} />)}
      <TemplateEditor />
      <Toasts />
      <QueryModal />
      {generator && <GeneratorStudio initial={generator} preset={genPreset} from={genPreset ? viewPage?.source : null} onClose={() => ui.set({ generator: null, genPreset: null })} onSend={sendToTable} />}
    </div>
  );
}
