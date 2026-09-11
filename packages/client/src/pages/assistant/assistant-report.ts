export interface AssistantReportInput {
  question: string;
  answer: string;
  generatedAt?: Date;
  logoDataUrl?: string;
}

export interface AssistantPdfReport {
  bytes: Uint8Array;
  filename: string;
}

const BRAND_BLUE: [number, number, number] = [37, 99, 235];
const TEXT_COLOR: [number, number, number] = [30, 41, 59];
const MUTED_COLOR: [number, number, number] = [100, 116, 139];

function toPdfText(value: string): string {
  return value
    .replace(/\u20b9/g, "INR ")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/\u00a0/g, " ");
}

function stripInlineMarkdown(value: string): string {
  return toPdfText(value)
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/[*_~]/g, "")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function reportFilename(question: string, generatedAt: Date): string {
  const slug = question
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .split("-")
    .filter(Boolean)
    .slice(0, 5)
    .join("-") || "assistant-report";
  return `empcloud-${slug}-${generatedAt.toISOString().slice(0, 10)}.pdf`;
}

function tableCells(line: string): string[] {
  return line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => stripInlineMarkdown(cell));
}

function isTableSeparator(line: string): boolean {
  const cells = line.trim().replace(/^\||\|$/g, "").split("|");
  return cells.length > 1 && cells.every((cell) => /^\s*:?-{3,}:?\s*$/.test(cell));
}

export async function buildAssistantReportPdf(input: AssistantReportInput): Promise<AssistantPdfReport> {
  const { jsPDF } = await import("jspdf");
  const generatedAt = input.generatedAt ?? new Date();
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 18;
  const contentWidth = pageWidth - margin * 2;
  let y = 0;

  const drawHeader = (firstPage: boolean) => {
    pdf.setFillColor(255, 255, 255);
    pdf.rect(0, 0, pageWidth, 29, "F");
    if (input.logoDataUrl) {
      pdf.addImage(input.logoDataUrl, "PNG", margin, 8, 47, 11.2, undefined, "FAST");
    } else {
      pdf.setTextColor(...BRAND_BLUE);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(18);
      pdf.text("EMPCloud", margin, 16);
    }
    pdf.setTextColor(...TEXT_COLOR);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(firstPage ? 14 : 10);
    pdf.text(firstPage ? "HR Assistant Report" : "HR Assistant Report - continued", pageWidth - margin, 14, { align: "right" });
    pdf.setDrawColor(...BRAND_BLUE);
    pdf.setLineWidth(0.7);
    pdf.line(margin, 24, pageWidth - margin, 24);
    y = 34;
  };

  const addPage = () => {
    pdf.addPage();
    drawHeader(false);
  };

  const ensureSpace = (height: number) => {
    if (y + height > pageHeight - 18) addPage();
  };

  const drawWrappedText = (
    text: string,
    options: { x?: number; width?: number; size?: number; style?: "normal" | "bold"; gap?: number } = {},
  ) => {
    const x = options.x ?? margin;
    const width = options.width ?? contentWidth;
    const size = options.size ?? 10;
    const lineHeight = size * 0.43;
    pdf.setFont("helvetica", options.style ?? "normal");
    pdf.setFontSize(size);
    pdf.setTextColor(...TEXT_COLOR);
    const lines = pdf.splitTextToSize(stripInlineMarkdown(text), width) as string[];
    ensureSpace(Math.max(lineHeight * lines.length, lineHeight));
    pdf.text(lines, x, y);
    y += lineHeight * lines.length + (options.gap ?? 2.3);
  };

  const drawTable = (rows: string[][]) => {
    if (rows.length === 0) return;
    const columnCount = Math.max(...rows.map((row) => row.length));
    const columnWidth = contentWidth / columnCount;
    for (const [rowIndex, row] of rows.entries()) {
      pdf.setFont("helvetica", rowIndex === 0 ? "bold" : "normal");
      pdf.setFontSize(8.5);
      const wrapped = Array.from({ length: columnCount }, (_, index) => (
        pdf.splitTextToSize(row[index] || "", columnWidth - 4) as string[]
      ));
      const rowHeight = Math.max(8, ...wrapped.map((lines) => lines.length * 3.8 + 3));
      ensureSpace(rowHeight);
      for (let column = 0; column < columnCount; column++) {
        const x = margin + column * columnWidth;
        if (rowIndex === 0) {
          pdf.setFillColor(239, 246, 255);
          pdf.rect(x, y, columnWidth, rowHeight, "F");
        }
        pdf.setDrawColor(203, 213, 225);
        pdf.rect(x, y, columnWidth, rowHeight);
        pdf.setTextColor(...TEXT_COLOR);
        pdf.text(wrapped[column], x + 2, y + 4.8);
      }
      y += rowHeight;
    }
    y += 3;
  };

  drawHeader(true);
  pdf.setTextColor(...MUTED_COLOR);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.5);
  const generatedLabel = generatedAt.toLocaleString("en-GB", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  pdf.text(`Generated ${generatedLabel} UTC`, margin, y);
  y += 7;

  pdf.setFillColor(248, 250, 252);
  pdf.roundedRect(margin, y, contentWidth, 18, 2, 2, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.setTextColor(...BRAND_BLUE);
  pdf.text("REQUEST", margin + 4, y + 5);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.setTextColor(...TEXT_COLOR);
  const questionLines = pdf.splitTextToSize(stripInlineMarkdown(input.question), contentWidth - 8) as string[];
  pdf.text(questionLines.slice(0, 2), margin + 4, y + 11);
  y += 25;

  const lines = input.answer.replace(/\r\n/g, "\n").split("\n");
  for (let index = 0; index < lines.length;) {
    const raw = lines[index].trimEnd();
    const trimmed = raw.trim();
    if (!trimmed) {
      y += 2;
      index++;
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(trimmed);
    if (heading) {
      const level = heading[1].length;
      y += level === 1 ? 2 : 1;
      drawWrappedText(heading[2], { size: level === 1 ? 15 : level === 2 ? 12.5 : 11, style: "bold", gap: 3 });
      index++;
      continue;
    }
    if (trimmed.includes("|") && index + 1 < lines.length && isTableSeparator(lines[index + 1])) {
      const rows = [tableCells(trimmed)];
      index += 2;
      while (index < lines.length && lines[index].trim().includes("|")) {
        rows.push(tableCells(lines[index]));
        index++;
      }
      drawTable(rows);
      continue;
    }
    const bullet = /^[-*+]\s+(.+)$/.exec(trimmed);
    const numbered = /^(\d+)[.)]\s+(.+)$/.exec(trimmed);
    if (bullet || numbered) {
      const marker = numbered ? `${numbered[1]}.` : "-";
      const text = bullet?.[1] ?? numbered?.[2] ?? "";
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      const wrapped = pdf.splitTextToSize(stripInlineMarkdown(text), contentWidth - 7) as string[];
      const height = wrapped.length * 4.3 + 1.5;
      ensureSpace(height);
      pdf.setTextColor(...BRAND_BLUE);
      pdf.text(marker, margin + 1, y);
      pdf.setTextColor(...TEXT_COLOR);
      pdf.text(wrapped, margin + 7, y);
      y += height;
      index++;
      continue;
    }

    const paragraph = [trimmed];
    index++;
    while (index < lines.length) {
      const next = lines[index].trim();
      if (!next || /^(#{1,3})\s+/.test(next) || /^[-*+]\s+/.test(next) || /^(\d+)[.)]\s+/.test(next)) break;
      if (next.includes("|") && index + 1 < lines.length && isTableSeparator(lines[index + 1])) break;
      paragraph.push(next);
      index++;
    }
    drawWrappedText(paragraph.join(" "));
  }

  const pageCount = pdf.getNumberOfPages();
  for (let page = 1; page <= pageCount; page++) {
    pdf.setPage(page);
    pdf.setDrawColor(226, 232, 240);
    pdf.setLineWidth(0.2);
    pdf.line(margin, pageHeight - 13, pageWidth - margin, pageHeight - 13);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(...MUTED_COLOR);
    pdf.text("EmpCloud HR Assistant | Confidential", margin, pageHeight - 8);
    pdf.text(`Page ${page} of ${pageCount}`, pageWidth - margin, pageHeight - 8, { align: "right" });
  }

  return {
    bytes: new Uint8Array(pdf.output("arraybuffer")),
    filename: reportFilename(input.question, generatedAt),
  };
}

async function loadLogoDataUrl(): Promise<string | undefined> {
  try {
    const response = await fetch("/empcloud-logo.png");
    if (!response.ok) return undefined;
    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    return undefined;
  }
}

export async function downloadAssistantReport(input: Omit<AssistantReportInput, "logoDataUrl">): Promise<void> {
  const report = await buildAssistantReportPdf({ ...input, logoDataUrl: await loadLogoDataUrl() });
  const blob = new Blob([report.bytes.buffer as ArrayBuffer], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = report.filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
