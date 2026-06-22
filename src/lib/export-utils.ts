import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import domtoimage from "dom-to-image-more";

export interface DocumentData {
  id: string;
  code: string;
  title: string;
  projectName: string;
  disciplineName: string;
  origin: string;
  projetistaName?: string;
  status: string;
  receivedAt: string;
  analysisDeadline?: string;
  analysisReturnedAt?: string;
  sentToProjetistaAt?: string;
  projetistaDays?: string;
  projetistaDeadline?: string;
  responsibleName?: string;
  responsibleSector?: string;
}

export const exportDocumentsToExcel = (documents: DocumentData[]) => {
  const worksheet = XLSX.utils.json_to_sheet(documents.map(doc => ({
    "Código": doc.code,
    "Título": doc.title,
    "Projeto": doc.projectName,
    "Disciplina": doc.disciplineName,
    "Origem": doc.origin,
    "Projetista": doc.projetistaName || "—",
    "Status": doc.status,
    "Recebido em": doc.receivedAt,
    "Prazo de Análise": doc.analysisDeadline || "—",
    "Data Retorno Análise": doc.analysisReturnedAt || "—",
    "Data Envio à Projetista": doc.sentToProjetistaAt || "—",
    "Dias Prazo Projetista": doc.projetistaDays || "—",
    "Prazo Projetista": doc.projetistaDeadline || "—",
    "Responsável": doc.responsibleName || "—",
    "Setor": doc.responsibleSector || "—"
  })));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Documentos");
  XLSX.writeFile(workbook, "documentos.xlsx");
};

export const exportDocumentsToPDF = (documents: DocumentData[]) => {
  const doc = new jsPDF({
    orientation: "landscape"
  });

  doc.setFontSize(18);
  doc.text("Lista de Documentos", 14, 22);
  doc.setFontSize(11);

  const tableData = documents.map(doc => [
    doc.code,
    doc.title,
    doc.projectName,
    doc.disciplineName,
    doc.origin,
    doc.projetistaName || "—",
    doc.status,
    doc.receivedAt,
    doc.analysisDeadline || "—",
    doc.analysisReturnedAt || "—",
    doc.sentToProjetistaAt || "—",
    doc.projetistaDays || "—",
    doc.projetistaDeadline || "—",
    doc.responsibleName || "—",
    doc.responsibleSector || "—"
  ]);

  autoTable(doc, {
    head: [
      ["Código", "Título", "Projeto", "Disciplina", "Origem", "Projetista", "Status", "Recebido em", "Prazo de Análise", "Data Retorno Análise", "Data Envio à Projetista", "Dias Prazo Projetista", "Prazo Projetista", "Responsável", "Setor"]
    ],
    body: tableData,
    startY: 30,
    theme: "grid",
    styles: {
      fontSize: 7,
      cellPadding: 1.5
    },
    headStyles: {
      fillColor: [59, 130, 246],
      textColor: 255,
      fontSize: 8,
      fontStyle: "bold"
    }
  });

  doc.save("documentos.pdf");
};

export const exportDashboardToPDF = async (elementId: string, filename: string = "dashboard.pdf") => {
  const element = document.getElementById(elementId);
  if (!element) {
    console.error("Element not found for export");
    return;
  }

  try {
    const scale = 2;
    const width = element.scrollWidth;
    const height = element.scrollHeight;

    const dataUrl = await domtoimage.toPng(element, {
      width: width * scale,
      height: height * scale,
      style: {
        transform: `scale(${scale})`,
        transformOrigin: "top left",
        width: `${width}px`,
        height: `${height}px`,
      },
    });

    const pdf = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a4",
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 10;
    const imgWidth = pageWidth - 2 * margin;
    const imgHeight = (height * scale * imgWidth) / (width * scale);
    let heightLeft = imgHeight;
    let position = margin;

    pdf.addImage(dataUrl, "PNG", margin, position, imgWidth, imgHeight);
    heightLeft -= pageHeight - 2 * margin;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight + margin;
      pdf.addPage();
      pdf.addImage(dataUrl, "PNG", margin, position, imgWidth, imgHeight);
      heightLeft -= pageHeight - 2 * margin;
    }

    pdf.save(filename);
  } catch (error) {
    console.error("Erro ao exportar dashboard PDF:", error);
    throw error;
  }
};
