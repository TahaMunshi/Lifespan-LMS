const LOGICAL_WIDTH = 1666;
const LOGICAL_HEIGHT = 1162;
const FRAME_COLOR = '#7699bd';
const INK = '#202d25';
const SLATE = '#345469';

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  let line = '';
  const lines = [];
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  let currentY = y;
  for (const item of lines) {
    ctx.fillText(item, x, currentY, maxWidth);
    currentY += lineHeight;
  }
  return currentY;
}

function wrapCentered(ctx, text, y, maxWidth, lineHeight) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  let line = '';
  const lines = [];
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  let currentY = y;
  for (const item of lines) {
    ctx.fillText(item, LOGICAL_WIDTH / 2, currentY, maxWidth);
    currentY += lineHeight;
  }
  return currentY;
}

function fitBrand(brand, maxWidth, maxHeight) {
  const aspect = brand.naturalHeight / Math.max(1, brand.naturalWidth);
  let width = maxWidth;
  let height = width * aspect;
  if (height > maxHeight) {
    height = maxHeight;
    width = height / aspect;
  }
  return { width, height };
}

function formatLongDate(value) {
  if (!value) return '';
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  if (!Number.isFinite(date.getTime())) return String(value);
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function formatDateRange(dates) {
  const clean = (dates || []).filter(Boolean).map((item) => formatLongDate(item));
  if (!clean.length) return 'Date not recorded';
  if (clean.length === 1 || clean[0] === clean[1]) return clean[0];
  return `${clean[0]} – ${clean[1]}`;
}

function drawFrame(ctx) {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
  const inset = 28;
  ctx.strokeStyle = FRAME_COLOR;
  ctx.lineWidth = 10;
  ctx.strokeRect(inset, inset, LOGICAL_WIDTH - inset * 2, LOGICAL_HEIGHT - inset * 2);
}

function drawCamftSeal(ctx, x, y, radius) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = FRAME_COLOR;
  ctx.stroke();
  ctx.fillStyle = SLATE;
  ctx.font = '700 22px Inter';
  ctx.textAlign = 'center';
  ctx.fillText('CAMFT', 0, -6);
  ctx.font = '600 11px Inter';
  const ring = 'APPROVED CONTINUING EDUCATION PROVIDER';
  ctx.font = '600 10px Inter';
  wrapCentered(ctx, ring, radius * 0.35, radius * 1.4, 14);
  ctx.restore();
}

function drawFooter(ctx) {
  ctx.textAlign = 'center';
  ctx.fillStyle = INK;
  ctx.font = '17px Inter';
  ctx.fillText(
    'Lifespan Learning Institute • 10825 Ashby Avenue • Los Angeles, CA 90066 • 310.474.2505 • lifespanlearn.org',
    LOGICAL_WIDTH / 2,
    LOGICAL_HEIGHT - 52,
    1500
  );
}

function drawAccreditation(ctx, hours, y) {
  ctx.textAlign = 'left';
  ctx.fillStyle = INK;
  ctx.font = '17px Georgia';
  wrapText(
    ctx,
    'Lifespan Learning Institute is approved by the California Association of Marriage and Family Therapists to sponsor continuing education for LMFTs, LCSWs, LPCCs, & LEPs. Lifespan Learning Institute maintains responsibility for this program/course and its content. (Provider # 050085)',
    120,
    y,
    820,
    24
  );
  const nextY = y + 92;
  ctx.font = 'italic 17px Georgia';
  wrapText(
    ctx,
    `This course meets the qualifications for ${hours} hours of continuing education credit for LMFTs, LCSWs, LPCCs, and/or LEPs as required by the California Board of Behavioral Sciences.`,
    120,
    nextY,
    820,
    24
  );
}

function drawSignature(ctx) {
  ctx.textAlign = 'center';
  ctx.fillStyle = INK;
  ctx.font = '16px Inter';
  ctx.fillText('Authorized by', 1280, 930);
  ctx.font = 'italic 28px Georgia';
  ctx.fillText('Bonnie Goldstein', 1280, 968);
}

export async function renderCertificate(canvas, certificate, template) {
  if (!canvas || !certificate?.snapshot || !template) return false;
  const brand = new Image();
  brand.src = 'assets/logo.png?v=3';
  await brand.decode();
  if (document.fonts?.ready) await document.fonts.ready;

  const scale = Math.max(2, Math.min(3, window.devicePixelRatio || 1));
  canvas.width = Math.round(LOGICAL_WIDTH * scale);
  canvas.height = Math.round(LOGICAL_HEIGHT * scale);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  drawFrame(ctx);
  ctx.textAlign = 'center';

  const { width: brandWidth, height: brandHeight } = fitBrand(brand, 720, 120);
  ctx.drawImage(brand, (LOGICAL_WIDTH - brandWidth) / 2, 72, brandWidth, brandHeight);

  const snapshot = certificate.snapshot;
  const hours = snapshot.creditHours ?? 0;
  const learnerName = [
    certificate.learner?.firstName,
    certificate.learner?.lastName,
    certificate.learner?.credential
  ].filter(Boolean).join(', ').replace(/, ([^,]+)$/, ', $1') || 'Learner Name';
  const license = certificate.learner?.license || 'License #';
  const presenterText = (snapshot.presenters || []).join(' & ') || 'Presenter name(s)';
  const cosponsor = snapshot.cosponsor || 'Sensorimotor Psychotherapy Institute';
  const completionDate = formatLongDate(certificate.issuedAt?.slice(0, 10) || new Date().toISOString());
  const activityDates = formatDateRange(snapshot.activityDates);
  const isLive = template.activityTypes?.includes('live');

  ctx.fillStyle = INK;
  ctx.font = '22px Georgia';
  let y = 230;
  ctx.fillText('This certifies that', LOGICAL_WIDTH / 2, y);
  y += 48;
  ctx.font = '700 34px Georgia';
  ctx.fillText(learnerName, LOGICAL_WIDTH / 2, y, 1300);
  y += 44;
  ctx.font = '24px Georgia';
  ctx.fillText(license, LOGICAL_WIDTH / 2, y);
  y += 52;

  ctx.font = '22px Georgia';
  const activityLabel = isLive ? 'Live' : 'Home Study';
  const intro = `has successfully completed ${hours} hours of continuing education credit in a ${activityLabel} activity cosponsored by ${cosponsor} and Lifespan Learning Institute`;
  y = wrapCentered(ctx, intro, y, 1180, 30) + 8;

  ctx.font = '700 28px Georgia';
  y = wrapCentered(ctx, snapshot.courseName || 'Course Title', y + 16, 1180, 34) + 6;
  ctx.font = '24px Georgia';
  y = wrapCentered(ctx, presenterText, y + 8, 1180, 30) + 10;

  if (isLive) {
    y = wrapCentered(ctx, activityDates, y + 6, 1180, 28) + 6;
    const location = snapshot.location ? `Location: ${snapshot.location}` : 'Location: (Place or Online)';
    wrapCentered(ctx, location, y + 6, 1180, 28);
  } else {
    y = wrapCentered(ctx, `recorded on ${activityDates}`, y + 6, 1180, 28) + 6;
    wrapCentered(ctx, `Home Study completed: ${completionDate}`, y + 6, 1180, 28);
  }

  drawAccreditation(ctx, hours, 720);
  drawCamftSeal(ctx, 1280, 790, 78);
  drawSignature(ctx);
  drawFooter(ctx);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#6b7280';
  ctx.font = '13px Inter';
  ctx.fillText(certificate.number, LOGICAL_WIDTH - 48, LOGICAL_HEIGHT - 78);

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
