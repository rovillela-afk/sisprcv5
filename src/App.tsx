import React, { useMemo, useState, useEffect, useCallback } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// MVP – Calculadora de PRC & Embates (DAMEPLAN)
// OBS: Protótipo didático. Valide/complete coeficientes no documento-fonte.

// ------------------------------ Dados (parcial) ------------------------------
import { GU_COEF, U_COEF, SU_COEF, APF_COEF } from "./data/dameplan";

// Fator Visibilidade (por elemento)
const VISIBILIDADE = {
  diurno: 1,
  noturno_com_VN: 1,
  noturno_sem_VN: 0.25,
};

// Fator Terreno & Vegetação (por elemento) – com/s/ capacitação particular
const TERRENO = {
  com_capacitacao: 1,
  sem_capacitacao_planicie: 0.75,
  sem_capacitacao_mov_acdt: 0.5,
  sem_capacitacao_montuoso: 0.25,
  sem_capacitacao_montanhoso: 0.1,
  sem_capacitacao_deserto: 0.5,
};

// Fatores multiplicadores (média)
const MULTIPLICADORES_KEYS = [
  { key: "moral", label: "Moral", opts: { Alta: 2, Normal: 1, Baixa: 0.5 } },
  {
    key: "efetivo",
    label: "Efetivo profissional",
    opts: { "100%": 1, "75%": 0.75, "50%": 0.5 },
  },
  {
    key: "experiencia",
    label: "Experiência de combate",
    opts: { "Com exp": 2, "Sem exp": 1 },
  },
  {
    key: "enquadramento",
    label: "Enquadramento (por quantos escalões é enquadrado)",
    opts: { "2 escalões": 2, "1 escalão": 1, "Sem enquadr": 0.5 },
  },
  {
    key: "logistica",
    label: "Capacidade logística",
    opts: { Normal: 2, Limitada: 1, Deficiente: 0.5 },
  },
  {
    key: "comunicacoes",
    label: "Capacidade de comunicações",
    opts: { Normal: 2, Limitada: 1, Deficiente: 0.5 },
  },
  {
    key: "engenharia",
    label: "Situação do Ap de Eng",
    opts: { Superioridade: 2, Equivalência: 1, Inferioridade: 0.5 },
  },
  {
    key: "ge",
    label: "Situação do Ap de GE (Preenchido automaticamente)",
    opts: { Superioridade: 2, Equivalência: 1, Inferioridade: 0.5 },
  },
  {
    key: "aaae",
    label: "Situação do Ap de AAAe (Preenchido automaticamente)",
    opts: { Superioridade: 2, Equivalência: 1, Inferioridade: 0.5 },
  },
];

// Degradação PRC (24h) – subconjunto do quadro
const DEGRADACAO: Record<string, { atacante: number; defensor: number; nota: string }> = {
  "Prog retardada (6:1 / 3:1)": { atacante: 0.15, defensor: 0.1, nota: "Atac 15% / Def 10%" },
  "Ataque 2:1": { atacante: 0.35, defensor: 0.18, nota: "Atac 35% / Def 18%" },
  "Ataque 3:1": { atacante: 0.25, defensor: 0.2, nota: "Atac 25% / Def 20%" },
  "Contra-ataque 2:1": { atacante: 0.05, defensor: 0.25, nota: "Atac 5% / Def 25%" },
};

// Relação quantitativa (mínima) por missão
const MISSAO_RELACAO: Record<string, string> = {
  "Ataque Principal": "3:1",
  "Ataque Secundário": "2:1",
  "Fixação": "1:1",
  Defesa: "1:3",
};

// Velocidades – simplificado (reservado)
const VELOCIDADES = {
  reconhecimento: {
    eixo: { diurno: 15, noturno: 8, normal: 20, precedidoElmAvEx: 8, retardada: 8 },
    area: { diurno: 8, noturno: 4, normal: 12 },
    zona: { diurno: 11, noturno: 6, normal: 12 },
  },
  aproveitamentoExito: { diurno: 24, noturno: 16 },
};

// ------------------------------ Auxiliares ------------------------------
function parseRelacao(str: string) {
  const [a, b] = str.split(":").map((x) => Number(x));
  return { a, b, ratio: a / b };
}
function numeroBonito(x: number) {
  if (!isFinite(x)) return "–";
  if (x >= 10) return x.toFixed(0);
  if (x >= 1) return x.toFixed(2);
  return x.toFixed(3);
}

const PRC_MAX = 100;
const clampPct = (v: number) => Math.min(PRC_MAX, Math.max(0, Math.round(v)));
// Mapeia Engenharia do lado amigo → inimigo
const mapEng = (v: string | undefined) =>
  v === "Superioridade" ? "Inferioridade"
  : v === "Inferioridade" ? "Superioridade"
  : "Equivalência";
const limpaSufixo = (s: string) => s.replace(/\s*\(nossas\)\s*|\s*\(ini\)\s*/gi, "").trim();

// ------------------------------ Componentes base ------------------------------
function Card({
  title,
  children,
  className = "",
  titleClassName = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;       // <<< novo
  titleClassName?: string;  // <<< novo
}) {
  return (
    <div className={`rounded-2xl shadow p-4 bg-white/80 border border-gray-100 ${className}`}>
      <div className={`text-lg font-semibold mb-3 ${titleClassName}`}>{title}</div>
      {children}
    </div>
  );
}

type ElemManobra = {
  tipo: "GU" | "U" | "SU";
  nome: string;
  qtd: number;
  postura: "Ofensiva" | "Defensiva";
  vis: keyof typeof VISIBILIDADE;
  terreno: keyof typeof TERRENO;

  // 🆕 novos campos
  ident?: string;       // ex.: "11ª", "2º/10º", etc.
  prcPct?: number;      // percentual do PRC inicial (0..200), default 100
};

function SelecionaElem({
  side,
  data,
  setData,
  resetKey,
  onApfTotalChange,   // ✅ NOVO
}: {
  side: "Nossas forças" | "Inimigo";
  data: ElemManobra[];
  setData: (d: ElemManobra[]) => void;
  resetKey: number;
  onApfTotalChange: (total: number) => void;  // ✅ NOVO
}) {
  const isAmigo = side === "Nossas forças";
  const add = () =>
    setData([
      ...data,
      {
        tipo: "GU",
        nome: side === "Inimigo" ? "Bda Inf Mec (ini)" : "Bda Inf Mec (nossas)",
        qtd: 1,
        postura: "Ofensiva",
        vis: "diurno",
        terreno: "com_capacitacao",
        ident: "",       // 🆕 começa em branco (você digita depois)
        prcPct: 100,     // 🆕 100% do PRC inicial por padrão
      },
    ]);

  const catOptions = [
    { k: "GU", label: "Grande Unidade" },
    { k: "U", label: "Unidade" },
    { k: "SU", label: "Subunidade" },
  ];

  const optionsMap: Record<string, string[]> = {
    GU: Object.keys(GU_COEF).filter((n) => (isAmigo ? n.includes("(nossas)") : n.includes("(ini)"))),
    U: Object.keys(U_COEF).filter((n) => (isAmigo ? n.includes("(nossas)") : n.includes("(ini)"))),
    SU: Object.keys(SU_COEF).filter((n) => (isAmigo ? n.includes("(nossas)") : n.includes("(ini)"))),
  };

  return (
    <div className="space-y-3">
      {data.map((e, i) => (
        <div key={i} className="grid grid-cols-1 lg:grid-cols-8 gap-x-3 gap-y-2 items-start">
          {/* Categoria */}
          <div className="lg:col-span-2 min-w-0">
            <label className="text-xs">Categoria</label>
            <select
              className="w-full max-w-full border rounded-xl p-2"
              value={e.tipo}
              onChange={(ev) => {
                const tipo = ev.target.value as ElemManobra["tipo"];
                const nome = optionsMap[tipo][0] ?? e.nome;
                setData(data.map((d, idx) => (idx === i ? { ...d, tipo, nome } : d)));
              }}
            >
              {catOptions.map((c) => (
                <option key={c.k} value={c.k}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          {/* Elemento */}
          <div className="lg:col-span-3 min-w-0">
            <label className="text-xs">
              <span className={isAmigo ? "text-blue-700" : "text-red-700"}>
                Elemento – {isAmigo ? "Amigo" : "Inimigo"}
              </span>
            </label>
            <select
              className="w-full max-w-full border rounded-xl p-2"
              value={e.nome}
              onChange={(ev) => setData(data.map((d, idx) => (idx === i ? { ...d, nome: ev.target.value } : d)))}
            >
              {optionsMap[e.tipo].map((n) => {
                const nomeLimpo = limpaSufixo(n);
                return (
                  <option key={n} value={n} title={n}>
                    {nomeLimpo}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Qtd */}
          <div className="lg:col-span-1 min-w-0">
            <label className="text-xs">Qtd</label>
            <input
              type="number"
              min={0}
              className="w-full border rounded-xl p-2"
              value={e.qtd}
              onChange={(ev) =>
                setData(data.map((d, idx) => (idx === i ? { ...d, qtd: Number(ev.target.value) } : d)))
              }
            />
          </div>

          {/* Postura */}
          <div className="lg:col-span-1 min-w-0">
            <label className="text-xs">Postura</label>
            <select
              className="w-full border rounded-xl p-2"
              value={e.postura}
              onChange={(ev) =>
                setData(data.map((d, idx) => (idx === i ? { ...d, postura: ev.target.value as any } : d)))
              }
            >
              <option>Ofensiva</option>
              <option>Defensiva</option>
            </select>
          </div>

          {/* Visibilidade */}
          <div className="lg:col-span-1 min-w-0">
            <label className="text-xs">Visibilidade</label>
            <select
              className="w-full border rounded-xl p-2"
              value={e.vis}
              onChange={(ev) => setData(data.map((d, idx) => (idx === i ? { ...d, vis: ev.target.value as any } : d)))}
            >
              <option value="diurno">Diurno (ou NVG)</option>
              <option value="noturno_com_VN">Noturno c/ VN</option>
              <option value="noturno_sem_VN">Noturno s/ VN</option>
            </select>
          </div>

          {/* Terreno */}
          <div className="lg:col-span-3 min-w-0">
            <label className="text-xs">Terreno/Vegetação</label>
            <select
              className="w-full border rounded-xl p-2"
              value={e.terreno}
              onChange={(ev) =>
                setData(data.map((d, idx) => (idx === i ? { ...d, terreno: ev.target.value as any } : d)))
              }
            >
              <option value="com_capacitacao">Com capacitação</option>
              <option value="sem_capacitacao_planicie">Sem cap – Planície</option>
              <option value="sem_capacitacao_mov_acdt">Sem cap – Mov/Acdt</option>
              <option value="sem_capacitacao_montuoso">Sem cap – Montuoso</option>
              <option value="sem_capacitacao_montanhoso">Sem cap – Montanhoso</option>
              <option value="sem_capacitacao_deserto">Sem cap – Deserto</option>
            </select>
          </div>

          {/* Identificação (livre) */}
          <div className="lg:col-span-3 min-w-0">
            <label className="text-xs">Identificação - numeração (ex.: 11ª ou 2ª/4º)</label>
            <input
              type="text"
              className="w-full border rounded-xl p-2"
              placeholder="ex.: 11ª ou 2ª/4º"
              value={e.ident ?? ""}
              onChange={(ev) =>
                setData(data.map((d, idx) => (idx === i ? { ...d, ident: ev.target.value } : d)))
              }
            />
          </div>

          {/* % do PRC inicial desta tropa (com slider, máx 100%) */}
            <div className="lg:col-span-3 min-w-0">
              <label className="text-xs">% do PRC inicial da tropa</label>

              <div className="flex items-center gap-2">
                {/* Slider 0–100 */}
                <input
                  type="range"
                  min={0}
                  max={PRC_MAX}
                  step={1}
                  value={e.prcPct ?? 100}
                  onChange={(ev) =>
                    setData(data.map((d, idx) =>
                      idx === i ? { ...d, prcPct: clampPct(Number(ev.target.value)) } : d
                    ))
                  }
                  className="flex-1 accent-blue-600"
                  aria-label="% do PRC inicial"
                />

                {/* Valor numérico 0–100 */}
                <input
                  type="number"
                  min={0}
                  max={PRC_MAX}
                  step={1}
                  className="w-20 border rounded-xl p-2 text-center"
                  value={e.prcPct ?? 100}
                  onChange={(ev) =>
                    setData(data.map((d, idx) =>
                      idx === i ? { ...d, prcPct: clampPct(Number(ev.target.value)) } : d
                    ))
                  }
                  aria-label="Valor percentual do PRC"
                />
                <span className="text-sm opacity-70">%</span>
              </div>

              <div className="text-[11px] opacity-70 mt-1">
                100% = PRC completo. Após embates, reduza conforme a degradação (ex.: 75%).
              </div>
            </div>

          {/* Remover */}
          <div className="lg:col-span-5 min-w-0 flex gap-2 justify-end">
            <button
              className="text-sm px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200"
              onClick={() => setData(data.filter((_, idx) => idx !== i))}
            >
              Remover
            </button>
          </div>
        </div>
      ))}
      <div>
        <button className="px-4 py-2 rounded-xl bg-black text-white" onClick={add}>
          + Adicionar elemento
        </button>
      </div>
      <div className="mt-3">
        <label className="text-xs">
          Apoios de Fogo (somatório) —{" "}
          <span className={isAmigo ? "text-blue-700" : "text-red-700"}>
            {isAmigo ? "Amigo" : "Inimigo"}
          </span>
        </label>
        <Apoios
          key={`apf-${side}-${resetKey}`}
          side={side}
          onTotalChange={onApfTotalChange}  // ✅ repassa o callback recebido do App
        />
      </div>
    </div>
  );
}

function Multiplicadores({
  side,
  values,
  setValues,
}: {
  side: string;
  values: Record<string, string>;
  setValues: (v: Record<string, string>) => void;
}) {
  const media = useMemo(() => {
    const nums = MULTIPLICADORES_KEYS.map((k) => {
      const escolha = values[k.key] ?? Object.keys(k.opts)[0];
      return (k.opts as any)[escolha] as number;
    });
    return nums.reduce((a, b) => a + b, 0) / nums.length;
  }, [values]);

  const autoColor = "text-purple-700 font-medium"; // roxo de destaque

  return (
    <div className="space-y-2">
      {MULTIPLICADORES_KEYS.map((k) => {
        const value = values[k.key] ?? Object.keys(k.opts)[0];

        // 🔒 Regra: GE/AAAe sempre automáticos (já estava),
        // e Engenharia do Inimigo também é automática (espelhada do Amigo)
        const isAuto =
          k.key === "ge" ||
          k.key === "aaae" ||
          (side === "Inimigo" && k.key === "engenharia");

        return (
          <div key={`${side}-${k.key}`} className="grid grid-cols-2 gap-2 items-center">
            {/* Rótulo */}
            <div className="text-sm">
              {isAuto ? (
                // Mostra o aviso roxo quando automático
                <>
                  {k.key === "ge" ? (
                    <>Situação do Ap de GE <span className={autoColor}>(Preenchido automaticamente)</span></>
                  ) : k.key === "aaae" ? (
                    <>Situação do Ap de AAAe <span className={autoColor}>(Preenchido automaticamente)</span></>
                  ) : (
                    <>Situação do Ap de Eng <span className={autoColor}>(Preenchido automaticamente)</span></>
                  )}
                </>
              ) : (
                // rótulo normal (para os demais campos)
                k.label
              )}
            </div>

            {/* Select (desabilita quando automático) */}
            <select
              className={`border rounded-xl p-2 ${isAuto ? "bg-gray-100 text-gray-600 cursor-not-allowed" : ""}`}
              value={value}
              onChange={(ev) => !isAuto && setValues({ ...values, [k.key]: ev.target.value })}
              disabled={isAuto}
              title={isAuto ? "Valor definido automaticamente" : undefined}
            >
              {Object.entries(k.opts).map(([nome, val]) => (
                <option key={nome} value={nome}>
                  {nome} ({val})
                </option>
              ))}
            </select>
          </div>
        );
      })}
      <div className="pt-2 text-sm">
        Média dos fatores: <b>{numeroBonito(media)}</b>
      </div>
      <div id={`mult-${side}`} data-media={media} />
    </div>
  );
}

// ------------------------------ P Cmb / PRC ------------------------------
function somaPC(
  side: "Nossas forças" | "Inimigo",
  elems: ElemManobra[],
  apf: number // 🆕 total de apoios passado pelo App
) {
  // P Cmb = [(Σ (valor relativo Elm M × fator vis × fator terreno × %PRC)) + Σ(ApF)] × média fatores
  const sumElm = elems.reduce((acc, e) => {
    const base =
      (e.tipo === "GU" ? GU_COEF[e.nome] : e.tipo === "U" ? U_COEF[e.nome] : SU_COEF[e.nome]) || [0, 0];
    const coef = e.postura === "Ofensiva" ? base[0] : base[1];
    const vis = (VISIBILIDADE as any)[e.vis];
    const ter = (TERRENO as any)[e.terreno];
    const pct = clampPct(e.prcPct ?? 100) / 100;  // se você já usa o % PRC por tropa
    return acc + e.qtd * coef * vis * ter * pct;
  }, 0);

  // média dos multiplicadores (pode continuar lendo do DOM por enquanto)
  const multEl = document.getElementById(`mult-${side}`);
  const media = multEl ? Number(multEl.getAttribute("data-media") || 1) : 1;

  return (sumElm + apf) * media; // 🆕 usa o total de Apoio de Fogo vindo do App
}

function ResultadoPRC({ pcNossas, pcIni }: { pcNossas: number; pcIni: number }) {
  const prc = pcIni > 0 ? pcNossas / pcIni : Infinity;
  let leitura = "Igualdade aproximada";
  if (prc >= 3) leitura = "Superioridade ≈ 3:1 ou maior";
  else if (prc >= 2) leitura = "Superioridade ≈ 2:1";
  else if (prc >= 1.5) leitura = "Vantagem moderada";
  else if (prc >= 1.1) leitura = "Leve vantagem";
  else if (prc <= 0.5) leitura = "Inferioridade acentuada";
  else if (prc < 1) leitura = "Inferioridade";

  return (
    <div className="space-y-1">
      <div>
        P Cmb – <span className="font-semibold text-blue-700">Amigo</span>:{" "}
        <b>{numeroBonito(pcNossas)}</b>
      </div>
      <div>
        P Cmb – <span className="font-semibold text-red-700">Inimigo</span>:{" "}
        <b>{numeroBonito(pcIni)}</b>
      </div>
      <div className="text-xl font-semibold">PRC = {numeroBonito(prc)} : 1</div>
      <div className="text-sm opacity-75">Leitura: {leitura}</div>
    </div>
  );
}

// ------------------------------ APOIOS DE FOGO (com quantidade) ------------------------------
function Apoios({
  side,
  onTotalChange, // ✅ NOVO
}: {
  side: "Nossas forças" | "Inimigo";
  onTotalChange: (total: number) => void; // ✅ NOVO
}) {
  // counts[k] = quantidade de unidades daquele tipo
  const [counts, setCounts] = React.useState<Record<string, number>>({});

  const options = Object.keys(APF_COEF).filter((n) =>
    side === "Inimigo" ? n.includes("(ini)") : n.includes("(nossas)")
  );

  const total = options.reduce((acc, k) => acc + (APF_COEF[k] || 0) * (counts[k] || 0), 0);
  // ✅ Emite o total para o componente pai sempre que mudar
  useEffect(() => {
    onTotalChange(total);
  }, [total, onTotalChange]);

  return (
    <div>
      <div className="grid md:grid-cols-3 grid-cols-1 gap-2">
        {options.map((k) => (
          <label key={k} className="flex items-center gap-2 text-sm">
            <span className="truncate" title={k}>
              {limpaSufixo(k)}
            </span>
            <span className="ml-auto text-xs opacity-70">({APF_COEF[k]})</span>
            <input
              type="number"
              min={0}
              className="w-16 border rounded-xl p-1 text-right"
              value={counts[k] ?? 0}
              onChange={(e) => {
                const v = Math.max(0, Number(e.target.value));
                setCounts((prev) => ({ ...prev, [k]: v }));
              }}
            />
          </label>
        ))}
      </div>
      <div className="mt-2 text-sm">
        Somatório Ap F: <b>{total.toFixed(2)}</b>
      </div>
      {/* usado por somaPC() */}
    </div>
  );
}

// ------------------------------ 3.7.9 Confrontação (GE / AAAe) ------------------------------
const GE_COEF: Record<string, number> = {
  "BGE (nossas)": 3, "Cia GE (nossas)": 1, "Pel GE (nossas)": 0.3,
  "BGE (ini)": 3, "Cia GE (ini)": 1, "Pel GE (ini)": 0.3,
};
const AAAE_BASE: Record<string, number> = {
  "GAAAe/DE": 2.0,
  "Bia AAAe": 0.5,
};
const AAAE_COEF: Record<string, number> = Object.fromEntries(
  Object.entries(AAAE_BASE).flatMap(([nome, val]) => [
    [`${nome} (nossas)`, val],
    [`${nome} (ini)`, val],
  ])
);

type StatusTri = "Superioridade" | "Equivalência" | "Inferioridade";
function confrontoStatus(somaN: number, somaI: number): [StatusTri, StatusTri] {
  const eps = 1e-6;
  if (Math.abs(somaN - somaI) < eps) return ["Equivalência", "Equivalência"];
  return somaN > somaI ? ["Superioridade", "Inferioridade"] : ["Inferioridade", "Superioridade"];
}
const zeroMap = (table: Record<string, number>, filtro: "(nossas)" | "(ini)") =>
  Object.fromEntries(Object.keys(table).filter(k => k.includes(filtro)).map(k => [k, "0"]));

/* ------------------------- Confrontação de GE ------------------------- */
const ConfrontacaoGE = React.memo(function ConfrontacaoGE({
  onGE,
}: {
  onGE: (statusNossas: StatusTri, statusInimigo: StatusTri) => void;
}) {
  const [geN, setGeN] = useState<Record<string, string>>(() => zeroMap(GE_COEF, "(nossas)"));
  const [geI, setGeI] = useState<Record<string, string>>(() => zeroMap(GE_COEF, "(ini)"));

  const sum = (map: Record<string, string>) =>
    Object.entries(map).reduce((a, [k, v]) => a + (GE_COEF[k] || 0) * (parseFloat(v) || 0), 0);

  const sN = sum(geN);
  const sI = sum(geI);
  const [stN, stI] = confrontoStatus(sN, sI);

  const last = React.useRef<[StatusTri, StatusTri] | null>(null);
  useEffect(() => {
    const cur: [StatusTri, StatusTri] = [stN, stI];
    if (!last.current || last.current[0] !== cur[0] || last.current[1] !== cur[1]) {
      onGE(cur[0], cur[1]);
      last.current = cur;
    }
  }, [stN, stI, onGE]);

  const Num = ({ label, value, onChange }: { label: string; value: string; onChange: (s: string) => void }) => {
    const display = limpaSufixo(label);
    return (
      <label className="flex items-center gap-2 text-sm">
        <span className="truncate" title={label}>{display}</span>
        <span className="ml-auto text-xs opacity-70">({GE_COEF[label]})</span>
        <input
          type="number"
          min={0}
          step="1"
          className="w-16 border rounded-xl p-1 text-right"
          value={value ?? "0"}
          onChange={(e) => onChange(e.target.value)}
          onBlur={(e) => onChange(e.target.value === "" ? "0" : e.target.value)}
        />
      </label>
    );
  };

  return (
    <Card title="Confrontação de GE">
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="space-y-2 text-blue-700">  {/* 🔵 lado Nossas */}
          <div className="font-medium">GE – Nossas</div>
          {Object.keys(GE_COEF).filter(k => k.includes("(nossas)")).map((k) => (
            <Num key={k} label={k} value={geN[k] ?? "0"} onChange={(s) => setGeN((v) => ({ ...v, [k]: s }))} />
          ))}
        </div>
        <div className="space-y-2 text-red-700">   {/* 🔴 lado Inimigo */}
          <div className="font-medium">GE – Inimigo</div>
          {Object.keys(GE_COEF).filter(k => k.includes("(ini)")).map((k) => (
            <Num key={k} label={k} value={geI[k] ?? "0"} onChange={(s) => setGeI((v) => ({ ...v, [k]: s }))} />
          ))}
        </div>
      </div>
    </Card>
  );
});

/* ------------------------ Confrontação de AAAe ------------------------ */
const ConfrontacaoAAAE = React.memo(function ConfrontacaoAAAE({
  onAAAE,
}: {
  onAAAE: (statusNossas: StatusTri, statusInimigo: StatusTri) => void;
}) {
  const [aaN, setAaN] = useState<Record<string, string>>(() => zeroMap(AAAE_COEF, "(nossas)"));
  const [aaI, setAaI] = useState<Record<string, string>>(() => zeroMap(AAAE_COEF, "(ini)"));

  const sum = (map: Record<string, string>) =>
    Object.entries(map).reduce((a, [k, v]) => a + (AAAE_COEF[k] || 0) * (parseFloat(v) || 0), 0);

  const sN = sum(aaN);
  const sI = sum(aaI);
  const [stN, stI] = confrontoStatus(sN, sI);

  const last = React.useRef<[StatusTri, StatusTri] | null>(null);
  useEffect(() => {
    const cur: [StatusTri, StatusTri] = [stN, stI];
    if (!last.current || last.current[0] !== cur[0] || last.current[1] !== cur[1]) {
      onAAAE(cur[0], cur[1]);
      last.current = cur;
    }
  }, [stN, stI, onAAAE]);

  const Num = ({ label, value, onChange }: { label: string; value: string; onChange: (s: string) => void }) => {
    const display = limpaSufixo(label);
    return (
      <label className="flex items-center gap-2 text-sm">
        <span className="truncate" title={label}>{display}</span>
        <span className="ml-auto text-xs opacity-70">({AAAE_COEF[label]})</span>
        <input
          type="number"
          min={0}
          step="1"
          className="w-16 border rounded-xl p-1 text-right"
          value={value ?? "0"}
          onChange={(e) => onChange(e.target.value)}
          onBlur={(e) => onChange(e.target.value === "" ? "0" : e.target.value)}
        />
      </label>
    );
  };

  return (
    <Card title="Confrontação de AAAe">
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="space-y-2 text-blue-700">   {/* 🔵 lado Nossas */}
          <div className="font-medium">AAAe – Nossas</div>
          {Object.keys(AAAE_COEF).filter(k => k.includes("(nossas)")).map((k) => (
            <Num key={k} label={k} value={aaN[k] ?? "0"} onChange={(s) => setAaN((v) => ({ ...v, [k]: s }))} />
          ))}
        </div>
        <div className="space-y-2 text-red-700">    {/* 🔴 lado Inimigo */}
          <div className="font-medium">AAAe – Inimigo</div>
          {Object.keys(AAAE_COEF).filter(k => k.includes("(ini)")).map((k) => (
            <Num key={k} label={k} value={aaI[k] ?? "0"} onChange={(s) => setAaI((v) => ({ ...v, [k]: s }))} />
          ))}
        </div>
      </div>
    </Card>
  );
});

function ResumoOperacao({
  missao,
  relMin,
  prcAtual,
  atende,
  horas,
  redAtac,
  redDef,
  pcN_h,
  pcI_h,
  prc_h,
}: {
  missao: string;
  relMin: string;
  prcAtual: number;
  atende: boolean;
  horas: number;
  redAtac: number;
  redDef: number;
  pcN_h: number;
  pcI_h: number;
  prc_h: number;
}) {
  return (
    <Card title="Resumo da Operação">
      <div className="text-sm space-y-2">
        <div className="grid sm:grid-cols-2 gap-2">
          <div><span className="opacity-70">Missão: </span><b>{missao}</b></div>
          <div><span className="opacity-70">Relação mínima exigida: </span><b>{relMin}</b></div>
          <div>
            <span className="opacity-70">PRC atual: </span>
            <b>{numeroBonito(prcAtual)} : 1</b>
          </div>
          <div>
            <span className="opacity-70">Status: </span>
            <b className={atende ? "text-green-700" : "text-red-700"}>
              {atende ? "ATENDE" : "NÃO atende"}
            </b>
          </div>
        </div>

        <hr className="my-2" />

        <div className="grid sm:grid-cols-2 gap-2">
          <div><span className="opacity-70">Cenário de degradação em: </span><b>{horas} h</b></div>
          <div>
            <span className="opacity-70">Redução (Atac / Def): </span>
            <b>{(redAtac * 100).toFixed(0)}% / {(redDef * 100).toFixed(0)}%</b>
          </div>
          <div><span className="opacity-70">P Cmb <span className="text-blue-700">Amigo</span> ({horas}h): </span><b>{numeroBonito(pcN_h)}</b></div>
          <div><span className="opacity-70">P Cmb <span className="text-red-700">Inimigo</span> ({horas}h): </span><b>{numeroBonito(pcI_h)}</b></div>
          <div className="sm:col-span-2">
            <span className="opacity-70">PRC projetado ({horas}h): </span>
            <b>{numeroBonito(prc_h)} : 1</b>
          </div>
        </div>

        <div className="text-xs opacity-70 mt-2">
          Observação: ajuste coeficientes, apoios e multiplicadores conforme o cenário. A degradação
          é escalada pela janela de horas selecionada.
        </div>
      </div>
    </Card>
  );
}

function NotasPreenchimento() {
  return (
    <Card title="Como preencher passo a passo (em caso de dúvida siga o DAMEPLAN)">
      <ol className="text-sm list-decimal ml-5 space-y-1">
        <li>
          <b>Elementos de manobra:</b> adicione GU/U/SU de cada lado, informe <i>Qtd</i>, <i>Postura</i>,
          <i>Visibilidade</i> e <i>Terreno</i>.
        </li>
        <li>
          <b>Apoios de Fogo:</b> digite a <i>quantidade</i> de cada tipo. O
          somatório entra no cálculo do P Cmb.
        </li>
        <li>
          <b>Confrontação:</b> lance as unidades de <i>GE</i> e <i>AAAe</i>. O app define
          automaticamente <i>Superioridade/Equivalência/Inferioridade</i> nos multiplicadores.
        </li>
        <li>
          <b>Multiplicadores:</b> ajuste Moral, Efetivo, Experiência, Enquadramento, Logística,
          Comunicações (o GE/AAAe virá da confrontação).
        </li>
        <li>
          <b>Tipo de Operação:</b> selecione para ver a <i>relação mínima</i> exigida e se o PRC <i>atende</i>.
        </li>
        <li>
          <b>Degradação:</b> escolha a ação tática (tabela base) e as <i>horas</i> para projetar P Cmb/PRC ao longo do tempo.
        </li>
      </ol>
    </Card>
  );
}

// ------------------------------ PRC – Antes/Depois (geral e por elemento) ------------------------------
// ===================== PRCDetalhado (SUBSTITUIR INTEIRO) =====================
function PRCDetalhado({
  nossos,
  ini,
  redAtac,
  redDef,
  apfN,  // vindo do App (total Apoios Amigo)
  apfI,  // vindo do App (total Apoios Inimigo)
  meta,
  onExport,          // ✅ NOVO
}: {
  nossos: ElemManobra[];
  ini: ElemManobra[];
  redAtac: number;
  redDef: number;
  apfN: number;
  apfI: number;
  meta: {
    missao: string;
    relMin: string;
    prcAtual: number;
    atende: boolean;
    horas: number;
    redAtac: number;
    redDef: number;
  };
  onExport?: () => void; // ✅ NOVO
}) {
  // ---- Tipos internos ----
  type Row = { nome: string; antes: number; depois: number; perc: number | null };
  type BuildResult = {
    linhas: Row[];
    totalAntes: number;
    totalDepois: number;
    totalPerc: number | null;
  };

  // ---- Helpers locais ----
  const fmt = (x: number) => numeroBonito(x);
  const fmtPct = (x: number | null) => (x == null || !isFinite(x) ? "–" : `${Math.round(x)}%`);
  const limpaSufixo = (s: string) => s.replace(/\s*\((nossas|ini)\)\s*$/i, "");

  // média dos multiplicadores (mantendo técnica atual de ler do DOM)
  const getMedia = (side: "Nossas forças" | "Inimigo") => {
    const multEl = document.getElementById(`mult-${side}`);
    return multEl ? Number(multEl.getAttribute("data-media") || 1) : 1;
  };

  // contribuição básica de um elemento (sem ApF, sem média)
  const contribElem = (e: ElemManobra) => {
    const base =
      (e.tipo === "GU" ? GU_COEF[e.nome] : e.tipo === "U" ? U_COEF[e.nome] : SU_COEF[e.nome]) || [0, 0];
    const coef = e.postura === "Ofensiva" ? base[0] : base[1];
    const vis = (VISIBILIDADE as any)[e.vis];
    const ter = (TERRENO as any)[e.terreno];
    const pct = clampPct(e.prcPct ?? 100) / 100; // % PRC da tropa
    return e.qtd * coef * vis * ter * pct;
  };

  // Barrinha de contribuição (recebe fração 0..1)
  const Bar = ({ frac, side }: { frac: number; side: "amigo" | "inimigo" }) => (
    <div className="h-1.5 rounded bg-gray-100">
      <div
        className={`h-1.5 rounded ${side === "amigo" ? "bg-blue-300" : "bg-red-300"}`}
        style={{ width: `${Math.min(100, Math.max(0, frac) * 100)}%` }}
      />
    </div>
  );

  // Monta linhas, inclui Apoios como linha separada e retorna totais
  const build = (
    side: "Nossas forças" | "Inimigo",
    elems: ElemManobra[],
    red: number
  ): BuildResult => {
    const media = getMedia(side);
    const apf = side === "Nossas forças" ? apfN : apfI;

    const linhasElem: Row[] = elems
      .map((e) => {
        const bruto = contribElem(e);
        const antes = bruto * media;
        const depois = antes * (1 - red);
        const perc = antes > 0 ? (depois / antes) * 100 : null;
        const rotulo =
          `${e.ident && e.ident.trim() ? e.ident.trim() + " — " : ""}` +
          `${limpaSufixo(e.nome)} × ${e.qtd}`;
        return { nome: rotulo, antes, depois, perc };
      })
      .sort((a, b) => b.antes - a.antes);

    // Apoios de Fogo
    const apfAntes = apf * media;
    const apfDepois = apfAntes * (1 - red);
    const apfPerc = apfAntes > 0 ? (apfDepois / apfAntes) * 100 : null;

    const linhas: Row[] = [
      ...linhasElem,
      { nome: "Apoios de Fogo (somatório)", antes: apfAntes, depois: apfDepois, perc: apfPerc },
    ];

    const totalAntes = linhas.reduce((s, r) => s + r.antes, 0);
    const totalDepois = linhas.reduce((s, r) => s + r.depois, 0);
    const totalPerc = totalAntes > 0 ? (totalDepois / totalAntes) * 100 : null;

    return { linhas, totalAntes, totalDepois, totalPerc };
  };

  // ---- Calcula blocos Amigo e Inimigo ----
  const nos: BuildResult = build("Nossas forças", nossos, redAtac);
  const inim: BuildResult = build("Inimigo", ini, redDef);

  // PRC antes/depois para o quadro-resumo do topo deste card
  const prcAntes = inim.totalAntes > 0 ? nos.totalAntes / inim.totalAntes : Infinity;
  const prcDepois = inim.totalDepois > 0 ? nos.totalDepois / inim.totalDepois : Infinity;
  const prcPerc = isFinite(prcAntes) && prcAntes > 0 && isFinite(prcDepois)
    ? (prcDepois / prcAntes) * 100
    : NaN;

  return (
    <Card title="PRC – Antes e Depois dos embates (geral e por elemento)">
      <div className="text-sm space-y-3">
        {/* Resumo geral */}
        <div className="flex flex-wrap justify-between items-center gap-2 mb-2">
          <h2 className="text-base font-medium text-gray-800">
            PRC – Antes e Depois dos embates (geral e por elemento)
          </h2>
          {onExport && (
            <button
              onClick={onExport}
              className="px-3 py-1.5 text-sm rounded-xl border bg-white hover:bg-gray-50 whitespace-nowrap"
              title="Exportar relatório em PDF"
            >
              Exportar PDF
            </button>
          )}
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          <div className="rounded-xl border p-3 bg-white/70">
            <div className="font-medium mb-1">Geral (antes dos embates)</div>
            <div>P Cmb <span className="text-blue-700">Amigo</span>: <b>{fmt(nos.totalAntes)}</b></div>
            <div>P Cmb <span className="text-red-700">Inimigo</span>: <b>{fmt(inim.totalAntes)}</b></div>
            <div className="mt-1">PRC (antes): <b>{fmt(prcAntes)} : 1</b></div>
          </div>
          <div className="rounded-xl border p-3 bg-white/70">
            <div className="font-medium mb-1">Geral (depois dos embates)</div>
            <div>
              P Cmb <span className="text-blue-700">Amigo</span>: <b>{fmt(nos.totalDepois)}</b>
              <span className="opacity-80"> &nbsp; ( {fmtPct(nos.totalPerc)} do antes )</span>
            </div>
            <div>
              P Cmb <span className="text-red-700">Inimigo</span>: <b>{fmt(inim.totalDepois)}</b>
              <span className="opacity-80"> &nbsp; ( {fmtPct(inim.totalPerc)} do antes )</span>
            </div>
            <div>PRC (depois): <b>{fmt(prcDepois)} : 1</b></div>
            <div className="opacity-80">PRC após (% do antes): <b>{fmtPct(isNaN(prcPerc) ? null : prcPerc)}</b></div>
          </div>
        </div>

        {/* Tabelas por elemento */}
        <div className="grid md:grid-cols-2 gap-4">
          {/* Amigo */}
          <div>
            <div className="font-medium mb-2 text-blue-700">Amigo — por elemento</div>
            <table className="w-full text-sm">
              <thead className="text-left opacity-70">
                <tr>
                  <th className="py-1">Elemento</th>
                  <th className="py-1 w-32">Contrib. (% do total)</th>
                  <th className="py-1 text-right">Antes</th>
                  <th className="py-1 text-right">Depois</th>
                  <th className="py-1 text-right">Após (%)</th>
                </tr>
              </thead>
              <tbody>
                {nos.linhas.map((r: Row, i: number) => (
                  <tr key={i} className="border-t align-middle">
                    <td className="py-1 pr-2 text-blue-700">
                      <span className="inline-block max-w-[28ch] truncate align-bottom" title={r.nome}>
                        {r.nome}
                      </span>
                    </td>
                    <td className="py-1 pr-2" title={`${nos.totalAntes > 0 ? Math.round((r.antes / nos.totalAntes) * 100) : 0}% do total`}>
                      <Bar side="amigo" frac={nos.totalAntes > 0 ? r.antes / nos.totalAntes : 0} />
                    </td>
                    <td className="py-1 text-right">{fmt(r.antes)}</td>
                    <td className="py-1 text-right">{fmt(r.depois)}</td>
                    <td className="py-1 text-right">{fmtPct(r.perc)}</td>
                  </tr>
                ))}
                <tr className="border-t font-semibold">
                  <td className="py-1 pr-2 text-blue-700">Total</td>
                  <td className="py-1 pr-2" />
                  <td className="py-1 text-right">{fmt(nos.totalAntes)}</td>
                  <td className="py-1 text-right">{fmt(nos.totalDepois)}</td>
                  <td className="py-1 text-right">{fmtPct(nos.totalPerc)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Inimigo */}
          <div>
            <div className="font-medium mb-2 text-red-700">Inimigo — por elemento</div>
            <table className="w-full text-sm">
              <thead className="text-left opacity-70">
                <tr>
                  <th className="py-1">Elemento</th>
                  <th className="py-1 w-32">Contrib. (% do total)</th>
                  <th className="py-1 text-right">Antes</th>
                  <th className="py-1 text-right">Depois</th>
                  <th className="py-1 text-right">Após (%)</th>
                </tr>
              </thead>
              <tbody>
                {inim.linhas.map((r: Row, i: number) => (
                  <tr key={i} className="border-t align-middle">
                    <td className="py-1 pr-2 text-red-700">
                      <span className="inline-block max-w-[28ch] truncate align-bottom" title={r.nome}>
                        {r.nome}
                      </span>
                    </td>
                    <td className="py-1 pr-2" title={`${inim.totalAntes > 0 ? Math.round((r.antes / inim.totalAntes) * 100) : 0}% do total`}>
                      <Bar side="inimigo" frac={inim.totalAntes > 0 ? r.antes / inim.totalAntes : 0} />
                    </td>
                    <td className="py-1 text-right">{fmt(r.antes)}</td>
                    <td className="py-1 text-right">{fmt(r.depois)}</td>
                    <td className="py-1 text-right">{fmtPct(r.perc)}</td>
                  </tr>
                ))}
                <tr className="border-t font-semibold">
                  <td className="py-1 pr-2 text-red-700">Total</td>
                  <td className="py-1 pr-2" />
                  <td className="py-1 text-right">{fmt(inim.totalAntes)}</td>
                  <td className="py-1 text-right">{fmt(inim.totalDepois)}</td>
                  <td className="py-1 text-right">{fmtPct(inim.totalPerc)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="text-xs opacity-70">
          Nota: A coluna <i>Após (%)</i> mostra a fração preservada após a degradação
          (<code>depois ÷ antes × 100</code>), tanto por elemento quanto no total.
        </div>
      </div>
    </Card>
  );
}
// ===================== FIM PRCDetalhado =====================

// ------------------------------ App ------------------------------
export default function App() {
  const [nossos, setNossos] = useState<ElemManobra[]>([]);
  const [ini, setIni] = useState<ElemManobra[]>([]);
  const [multN, setMultN] = useState<Record<string, string>>({ engenharia: "Superioridade" });
  const [multI, setMultI] = useState<Record<string, string>>({ engenharia: mapEng("Superioridade") });
  // Totais de Apoio de Fogo (lado amigo e inimigo)
  const [apfN, setApfN] = useState(0); // Nossas forças / Amigo
  const [apfI, setApfI] = useState(0); // Inimigo

  const [resetKey, setResetKey] = useState(0);

  const handleClear = () => {
    if (!window.confirm("Apagar todos os campos e voltar ao padrão?")) return;
    setNossos([]);
    setIni([]);
    setMultN({ engenharia: "Superioridade" });
    setMultI({ engenharia: mapEng("Superioridade") });
    setMissao("Ataque Principal");
    setDeg("Ataque 3:1");
    setHoras(24);
    setShowDetalhe(true);
    setResetKey((k) => k + 1);
  };

  const handleGE = useCallback((statusN: "Superioridade" | "Equivalência" | "Inferioridade",
                                statusI: "Superioridade" | "Equivalência" | "Inferioridade") => {
    setMultN((m) => ({ ...m, ge: statusN }));
    setMultI((m) => ({ ...m, ge: statusI }));
  }, []);
  const handleAAAE = useCallback((statusN: "Superioridade" | "Equivalência" | "Inferioridade",
                                  statusI: "Superioridade" | "Equivalência" | "Inferioridade") => {
    setMultN((m) => ({ ...m, aaae: statusN }));
    setMultI((m) => ({ ...m, aaae: statusI }));
  }, []);

  const [missao, setMissao] = useState<string>("Ataque Principal");
  const [deg, setDeg] = useState<string>("Ataque 3:1");
  const [horas, setHoras] = useState<number>(24);

  const pcN = useMemo(
    () => somaPC("Nossas forças", nossos, apfN),
    [nossos, multN, apfN] // 🆕 inclui apfN
  );

  const pcI = useMemo(
    () => somaPC("Inimigo", ini, apfI),
    [ini, multI, apfI]   // 🆕 inclui apfI
  );

  const relMin = MISSAO_RELACAO[missao];
  const { ratio: ratioMin } = parseRelacao(relMin);
  const prcAtual = pcI > 0 ? pcN / pcI : Infinity;
  const atende = prcAtual >= ratioMin;

  const degInfo = DEGRADACAO[deg];
  const fatorHoras = Math.max(0, horas) / 24;
  const redAtac = Math.min((degInfo?.atacante ?? 0) * fatorHoras, 0.95);
  const redDef = Math.min((degInfo?.defensor ?? 0) * fatorHoras, 0.95);
  const pcN_h = pcN * (1 - redAtac);
  const pcI_h = pcI * (1 - redDef);
  const prc_h = pcI_h > 0 ? pcN_h / pcI_h : Infinity;

  const [showDetalhe, setShowDetalhe] = useState<boolean>(true);
    useEffect(() => {
        // sempre que Engenharia do Amigo (multN.engenharia) mudar,
        // espelha automaticamente no Inimigo (multI.engenharia)
        const v = multN.engenharia;
        if (!v) return; // se ainda não há valor, não faz nada
        const mapped = mapEng(v); // Superioridade <-> Inferioridade, Equivalência -> Equivalência
        setMultI((m) => (m.engenharia === mapped ? m : { ...m, engenharia: mapped }));
      }, [multN.engenharia]);

// === Exportar PDF (resumo + projeção + (opcional) detalhamento) ===
const exportPDF = () => {
  const doc = new jsPDF({ unit: "pt" });

  // Título
  doc.setFontSize(14);
  doc.text("SISPRC – Relatório", 40, 40);

  // Bloco: Missão / Relação mínima / PRC atual / Status
  const y0 = 60;
  doc.setFontSize(11);
  doc.text(`Missão: ${missao}`, 40, y0);
  doc.text(`Relação mínima: ${relMin}`, 40, y0 + 18);
  doc.text(`PRC Atual: ${numeroBonito(prcAtual)} : 1`, 40, y0 + 36);
  doc.text(`Status: ${atende ? "ATENDE" : "NÃO atende"}`, 40, y0 + 54);

  // Tabela rápida: P Cmb atual e Apoios
  autoTable(doc, {
    startY: y0 + 74,
    head: [["Lado", "P Cmb", "Somatório de Apoios de Fogo"]],
    body: [
      ["Amigo", numeroBonito(pcN), apfN.toFixed(2)],
      ["Inimigo", numeroBonito(pcI), apfI.toFixed(2)],
    ],
    styles: { fontSize: 10 },
    headStyles: { fillColor: [0, 0, 0] },
  });

  // Projeção com degradação
  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 18,
    head: [["Janela (h)", "Red. Atac (%)", "Red. Def (%)", "P Cmb N", "P Cmb I", "PRC"]],
    body: [[
      String(horas),
      (redAtac * 100).toFixed(0),
      (redDef * 100).toFixed(0),
      numeroBonito(pcN_h),
      numeroBonito(pcI_h),
      `${numeroBonito(prc_h)} : 1`,
    ]],
    styles: { fontSize: 10 },
    headStyles: { fillColor: [20, 20, 20] },
  });

  // (Opcional) — detalhamento por elemento “ANTES x DEPOIS”
  // Usa um build simples só para o PDF (não mexe no seu PRCDetalhado do UI):
  const buildForPDF = (
    side: "Nossas forças" | "Inimigo",
    elems: ElemManobra[],
    red: number,
    apfTotal: number
  ) => {
    const multEl = document.getElementById(`mult-${side}`);
    const media = multEl ? Number(multEl.getAttribute("data-media") || 1) : 1;

    const contribElem = (e: ElemManobra) => {
      const base =
        (e.tipo === "GU" ? GU_COEF[e.nome] : e.tipo === "U" ? U_COEF[e.nome] : SU_COEF[e.nome]) || [0, 0];
      const coef = e.postura === "Ofensiva" ? base[0] : base[1];
      const vis = (VISIBILIDADE as any)[e.vis];
      const ter = (TERRENO as any)[e.terreno];
      const pct = clampPct(e.prcPct ?? 100) / 100;
      return e.qtd * coef * vis * ter * pct;
    };

    const linhas = elems
      .map((e) => {
        const bruto = contribElem(e);
        const antes = bruto * media;
        const depois = antes * (1 - red);
        const label =
          `${e.ident && e.ident.trim() ? e.ident.trim() + " — " : ""}${limpaSufixo(e.nome)} × ${e.qtd}`;
        return { label, antes, depois, perc: antes > 0 ? (depois / antes) * 100 : null };
      })
      .sort((a, b) => b.antes - a.antes);

    // Apoios como linha
    const apfAntes = apfTotal * media;
    const apfDepois = apfAntes * (1 - red);
    linhas.push({ label: "Apoios de Fogo (somatório)", antes: apfAntes, depois: apfDepois, perc: apfAntes ? (apfDepois / apfAntes) * 100 : null });

    const totalAntes = linhas.reduce((s, r) => s + r.antes, 0);
    const totalDepois = linhas.reduce((s, r) => s + r.depois, 0);

    return {
      totalAntes, totalDepois, linhas
    };
  };

  // ✅ DEPOIS (usa nome diferente para não colidir com o estado "ini")
  const nos = buildForPDF("Nossas forças", nossos, redAtac, apfN);
  const inim = buildForPDF("Inimigo", ini, redDef, apfI);

  // Tabelas de detalhamento (Amigo e Inimigo)
  const startYDetalhe = (doc as any).lastAutoTable.finalY + 24;
  autoTable(doc, {
    startY: startYDetalhe,
    head: [["AMIGO — Elemento", "Antes", "Depois", "Após (%)"]],
    body: nos.linhas.map((r) => [
      r.label,
      numeroBonito(r.antes),
      numeroBonito(r.depois),
      r.perc == null ? "–" : `${Math.round(r.perc)}%`,
    ]).concat([
      ["Total", numeroBonito(nos.totalAntes), numeroBonito(nos.totalDepois), nos.totalAntes ? `${Math.round((nos.totalDepois / nos.totalAntes) * 100)}%` : "–"],
    ]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [0, 80, 160] },
  });

  // ... tabela AMIGO (igual) ...

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 16,
    head: [["INIMIGO — Elemento", "Antes", "Depois", "Após (%)"]],
    body: inim.linhas.map((r) => [
      r.label,
      numeroBonito(r.antes),
      numeroBonito(r.depois),
      r.perc == null ? "–" : `${Math.round(r.perc)}%`,
    ]).concat([
      ["Total", numeroBonito(inim.totalAntes), numeroBonito(inim.totalDepois), inim.totalAntes ? `${Math.round((inim.totalDepois / inim.totalAntes) * 100)}%` : "–"],
    ]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [170, 20, 20] },
  });


  // Rodapé
  doc.setFontSize(9);
  doc.text("Fonte: CE 5.80 DAMEPLAN.", 40, (doc as any).lastAutoTable.finalY + 24);

  doc.save("sisprc_relatorio.pdf");
};


  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 p-6">
      <div className="max-w-screen-2xl mx-auto space-y-6 px-4">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/ECEME.png" alt="ECEME" className="w-12 h-12" />
            <h1 className="text-2xl font-bold">
              SISPRC – Sistema de PRC e Embates (VERSÃO AZUVER)
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs opacity-70 hidden sm:inline">
              Feito por: Maj Villela
            </span>
            <button
              onClick={handleClear}
              className="px-3 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm"
              title="Apagar todos os campos"
            >
              Apagar formulário
            </button>
          </div>
        </header>

        <NotasPreenchimento />

        <div className="grid lg:grid-cols-2 grid-cols-1 gap-4">
          <Card
            title="Nossas forças – Elementos de manobra e de Apoio de Fogo"
            className="text-blue-700"          // <<< tudo dentro do card em azul
            titleClassName="text-blue-700"     // <<< título em azul
          >
            <SelecionaElem
              key={`n-${resetKey}`}
              side="Nossas forças"
              data={nossos}
              setData={setNossos}
              resetKey={resetKey}
              onApfTotalChange={setApfN}   // ✅ Novo callback
            />
          </Card>

          <Card 
            title="Inimigo – Elementos de manobra e de Apoio de Fogo"
            className="text-red-700"          // <<< tudo dentro do card em vermelho
            titleClassName="text-red-700"     // <<< título em vermelho
          >
            <SelecionaElem
              key={`i-${resetKey}`}
              side="Inimigo"
              data={ini}
              setData={setIni}
              resetKey={resetKey}
              onApfTotalChange={setApfI}   // ✅ Novo callback
            />
          </Card>
        </div>

        <div className="grid lg:grid-cols-2 grid-cols-1 gap-4">
          <ConfrontacaoGE   key={`ge-${resetKey}`} onGE={handleGE} />
          <ConfrontacaoAAAE key={`aa-${resetKey}`} onAAAE={handleAAAE} />
        </div>

        <div className="grid lg:grid-cols-2 grid-cols-1 gap-4">
          <Card 
          title="Multiplicadores – Nossas forças"
          className="text-blue-700"          // <<< tudo dentro do card em azul
          titleClassName="text-blue-700"     // <<< título em azul
          >
            <Multiplicadores side="Nossas forças" values={multN} setValues={setMultN} />
          </Card>
          <Card 
          title="Multiplicadores – Inimigo"
          className="text-red-700"          // <<< tudo dentro do card em vermelho
          titleClassName="text-red-700"     // <<< título em vermelho
          >
            
            <Multiplicadores side="Inimigo" values={multI} setValues={setMultI} />
          </Card>
        </div>

        <div className="grid lg:grid-cols-3 grid-cols-1 gap-4">
          <Card title="Resultado – PRC">
            <ResultadoPRC pcNossas={pcN} pcIni={pcI} />
          </Card>
          <Card title="Tipo de Operação">
            <div className="space-y-2 text-sm">
              <div>
                <label className="text-xs">Missão</label>
                <select className="w-full border rounded-xl p-2" value={missao} onChange={(e) => setMissao(e.target.value)}>
                  {Object.keys(MISSAO_RELACAO).map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </select>
              </div>
              <div>
                Relação mínima: <b>{relMin}</b>
              </div>
              <div>
                Status:{" "}
                <b className={atende ? "text-green-700" : "text-red-700"}>
                  {atende ? "ATENDE" : "NÃO atende"}
                </b>
              </div>
            </div>
          </Card>
          <Card title={`Cenário em ${horas}h – Degradação do PRC`}>
            <div className="space-y-2 text-sm">
              <label className="text-xs">Ação tática (subconjunto)</label>
              <select className="w-full border rounded-xl p-2" value={deg} onChange={(e) => setDeg(e.target.value)}>
                {Object.keys(DEGRADACAO).map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
              <div className="opacity-70">{DEGRADACAO[deg]?.nota} (referência em 24h)</div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs">Horas</label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    className="w-full border rounded-xl p-2"
                    value={horas}
                    onChange={(e) => setHoras(Number(e.target.value))}
                  />
                </div>
                <div className="flex flex-col justify-end text-xs opacity-70">
                  <div>Escala: {(Math.max(0, horas) / 24).toFixed(2)}× (vs 24h)</div>
                  <div>
                    Redução atac: {(redAtac * 100).toFixed(0)}% &nbsp;|&nbsp; Redução def:{" "}
                    {(redDef * 100).toFixed(0)}%
                  </div>
                </div>
              </div>

              <hr className="my-2" />
              <div>
                P Cmb <span className="text-blue-700">Amigo</span> {horas}h: <b>{numeroBonito(pcN_h)}</b>
              </div>
              <div>
                P Cmb <span className="text-red-700">Inimigo</span> {horas}h: <b>{numeroBonito(pcI_h)}</b>
              </div>
              <div>
                PRC {horas}h: <b>{numeroBonito(prc_h)} : 1</b>
              </div>
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-4">
          <ResumoOperacao
            missao={missao}
            relMin={relMin}
            prcAtual={prcAtual}
            atende={atende}
            horas={horas}
            redAtac={redAtac}
            redDef={redDef}
            pcN_h={pcN_h}
            pcI_h={pcI_h}
            prc_h={prc_h}
          />
        </div>

        {/* Toggle do detalhamento */}
        <div className="flex items-center justify-between">
          <div className="text-sm opacity-70">Detalhamento de PRC por elemento</div>
          <button
            className="px-3 py-2 text-sm rounded-xl border bg-white hover:bg-gray-50"
            onClick={() => setShowDetalhe(v => !v)}
          >
            {showDetalhe ? "Ocultar detalhamento" : "Mostrar detalhamento"}
          </button>
        </div>

        {/* PRC detalhado – antes e depois, geral e por elemento */}
        {showDetalhe && (
          <div className="grid grid-cols-1 gap-4">
            <PRCDetalhado
              nossos={nossos}
              ini={ini}
              redAtac={redAtac}
              redDef={redDef}
              apfN={apfN}     // 🆕
              apfI={apfI}     // 🆕
              meta={{ missao, relMin, prcAtual, atende, horas, redAtac, redDef }}
              onExport={exportPDF}   // ✅ ADICIONE ESTA LINHA
            />
          </div>
        )}

        <footer className="text-xs opacity-60 pt-4">
          Fonte: CE 5.80 DAMEPLAN.
        </footer>
      </div>
    </div>
  );
}
