import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'
import type { AuditEntry, AuditFilters } from '@/hooks/useAuditTrail'
import type { Document } from '@/hooks/useDocuments'

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('pt-BR')
}

function downloadCSV(filename: string, rows: (string | number | null | undefined)[][]) {
  const csv = rows
    .map((row) => row.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export function exportAuditTrailToCSV(entries: AuditEntry[]) {
  downloadCSV(`tramita-auditoria-${new Date().toISOString().split('T')[0]}.csv`, [
    ['Data/Hora', 'Usuário', 'Documento', 'Ação', 'Status Anterior', 'Status Novo', 'Hash'],
    ...entries.map((entry) => [
      formatDateTime(entry.created_at),
      entry.user?.full_name ?? entry.user_id,
      [entry.document?.code, entry.document?.title].filter(Boolean).join(' — '),
      entry.action,
      entry.old_status ?? '',
      entry.new_status ?? '',
      entry.file_hash ?? '',
    ]),
  ])
}

export function exportAuditTrailToPDF(entries: AuditEntry[], orgName: string, filters: AuditFilters) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('TRAMITA — Trilha de Auditoria', 14, 18)

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text(`Organização: ${orgName}`, 14, 26)
  doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 32)

  if (filters.date_from || filters.date_to) {
    doc.text(`Período: ${filters.date_from ?? '—'} até ${filters.date_to ?? '—'}`, 14, 38)
  }

  doc.text(`Total de registros: ${entries.length}`, 14, 44)

  autoTable(doc, {
    startY: 50,
    head: [['Data/Hora', 'Usuário', 'Documento', 'Ação', 'Status Anterior', 'Status Novo', 'Hash (8 chars)']],
    body: entries.map((entry) => [
      formatDateTime(entry.created_at),
      entry.user?.full_name ?? entry.user_id,
      [entry.document?.code, entry.document?.title].filter(Boolean).join(' — ').slice(0, 50),
      entry.action,
      entry.old_status ?? '—',
      entry.new_status ?? '—',
      entry.file_hash ? `${entry.file_hash.slice(0, 8)}...` : '—',
    ]),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [0, 196, 167], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 245, 245] },
  })

  doc.save(`tramita-auditoria-${new Date().toISOString().split('T')[0]}.pdf`)
}

export function exportDocumentsToCSV(documents: Document[]) {
  downloadCSV(`tramita-documentos-${new Date().toISOString().split('T')[0]}.csv`, [
    ['Código', 'Título', 'Tipo', 'Área', 'Status', 'Revisão', 'Elaborador', 'Próxima Revisão', 'Criado em'],
    ...documents.map((document) => [
      document.code ?? 'Gerando...',
      document.title,
      document.doc_type,
      document.area,
      document.status,
      document.revision,
      document.author?.full_name ?? '',
      document.next_review_at ? new Date(document.next_review_at).toLocaleDateString('pt-BR') : '',
      new Date(document.created_at).toLocaleDateString('pt-BR'),
    ]),
  ])
}

export function exportDocumentsToExcel(documents: Document[], orgName: string) {
  const rows = documents.map((document) => ({
    Organização: orgName,
    Código: document.code ?? 'Gerando...',
    Título: document.title,
    Tipo: document.doc_type,
    Área: document.area,
    Status: document.status,
    Revisão: document.revision,
    Elaborador: document.author?.full_name ?? '',
    'Próxima Revisão': document.next_review_at ? new Date(document.next_review_at).toLocaleDateString('pt-BR') : '',
    'Criado em': new Date(document.created_at).toLocaleDateString('pt-BR'),
  }))

  const worksheet = XLSX.utils.json_to_sheet(rows)
  worksheet['!cols'] = [
    { wch: 24 }, { wch: 18 }, { wch: 55 }, { wch: 8 }, { wch: 8 },
    { wch: 18 }, { wch: 8 }, { wch: 25 }, { wch: 16 }, { wch: 12 },
  ]

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Documentos')
  XLSX.writeFile(workbook, `tramita-documentos-${new Date().toISOString().split('T')[0]}.xlsx`)
}
