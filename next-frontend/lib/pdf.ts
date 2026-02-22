import jsPDF from 'jspdf';

function sanitizeFilename(title: string): string {
  return title
    .replace(/[^a-zA-Z0-9\s-]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
}

export function generateArticlePdf(title: string, contentMarkdown: string): void {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  const maxWidth = pageWidth - margin * 2;
  let y = margin;

  // Title
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  const titleLines = doc.splitTextToSize(title, maxWidth);
  doc.text(titleLines, margin, y);
  y += titleLines.length * 8 + 10;

  // Content
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');

  // Strip markdown formatting for PDF
  const plainText = contentMarkdown
    .replace(/#{1,6}\s+/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\n{3,}/g, '\n\n');

  const lines = doc.splitTextToSize(plainText, maxWidth);
  const lineHeight = 5;
  const pageHeight = doc.internal.pageSize.getHeight();

  for (const line of lines) {
    if (y + lineHeight > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
    doc.text(line, margin, y);
    y += lineHeight;
  }

  const filename = `${sanitizeFilename(title)}.pdf`;
  doc.save(filename);
}
