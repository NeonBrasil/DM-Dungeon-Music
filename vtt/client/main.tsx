import { createRoot } from "react-dom/client";
import "./styles.css";
import { Lobby } from "./screens/Lobby.tsx";
import { CampaignApp } from "./screens/CampaignApp.tsx";
import { GeneratorStudio } from "./gen/GeneratorStudio.tsx";

// Link do mestre (?gm=chave) vem do console do servidor: guarda a chave e limpa a URL.
const params = new URLSearchParams(location.search);
const key = params.get("gm");
if (key) {
  localStorage.setItem("dm.gmKey", key);
  params.delete("gm");
  const q = params.toString();
  history.replaceState(null, "", location.pathname + (q ? `?${q}` : ""));
}

function App() {
  const m = /^\/c\/([a-z0-9_-]+)\/?$/i.exec(location.pathname);
  if (m) return <CampaignApp cid={m[1]} />;
  if (location.pathname === "/gerador") return <GeneratorStudio onClose={() => (location.href = "/")} />;
  return <Lobby />;
}

createRoot(document.getElementById("root")!).render(<App />);
