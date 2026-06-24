// Estado global leve da empresa e período selecionados (persistido em localStorage).
import { useEffect, useState } from "react";

const KEY_EMPRESA = "rdc.empresa_id";
const KEY_PERIODO = "rdc.periodo";

type Periodo = { mes: number; ano: number };

function emitter() {
  const listeners = new Set<() => void>();
  return {
    on(cb: () => void) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    fire() {
      listeners.forEach((cb) => cb());
    },
  };
}

const empresaBus = emitter();
const periodoBus = emitter();

export function setEmpresaSelecionada(id: string | null) {
  if (typeof window === "undefined") return;
  if (id) localStorage.setItem(KEY_EMPRESA, id);
  else localStorage.removeItem(KEY_EMPRESA);
  empresaBus.fire();
}

export function getEmpresaSelecionada(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(KEY_EMPRESA);
}

export function useEmpresaSelecionada(): [string | null, (id: string | null) => void] {
  const [id, setId] = useState<string | null>(() => getEmpresaSelecionada());
  useEffect(() => empresaBus.on(() => setId(getEmpresaSelecionada())), []);
  return [id, setEmpresaSelecionada];
}

export function getPeriodo(): Periodo {
  if (typeof window === "undefined") {
    const d = new Date();
    return { mes: d.getMonth() + 1, ano: d.getFullYear() };
  }
  const raw = localStorage.getItem(KEY_PERIODO);
  if (raw) {
    try {
      return JSON.parse(raw) as Periodo;
    } catch {
      // fallthrough
    }
  }
  const d = new Date();
  return { mes: d.getMonth() + 1, ano: d.getFullYear() };
}

export function setPeriodo(p: Periodo) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY_PERIODO, JSON.stringify(p));
  periodoBus.fire();
}

export function usePeriodo(): [Periodo, (p: Periodo) => void] {
  const [p, setP] = useState<Periodo>(() => getPeriodo());
  useEffect(() => periodoBus.on(() => setP(getPeriodo())), []);
  return [p, setPeriodo];
}
