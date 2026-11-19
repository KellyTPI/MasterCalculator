(() => {
  'use strict';

  if (!window.PDFLib) return;

  const { PDFDocument, PDFName, PDFDict, PDFArray, PDFString, PDFHexString, PDFRawStream,
    StandardFonts, decodePDFRawStream, rgb } = window.PDFLib;
  const attachmentName = 'tpi-estimate.json';
  const format = 'tpi-costco-estimate';
  const maxAttachmentBytes = 1024 * 1024;
  const maxPdfBytes = 25 * 1024 * 1024;
  const pageWidth = 612;
  const pageHeight = 792;
  const margin = 40;
  const contentWidth = pageWidth - margin * 2;
  const contentBottom = pageHeight - 49;
  const navy = '#003865';
  const ink = '#172435';
  const slate = '#495a6c';

  function wrapLines(context, text, width) {
    const lines = [];
    for (const paragraph of text.split(/\r?\n/)) {
      let line = '';
      for (const word of paragraph.split(/\s+/)) {
        const candidate = line ? line + ' ' + word : word;
        if (context.measureText(candidate).width <= width) {
          line = candidate;
          continue;
        }
        if (line) lines.push(line);
        line = '';
        for (const character of word) {
          if (line && context.measureText(line + character).width > width) {
            lines.push(line);
            line = '';
          }
          line += character;
        }
      }
      lines.push(line);
    }
    return lines;
  }

  async function loadLogo(svg) {
    if (!svg) return null;
    const image = new Image();
    const markup = new XMLSerializer().serializeToString(svg);
    image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(markup);
    try {
      await image.decode();
      return image;
    } catch {
      return null;
    }
  }

  function renderQuotePages(quote, logo) {
    const pages = [];
    const scale = 3;
    let canvas;
    let context;
    let y;

    function setFont(weight, size) {
      context.font = `${weight} ${size}px system-ui, sans-serif`;
    }

    function addPage() {
      if (canvas) pages.push(canvas.toDataURL('image/png'));
      canvas = document.createElement('canvas');
      canvas.width = pageWidth * scale;
      canvas.height = pageHeight * scale;
      context = canvas.getContext('2d');
      context.scale(scale, scale);
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, pageWidth, pageHeight);
      context.fillStyle = navy;
      context.fillRect(0, 0, pageWidth, 88);

      let headerX = margin;
      if (logo) {
        context.fillStyle = '#ffffff';
        context.beginPath();
        context.arc(margin + 19, 44, 19, 0, 2 * Math.PI);
        context.fill();
        context.drawImage(logo, margin + 3, 28, 32, 32);
        headerX += 49;
      }
      context.fillStyle = '#ffffff';
      setFont(750, 19);
      context.fillText('Costco Member Estimate', headerX, 42);
      context.fillStyle = '#c8e0f5';
      setFont(500, 11);
      context.fillText('Top Priority, Inc.', headerX, 61);
      context.textAlign = 'right';
      setFont(700, 9);
      context.fillText('EDITABLE WORK COPY', pageWidth - margin, 42);
      context.textAlign = 'left';
      y = 120;
    }

    function ensureRoom(height) {
      if (y + height > contentBottom) addPage();
    }

    function drawParagraph(text, weight, size, lineHeight, color) {
      setFont(weight, size);
      for (const line of wrapLines(context, text, contentWidth)) {
        ensureRoom(lineHeight);
        setFont(weight, size);
        context.fillStyle = color;
        context.fillText(line, margin, y);
        y += lineHeight;
      }
    }

    function measureRow([label, value, emphasized]) {
      const labelWeight = emphasized ? 750 : 500;
      const valueSize = emphasized ? 15 : 11;
      const rowLineHeight = emphasized ? 23 : 16;
      setFont(700, valueSize);
      const valueWidth = Math.max(100, Math.min(240, Math.ceil(context.measureText(value).width)));
      const values = wrapLines(context, value, valueWidth);
      setFont(labelWeight, 11);
      const labels = wrapLines(context, label, contentWidth - valueWidth - 16);
      const lineCount = Math.max(labels.length, values.length);
      return { labels, values, lineCount, rowLineHeight, labelWeight, valueSize, emphasized };
    }

    function drawRow({ labels, values, lineCount, rowLineHeight, labelWeight, valueSize, emphasized }) {
      const rowHeight = lineCount * rowLineHeight + 5;
      if (rowHeight < contentBottom - 120) ensureRoom(rowHeight);
      for (let index = 0; index < lineCount; index++) {
        ensureRoom(rowLineHeight + 5);
        if (emphasized) {
          context.fillStyle = '#edf4fb';
          context.fillRect(margin - 6, y - 15, contentWidth + 12, rowLineHeight + 2);
        }
        context.fillStyle = emphasized ? navy : slate;
        setFont(labelWeight, 11);
        context.fillText(labels[index] || '', margin, y);
        context.fillStyle = emphasized ? navy : ink;
        setFont(700, valueSize);
        context.textAlign = 'right';
        context.fillText(values[index] || '', pageWidth - margin, y);
        context.textAlign = 'left';
        y += rowLineHeight;
      }
      y += 5;
    }

    addPage();
    drawParagraph(quote.projectName, 800, 23, 29, ink);
    if (quote.jobOrderNumber) {
      drawParagraph('Job # ' + quote.jobOrderNumber, 600, 11, 18, slate);
    }
    for (const section of quote.sections) {
      const rows = section.rows.map(measureRow);
      const sectionHeight = 30 + rows.reduce((height, row) => height + row.lineCount * row.rowLineHeight + 5, 0);
      ensureRoom(rows.length <= 4 && sectionHeight < contentBottom - 120 ? sectionHeight : 52);
      y += 9;
      drawParagraph(section.heading, 800, 11, 21, navy);
      for (const row of rows) drawRow(row);
    }
    pages.push(canvas.toDataURL('image/png'));
    return pages;
  }

  async function create(job, quote) {
    const data = new TextEncoder().encode(JSON.stringify({ format, version: 2, job }));
    if (data.length > maxAttachmentBytes) {
      throw new Error('This estimate is too large for an editable PDF.');
    }
    const images = renderQuotePages(quote, await loadLogo(quote.logo));
    const pdf = await PDFDocument.create();
    const footerFont = await pdf.embedFont(StandardFonts.Helvetica);
    const footerColor = rgb(0.28, 0.35, 0.42);
    pdf.setTitle(quote.projectName + ' - Editable Estimate');
    for (let index = 0; index < images.length; index++) {
      const page = pdf.addPage([pageWidth, pageHeight]);
      const image = await pdf.embedPng(images[index]);
      page.drawImage(image, { x: 0, y: 0, width: pageWidth, height: pageHeight });
      const footer = 'Page ' + (index + 1) + ' of ' + images.length;
      page.drawText('Editable work copy - contains estimate data', {
        x: margin, y: 25, size: 9, font: footerFont, color: footerColor,
      });
      page.drawText(footer, {
        x: pageWidth - margin - footerFont.widthOfTextAtSize(footer, 9),
        y: 25, size: 9, font: footerFont, color: footerColor,
      });
    }
    await pdf.attach(data, attachmentName, {
      mimeType: 'application/json',
      description: 'Calculator inputs for reopening this editable estimate',
    });
    const bytes = await pdf.save();
    if (bytes.length > maxPdfBytes) throw new Error('This estimate is too large for an editable PDF.');
    return bytes;
  }

  function readAttachment(pdf) {
    const key = PDFName.of;
    const names = pdf.catalog.lookupMaybe(key('Names'), PDFDict);
    const embeddedFiles = names?.lookupMaybe(key('EmbeddedFiles'), PDFDict);
    const files = embeddedFiles?.lookupMaybe(key('Names'), PDFArray);
    // pdf-lib writes attached files as name/Filespec pairs in this leaf array.
    for (let index = 0; files && index + 1 < files.size(); index += 2) {
      const name = files.lookupMaybe(index, PDFString, PDFHexString);
      if (name?.decodeText() !== attachmentName) continue;
      const file = files.lookup(index + 1, PDFDict);
      const stream = file.lookup(key('EF'), PDFDict).lookup(key('F'), PDFRawStream);
      const bytes = decodePDFRawStream(stream).getBytes(maxAttachmentBytes + 1);
      if (bytes.length > maxAttachmentBytes) throw new Error('Estimate data is too large.');
      return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    }
    return null;
  }

  async function read(file) {
    if (file.size > maxPdfBytes) throw new Error('Choose an editable PDF under 25 MB.');
    let payload;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const pdf = await PDFDocument.load(bytes, {
        updateMetadata: false,
        throwOnInvalidObject: true,
      });
      payload = readAttachment(pdf);
    } catch {
      throw new Error('Could not read the estimate PDF. Try the original editable work copy.');
    }
    if (payload?.format !== format) throw new Error('Choose a PDF made with Save Editable PDF.');
    if (![1, 2].includes(payload.version)) throw new Error('This PDF uses an unsupported estimate version.');
    return payload.job;
  }

  window.TpiEstimatePdf = { create, read };
})();
