// Utilidades de exportação (PDF e Excel) para DRE.
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { fmtBRL, mesNome } from "@/lib/finance";

export type LinhaExport = { label: string; valor: number; pct?: number; bold?: boolean };

export function exportDREPdf(opts: {
  empresa: string;
  cnpj?: string | null;
  mes: number;
  ano: number;
  modo: "Gerencial" | "Fiscal";
  linhas: LinhaExport[];
}) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  doc.setFontSize(16);
  doc.text(`DRE ${opts.modo} — ${opts.empresa}`, 40, 50);
  doc.setFontSize(10);
  doc.setTextColor(100);
  const sub = [opts.cnpj && `CNPJ ${opts.cnpj}`, `${mesNome(opts.mes)}/${opts.ano}`]
    .filter(Boolean)
    .join(" · ");
  doc.text(sub, 40, 68);

  autoTable(doc, {
    startY: 90,
    head: [["Descrição", "Valor", "% Receita"]],
    body: opts.linhas.map((l) => [
      l.label,
      fmtBRL(l.valor),
      l.pct != null ? `${(l.pct * 100).toFixed(2)}%` : "",
    ]),
    styles: { font: "helvetica", fontSize: 9, cellPadding: 6 },
    headStyles: { fillColor: [153, 60, 29], textColor: 255 },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
    didParseCell: (data) => {
      const row = opts.linhas[data.row.index];
      if (row?.bold) data.cell.styles.fontStyle = "bold";
    },
  });

  doc.setFontSize(8);
  doc.setTextColor(150);
  doc.text(
    `Gerado em ${new Date().toLocaleString("pt-BR")} · Rota das Carnes`,
    40,
    doc.internal.pageSize.getHeight() - 20,
  );

  doc.save(`DRE_${opts.modo}_${opts.empresa}_${opts.mes}-${opts.ano}.pdf`);
}

export function exportDREExcel(opts: {
  empresa: string;
  mes: number;
  ano: number;
  modo: string;
  dre: LinhaExport[];
  despesas?: Array<{ categoria: string; subcategoria?: string | null; valor: number }>;
  estoque?: Array<{ produto: string; qtd_inicial: number; qtd_final: number; valor_final: number }>;
}) {
  const wb = XLSX.utils.book_new();
  const dreSheet = XLSX.utils.aoa_to_sheet([
    [`DRE ${opts.modo} — ${opts.empresa}`],
    [`${mesNome(opts.mes)}/${opts.ano}`],
    [],
    ["Descrição", "Valor (R$)", "% Receita"],
    ...opts.dre.map((l) => [l.label, l.valor, l.pct ?? ""]),
  ]);
  XLSX.utils.book_append_sheet(wb, dreSheet, "DRE");

  if (opts.despesas?.length) {
    const ds = XLSX.utils.aoa_to_sheet([
      ["Categoria", "Subcategoria", "Valor (R$)"],
      ...opts.despesas.map((d) => [d.categoria, d.subcategoria ?? "", d.valor]),
    ]);
    XLSX.utils.book_append_sheet(wb, ds, "Despesas");
  }
  if (opts.estoque?.length) {
    const es = XLSX.utils.aoa_to_sheet([
      ["Produto", "Qtd Inicial", "Qtd Final", "Valor Final (R$)"],
      ...opts.estoque.map((e) => [e.produto, e.qtd_inicial, e.qtd_final, e.valor_final]),
    ]);
    XLSX.utils.book_append_sheet(wb, es, "Estoque");
  }

  XLSX.writeFile(wb, `DRE_${opts.modo}_${opts.empresa}_${opts.mes}-${opts.ano}.xlsx`);
}
