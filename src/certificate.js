const LOGICAL_WIDTH = 1666;
const LOGICAL_HEIGHT = 1162;

function wrapText(ctx, text, y, options = {}) {
  const {
    size = 26,
    width = 1200,
    lineHeight = 34,
    color = '#202d25',
    font = 'Georgia'
  } = options;
  ctx.font = `${size}px ${font}`;
  ctx.fillStyle = color;
  let current = '';
  for (const word of String(text || '').split(' ')) {
    const next = `${current}${word} `;
    if (ctx.measureText(next).width > width && current) {
      ctx.fillText(current.trim(), LOGICAL_WIDTH / 2, y);
      y += lineHeight;
      current = `${word} `;
    } else {
      current = next;
    }
  }
  if (current) ctx.fillText(current.trim(), LOGICAL_WIDTH / 2, y);
  return y;
}

export async function renderCertificate(canvas, certificate, template) {
  if (!canvas || !certificate?.snapshot || !template) return false;
  const artwork = new Image();
  const brand = new Image();
  artwork.src = template.asset;
  brand.src = 'assets/logo.png?v=3';
  await Promise.all([artwork.decode(), brand.decode()]);
  if (document.fonts?.ready) await document.fonts.ready;

  const scale = Math.max(2, Math.min(3, window.devicePixelRatio || 1));
  canvas.width = Math.round(LOGICAL_WIDTH * scale);
  canvas.height = Math.round(LOGICAL_HEIGHT * scale);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(artwork, 0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
  ctx.textAlign = 'center';

  const sample = ctx.getImageData(Math.round(200 * scale), Math.round(200 * scale), 1, 1).data;
  const background = `rgb(${sample[0]},${sample[1]},${sample[2]})`;
  const blank = (x, y, width, height) => {
    ctx.fillStyle = background;
    ctx.fillRect(x, y, width, height);
  };
  const write = (text, y, size = 28, color = '#202d25', font = 'Georgia', width = 1245) => {
    ctx.fillStyle = color;
    ctx.font = `${size}px ${font}`;
    ctx.fillText(String(text || ''), LOGICAL_WIDTH / 2, y, width);
  };

  // Wide banner logo: fit by width, clear the header plate, leave space before body text.
  const isLive = template.activityTypes.includes('live');
  const logoMaxWidth = 820;
  const logoBandTop = 42;
  const aspect = brand.naturalHeight / Math.max(1, brand.naturalWidth);
  const targetHeight = Math.round(logoMaxWidth * aspect);
  const logoBandBottom = logoBandTop + targetHeight + 24;
  blank(190, logoBandTop, 1286, logoBandBottom - logoBandTop);
  const brandWidth = logoMaxWidth;
  const brandHeight = targetHeight;
  const brandX = (LOGICAL_WIDTH - brandWidth) / 2;
  const brandY = logoBandTop + 12;
  ctx.drawImage(brand, brandX, brandY, brandWidth, brandHeight);
  const contentStart = logoBandBottom + 32;

  const snapshot = certificate.snapshot;
  const learnerName = [
    certificate.learner?.title,
    certificate.learner?.firstName,
    certificate.learner?.lastName,
    certificate.learner?.credential
  ].filter(Boolean).join(' ') || 'Sample Learner';
  const completionDate = new Date(certificate.issuedAt).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });
  const presenterText = snapshot.presenters.join(' & ');

  if (isLive) {
    blank(205, contentStart - 10, 1255, 130);
    write('This certifies that', contentStart + 22, 26, '#4a5560', 'Inter');
    write(learnerName, contentStart + 82, 46);
    const titleBandTop = contentStart + 140;
    blank(205, titleBandTop, 1255, 130);
    const titleY = wrapText(ctx, snapshot.courseName, titleBandTop + 42, {
      size: 30,
      width: 1245,
      lineHeight: 36,
      color: '#63a63b'
    });
    wrapText(ctx, `${snapshot.moduleName} · ${presenterText}`, titleY + 34, {
      size: 22,
      width: 1245,
      lineHeight: 28,
      color: '#63a63b'
    });
    blank(210, 740, 1248, 84);
    wrapText(
      ctx,
      `This activity meets the qualifications for ${snapshot.creditHours} hours of continuing education credit. Location: ${snapshot.location}.`,
      772,
      { size: 23, width: 1235, lineHeight: 31, color: '#171d18' }
    );
    blank(295, 930, 290, 55);
    ctx.font = '29px Georgia';
    ctx.fillStyle = '#171d18';
    ctx.fillText(completionDate, 415, 969, 290);
  } else {
    blank(205, contentStart - 8, 1255, 78);
    write('This certifies that', contentStart + 32, 26, '#4a5560', 'Inter');
    const nameTop = contentStart + 86;
    blank(205, nameTop, 1255, 100);
    write(learnerName, nameTop + 62, 44);
    const titleTop = nameTop + 120;
    blank(205, titleTop, 1255, 168);
    const titleY = wrapText(ctx, snapshot.courseName, titleTop + 48, {
      size: 30,
      width: 1180,
      lineHeight: 36,
      color: '#233f57'
    });
    wrapText(ctx, `${snapshot.moduleName} · ${snapshot.creditHours} CE Hours`, titleY + 42, {
      size: 23,
      width: 1180,
      lineHeight: 30,
      color: '#233f57'
    });
    blank(750, 1022, 270, 42);
    ctx.font = '20px Inter';
    ctx.fillStyle = '#202d25';
    ctx.fillText(completionDate, 836, 1047, 265);
    blank(1180, 1022, 290, 42);
    ctx.font = '17px Inter';
    ctx.fillText(certificate.number, 1273, 1047, 285);
    blank(290, 1022, 350, 42);
    ctx.font = '18px Inter';
    ctx.fillText(presenterText, 405, 1047, 330);
  }

  write(`PROTOTYPE · ${certificate.number}`, 1147, 14, '#795938', 'Inter');
  return true;
}

export function downloadCertificatePdf(canvas, filename) {
  const imageBytes = Uint8Array.from(
    atob(canvas.toDataURL('image/jpeg', 0.96).split(',')[1]),
    (character) => character.charCodeAt(0)
  );
  const encoder = new TextEncoder();
  const chunks = [];
  const offsets = [0];
  let size = 0;
  const add = (input) => {
    const bytes = typeof input === 'string' ? encoder.encode(input) : input;
    chunks.push(bytes);
    size += bytes.length;
  };
  const object = (number, value) => {
    offsets[number] = size;
    add(`${number} 0 obj\n${value}\nendobj\n`);
  };

  add('%PDF-1.4\n');
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  object(3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 587] /Resources << /XObject << /Image0 4 0 R >> >> /Contents 5 0 R >>');
  offsets[4] = size;
  add(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageBytes.length} >>\nstream\n`);
  add(imageBytes);
  add('\nendstream\nendobj\n');
  const stream = 'q\n842 0 0 587 0 0 cm\n/Image0 Do\nQ\n';
  object(5, `<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}endstream`);
  const xref = size;
  add('xref\n0 6\n0000000000 65535 f \n');
  for (let index = 1; index < 6; index += 1) {
    add(`${String(offsets[index]).padStart(10, '0')} 00000 n \n`);
  }
  add(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);

  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob(chunks, { type: 'application/pdf' }));
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 500);
}
