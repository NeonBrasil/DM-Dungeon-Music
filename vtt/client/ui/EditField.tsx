// Campos que editam o estado compartilhado sem brigar com o eco do servidor:
// enquanto o campo está em foco vale o valor local; o envio é atrasado (debounce).
import { useEffect, useRef, useState, type CSSProperties } from "react";

interface Props {
  value: string | number | undefined;
  onCommit: (v: string) => void;
  multiline?: boolean;
  type?: "text" | "number";
  placeholder?: string;
  className?: string;
  style?: CSSProperties;
  readOnly?: boolean;
  delay?: number;
  rows?: number;
  title?: string;
}

export function EditField({ value, onCommit, multiline, type = "text", placeholder, className = "input", style, readOnly, delay = 400, rows, title }: Props) {
  const [local, setLocal] = useState(String(value ?? ""));
  const focused = useRef(false);
  const timer = useRef<number | null>(null);
  const lastSent = useRef<string | null>(null);

  useEffect(() => {
    if (!focused.current) setLocal(String(value ?? ""));
  }, [value]);

  const flush = (v: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (v !== String(value ?? "") && v !== lastSent.current) {
      lastSent.current = v;
      onCommit(v);
    }
  };

  const change = (v: string) => {
    setLocal(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = window.setTimeout(() => flush(v), delay);
  };

  const common = {
    className, style, placeholder, readOnly, title,
    value: local,
    onFocus: () => {
      focused.current = true;
      lastSent.current = null;
    },
    onBlur: () => {
      focused.current = false;
      flush(local);
    },
  };

  if (multiline) {
    return <textarea {...common} rows={rows} onChange={(e) => change(e.target.value)} />;
  }
  return (
    <input
      {...common}
      type={type}
      onChange={(e) => change(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}
