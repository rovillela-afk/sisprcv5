import React, { useMemo, useState, useEffect, useCallback } from "react";

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
    label: "Enquadramento",
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
    label: "Situação do Ap de GE",
    opts: { Superioridade: 2, Equivalência: 1, Inferioridade: 0.5 },
  },
  {
    key: "aaae",
    label: "Situação do Ap de AAAe",
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

// Velocidades – simplificado
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

// ------------------------------ Componentes base ------------------------------
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl shadow p-4 bg-white/80 border border-gray-100">
      <div className="text-lg font-semibold mb-3">{title}</div>
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
};

function SelecionaElem({
  side,
  data,
  setData,
}: {
  side: "Nossas forças" | "Inimigo";
  data: ElemManobra[];
  setData: (d: ElemManobra[]) => void;
}) {
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
      },
    ]);

  const catOptions = [
    { k: "GU", label: "Grande Unidade" },
    { k: "U", label: "Unidade" },
    { k: "SU", label: "Subunidade" },
  ];

  const optionsMap: Record<string, string[]> = {
    GU: Object.keys(GU_COEF).filter((n) => (side === "Inimigo" ? n.includes("(ini)") : n.includes("(nossas)"))),
    U: Object.keys(U_COEF).filter((n) => (side === "Inimigo" ? n.includes("(ini)") : n.includes("(nossas)"))),
    SU: Object.keys(SU_COEF).filter((n) => (side === "Inimigo" ? n.includes("(ini)") : n.includes("(nossas)"))),
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
            <label className="text-xs">Elemento</label>
            <select
              className="w-full max-w-full border rounded-xl p-2"
              value={e.nome}
              onChange={(ev) => setData(data.map((d, idx) => (idx === i ? { ...d, nome: ev.target.value } : d)))}
            >
              {optionsMap[e.tipo].map((n) => (
                <option key={n} value={n} title={n}>
                  {n}
                </option>
              ))}
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
        <label className="text-xs">Apoios de Fogo (somatório)</label>
        <Apoios side={side} />
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

  return (
    <div className="space-y-2">
      {MULTIPLICADORES_KEYS.map((k) => (
        <div key={`${side}-${k.key}`} className="grid grid-cols-2 gap-2 items-center">
          <div className="text-sm">{k.label}</div>
          <select
            className="border rounded-xl p-2"
            value={values[k.key] ?? Object.keys(k.opts)[0]}
            onChange={(ev) => setValues({ ...values, [k.key]: ev.target.value })}
          >
            {Object.entries(k.opts).map(([nome, val]) => (
              <option key={nome} value={nome}>
                {nome} ({val})
              </option>
            ))}
          </select>
        </div>
      ))}
      <div className="pt-2 text-sm">
        Média dos fatores: <b>{numeroBonito(media)}</b>
      </div>
      <div id={`mult-${side}`} data-media={media} />
    </div>
  );
}

// ------------------------------ P Cmb / PRC ------------------------------
function somaPC(side: "Nossas forças" | "Inimigo", elems: ElemManobra[]) {
  // P Cmb = [(Σ (valor relativo Elm M × fator vis × fator terreno)) + Σ(ApF)] × média fatores
  const sumElm = elems.reduce((acc, e) => {
    const base =
      (e.tipo === "GU" ? GU_COEF[e.nome] : e.tipo === "U" ? U_COEF[e.nome] : SU_COEF[e.nome]) || [0, 0];
    const coef = e.postura === "Ofensiva" ? base[0] : base[1];
    const vis = (VISIBILIDADE as any)[e.vis];
    const ter = (TERRENO as any)[e.terreno];
    return acc + e.qtd * coef * vis * ter;
  }, 0);

  const apfEl = document.getElementById(`apf-${side}`);
  const apf = apfEl ? Number(apfEl.getAttribute("data-total") || 0) : 0;
  const multEl = document.getElementById(`mult-${side}`);
  const media = multEl ? Number(multEl.getAttribute("data-media") || 1) : 1;

  return (sumElm + apf) * media;
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
        P Cmb – Nossas forças: <b>{numeroBonito(pcNossas)}</b>
      </div>
      <div>
        P Cmb – Inimigo: <b>{numeroBonito(pcIni)}</b>
      </div>
      <div className="text-xl font-semibold">PRC = {numeroBonito(prc)} : 1</div>
      <div className="text-sm opacity-75">Leitura: {leitura}</div>
    </div>
  );
}

// ------------------------------ APOIOS DE FOGO (com quantidade) ------------------------------
function Apoios({ side }: { side: "Nossas forças" | "Inimigo" }) {
  // counts[k] = quantidade de unidades daquele tipo
  const [counts, setCounts] = React.useState<Record<string, number>>({});

  const options = Object.keys(APF_COEF).filter((n) =>
    side === "Inimigo" ? n.includes("(ini)") : n.includes("(nossas)")
  );

  const total = options.reduce((acc, k) => acc + (APF_COEF[k] || 0) * (counts[k] || 0), 0);

  return (
    <div>
      <div className="grid md:grid-cols-3 grid-cols-1 gap-2">
        {options.map((k) => (
          <label key={k} className="flex items-center gap-2 text-sm">
            <span className="truncate" title={k}>
              {k}
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
      <div id={`apf-${side}`} data-total={total} />
    </div>
  );
}

// ------------------------------ 3.7.9 Confrontação (GE / AAAe) ------------------------------
// Coeficientes mínimos – amplie conforme o documento.
const GE_COEF: Record<string, number> = {
  "BGE (nossas)": 3, "Cia GE (nossas)": 1, "Pel GE (nossas)": 0.3,
  "BGE (ini)": 2.5, "Cia GE (ini)": 0.8, "Pel GE (ini)": 0.2,
};
const AAAE_COEF: Record<string, number> = {
  "GAAAe/DE (nossas)": 2.0, "Bia AAAe (nossas)": 0.5,
  "GAAAe (35/40) (ini)": 1.8, "GAAAe Ms (ini)": 2.0, "Bia AAAe Can (ini)": 0.4,
};

type StatusTri = "Superioridade" | "Equivalência" | "Inferioridade";
function confrontoStatus(somaN: number, somaI: number): [StatusTri, StatusTri] {
  const eps = 1e-6;
  if (Math.abs(somaN - somaI) < eps) return ["Equivalência", "Equivalência"];
  return somaN > somaI ? ["Superioridade", "Inferioridade"] : ["Inferioridade", "Superioridade"];
}

type ConfrontacaoProps = {
  onGE: (statusNossas: StatusTri, statusInimigo: StatusTri) => void;
  onAAAE: (statusNossas: StatusTri, statusInimigo: StatusTri) => void;
};

// ⚠️ Usamos strings nos inputs para manter o cursor estável durante a digitação.
const Confrontacao379 = React.memo(function Confrontacao379({ onGE, onAAAE }: ConfrontacaoProps) {
  const [geN, setGeN] = useState<Record<string, string>>({});
  const [geI, setGeI] = useState<Record<string, string>>({});
  const [aaN, setAaN] = useState<Record<string, string>>({});
  const [aaI, setAaI] = useState<Record<string, string>>({});

  const sum = (map: Record<string, string>, table: Record<string, number>) =>
    Object.entries(map).reduce((a, [k, v]) => a + (table[k] || 0) * (parseFloat(v) || 0), 0);

  const sGE_N = sum(geN, GE_COEF);
  const sGE_I = sum(geI, GE_COEF);
  const [geNStatus, geIStatus] = confrontoStatus(sGE_N, sGE_I);

  const sAA_N = sum(aaN, AAAE_COEF);
  const sAA_I = sum(aaI, AAAE_COEF);
  const [aaNStatus, aaIStatus] = confrontoStatus(sAA_N, sAA_I);

  // Atualiza o pai apenas quando o status muda (evita “piscadas”)
  const lastGE = React.useRef<[StatusTri, StatusTri] | null>(null);
  const lastAA = React.useRef<[StatusTri, StatusTri] | null>(null);

  useEffect(() => {
    const cur: [StatusTri, StatusTri] = [geNStatus, geIStatus];
    if (!lastGE.current || lastGE.current[0] !== cur[0] || lastGE.current[1] !== cur[1]) {
      onGE(cur[0], cur[1]);
      lastGE.current = cur;
    }
  }, [geNStatus, geIStatus, onGE]);

  useEffect(() => {
    const cur: [StatusTri, StatusTri] = [aaNStatus, aaIStatus];
    if (!lastAA.current || lastAA.current[0] !== cur[0] || lastAA.current[1] !== cur[1]) {
      onAAAE(cur[0], cur[1]);
      lastAA.current = cur;
    }
  }, [aaNStatus, aaIStatus, onAAAE]);

  const Num = ({
    label,
    value,
    onChange,
  }: {
    label: string;
    value: string;
    onChange: (s: string) => void;
  }) => (
    <label className="flex items-center gap-2 text-sm">
      <span className="truncate" title={label}>{label}</span>
      <span className="ml-auto text-xs opacity-70">({(GE_COEF[label] ?? AAAE_COEF[label] ?? 0)})</span>
      <input
        type="number"
        min={0}
        step="1"
        className="w-16 border rounded-xl p-1 text-right"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}   // mantém string durante digitação
        onBlur={(e) => onChange(e.target.value === "" ? "0" : e.target.value)} // normaliza vazio
      />
    </label>
  );

  return (
    <Card title="Confrontação de GE e AAAe">
      <div className="grid lg:grid-cols-2 gap-4">
        {/* GE */}
        <div className="space-y-2">
          <div className="font-medium">GE – Nossas</div>
          {Object.keys(GE_COEF).filter(k=>k.includes("(nossas)")).map(k=>(
            <Num key={k} label={k} value={geN[k] ?? ""} onChange={(s)=>setGeN(v=>({...v,[k]:s}))}/>
          ))}
          <div className="font-medium mt-2">GE – Inimigo</div>
          {Object.keys(GE_COEF).filter(k=>k.includes("(ini)")).map(k=>(
            <Num key={k} label={k} value={geI[k] ?? ""} onChange={(s)=>setGeI(v=>({...v,[k]:s}))}/>
          ))}
          <div className="text-xs mt-1">Status GE — Nossas: <b>{geNStatus}</b> | Inimigo: <b>{geIStatus}</b></div>
        </div>

        {/* AAAe */}
        <div className="space-y-2">
          <div className="font-medium">AAAe – Nossas</div>
          {Object.keys(AAAE_COEF).filter(k=>k.includes("(nossas)")).map(k=>(
            <Num key={k} label={k} value={aaN[k] ?? ""} onChange={(s)=>setAaN(v=>({...v,[k]:s}))}/>
          ))}
          <div className="font-medium mt-2">AAAe – Inimigo</div>
          {Object.keys(AAAE_COEF).filter(k=>k.includes("(ini)")).map(k=>(
            <Num key={k} label={k} value={aaI[k] ?? ""} onChange={(s)=>setAaI(v=>({...v,[k]:s}))}/>
          ))}
          <div className="text-xs mt-1">Status AAAe — Nossas: <b>{aaNStatus}</b> | Inimigo: <b>{aaIStatus}</b></div>
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
          <div><span className="opacity-70">P Cmb Nossas ({horas}h): </span><b>{numeroBonito(pcN_h)}</b></div>
          <div><span className="opacity-70">P Cmb Inimigo ({horas}h): </span><b>{numeroBonito(pcI_h)}</b></div>
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
    <Card title="Como preencher passo a passo (siga o DAMEPLAN)">
      <ol className="text-sm list-decimal ml-5 space-y-1">
        <li>
          <b>Elementos de manobra:</b> adicione GU/U/SU de cada lado, informe <i>Qtd</i>, <i>Postura</i>,
          <i>Visibilidade</i> e <i>Terreno</i>.
        </li>
        <li>
          <b>Apoios de Fogo:</b> digite a <i>quantidade</i> de cada tipo (ex.: 4× GAC 155 AP + 1× GAC 155 AR). O
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

// ------------------------------ App ------------------------------
export default function App() {
  const [nossos, setNossos] = useState<ElemManobra[]>([]);
  const [ini, setIni] = useState<ElemManobra[]>([]);
  const [multN, setMultN] = useState<Record<string, string>>({});
  const [multI, setMultI] = useState<Record<string, string>>({});

// === Callbacks memorizadas para Confrontação 3.7.9 ===
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

  const pcN = useMemo(() => somaPC("Nossas forças", nossos), [nossos, multN]);
  const pcI = useMemo(() => somaPC("Inimigo", ini), [ini, multI]);

  const relMin = MISSAO_RELACAO[missao];
  const { ratio: ratioMin } = parseRelacao(relMin);
  const prcAtual = pcI > 0 ? pcN / pcI : Infinity;
  const atende = prcAtual >= ratioMin;

  // Degradação (N horas)
  const degInfo = DEGRADACAO[deg];
  const fatorHoras = Math.max(0, horas) / 24;
  const redAtac = Math.min((degInfo?.atacante ?? 0) * fatorHoras, 0.95);
  const redDef = Math.min((degInfo?.defensor ?? 0) * fatorHoras, 0.95);
  const pcN_h = pcN * (1 - redAtac);
  const pcI_h = pcI * (1 - redDef);
  const prc_h = pcI_h > 0 ? pcN_h / pcI_h : Infinity;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 p-6">
      <div className="max-w-screen-2xl mx-auto space-y-6 px-4">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/ECEME.png"
              alt="ECEME"
              className="w-12 h-12"
            />
            <h1 className="text-2xl font-bold">
              SIMPRC – Sistema de Modelagem de PRC e Embates
            </h1>
          </div>
          <span className="text-xs opacity-70">
            Feito por: Maj Villela
          </span>
        </header>

        <div className="grid lg:grid-cols-2 grid-cols-1 gap-4">
          <Card title="Nossas forças – Elementos de manobra & Ap F">
            <SelecionaElem side="Nossas forças" data={nossos} setData={setNossos} />
          </Card>
          <Card title="Inimigo – Elementos de manobra & Ap F">
            <SelecionaElem side="Inimigo" data={ini} setData={setIni} />
          </Card>
        </div>

        {/* 3.7.9 – Confrontação (preenche GE/AAAe dos multiplicadores) */}
        <Confrontacao379 onGE={handleGE} onAAAE={handleAAAE} />

        <div className="grid lg:grid-cols-2 grid-cols-1 gap-4">
          <Card title="Multiplicadores – Nossas forças">
            <Multiplicadores side="Nossas forças" values={multN} setValues={setMultN} />
          </Card>
          <Card title="Multiplicadores – Inimigo">
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
                P Cmb Nossas {horas}h: <b>{numeroBonito(pcN_h)}</b>
              </div>
              <div>
                P Cmb Inimigo {horas}h: <b>{numeroBonito(pcI_h)}</b>
              </div>
              <div>
                PRC {horas}h: <b>{numeroBonito(prc_h)} : 1</b>
              </div>
            </div>
          </Card>
        </div>

        <div className="grid lg:grid-cols-2 grid-cols-1 gap-4">
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
          <NotasPreenchimento />
        </div>


        <footer className="text-xs opacity-60 pt-4">
          Fonte: CE 5.80 DAMEPLAN.
        </footer>
      </div>
    </div>
  );
}
