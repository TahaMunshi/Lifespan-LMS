const FRAME_COLOR = '#7699bd';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[character]));
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
  return `${clean[0]} ??? ${clean[1]}`;
}

function formatHours(hours) {
  const value = Number(hours);
  if (!Number.isFinite(value)) return '0';
  return Number.isInteger(value) ? String(value) : String(value);
}

function formatLearnerName(learner) {
  const name = [learner?.firstName, learner?.lastName].filter(Boolean).join(' ').trim();
  const credential = String(learner?.credential || '').trim();
  if (!name) return 'Learner name';
  return credential ? `${name}, ${credential}` : name;
}

export function buildCertificateMarkup(certificate, template) {
  if (!certificate?.snapshot || !template) return '';
  const snapshot = certificate.snapshot;
  const hours = formatHours(snapshot.creditHours ?? 0);
  const learnerName = formatLearnerName(certificate.learner);
  const license = escapeHtml(certificate.learner?.license || 'License #');
  const presenterText = escapeHtml((snapshot.presenters || []).join(' & ') || 'Presenter name(s)');
  const cosponsor = escapeHtml(snapshot.cosponsor || 'Sensorimotor Psychotherapy Institute');
  const completionDate = formatLongDate(certificate.issuedAt?.slice(0, 10) || new Date().toISOString());
  const activityDates = escapeHtml(formatDateRange(snapshot.activityDates));
  const courseName = escapeHtml(snapshot.courseName || 'Course Title');
  const isLive = template.activityTypes?.includes('live');
  const activityLabel = isLive ? 'Live' : 'Home Study';
  const locationLine = snapshot.location
    ? `Location: ${escapeHtml(snapshot.location)}`
    : 'Location: (Place or Online)';

  const scheduleBlock = isLive
    ? `<p class="cert-meta">${activityDates}</p><p class="cert-meta">${locationLine}</p>`
    : `<p class="cert-meta">recorded on ${activityDates}</p><p class="cert-meta">Home Study completed: ${escapeHtml(completionDate)}</p>`;

  return `
    <article class="certificate-document" aria-label="Certificate of completion">
      <div class="cert-sheet">
        <header class="cert-header">
          <img class="cert-logo" src="assets/logo.png?v=4" alt="Lifespan Learning Institute">
        </header>
        <p class="cert-lead">This certifies that</p>
        <p class="cert-name">${escapeHtml(learnerName)}</p>
        <p class="cert-license">${license}</p>
        <p class="cert-intro">has successfully completed <strong>${escapeHtml(hours)} hours</strong> of continuing education credit in a ${activityLabel} activity cosponsored by ${cosponsor} and Lifespan Learning Institute</p>
        <p class="cert-course">${courseName}</p>
        <p class="cert-presenters">${presenterText}</p>
        ${scheduleBlock}
        <div class="cert-body-spacer" aria-hidden="true"></div>
        <div class="cert-lower">
          <div class="cert-accreditation">
            <p>Lifespan Learning Institute is approved by the California Association of Marriage and Family Therapists to sponsor continuing education for LMFTs, LCSWs, LPCCs, &amp; LEPs. Lifespan Learning Institute maintains responsibility for this program/course and its content. (Provider # 050085)</p>
            <p class="cert-accreditation-em"><em>This course meets the qualifications for ${escapeHtml(hours)} hours of continuing education credit for LMFTs, LCSWs, LPCCs, and/or LEPs as required by the California Board of Behavioral Sciences.</em></p>
          </div>
          <div class="cert-official">
            <img class="cert-seal" src="assets/certificate-camft-seal.png" alt="CAMFT approved continuing education provider">
            <div class="cert-sign-block">
              <span class="cert-sign-label">Authorized by</span>
              <img class="cert-sign" src="assets/certificate-signature.png" alt="Signature of Bonnie Goldstein">
            </div>
          </div>
        </div>
        <footer class="cert-footer">Lifespan Learning Institute ??? 10825 Ashby Avenue ??? Los Angeles, CA 90066 ??? 310.474.2505 ??? lifespanlearn.org</footer>
        <span class="cert-number">${escapeHtml(certificate.number)}</span>
      </div>
    </article>`;
}


async function captureCertificateForDownload(mount) {
  const { default: html2canvas } = await import('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/+esm');
  const sheet = mount.querySelector('.cert-sheet') || mount;
  await Promise.all([...sheet.querySelectorAll('img')].map((img) => (
    img.complete && img.naturalWidth ? Promise.resolve() : new Promise((resolve) => {
      img.onload = resolve;
      img.onerror = resolve;
    })
  )));
  if (document.fonts?.ready) await document.fonts.ready;

  // Off-screen only — does not change the approved on-screen preview.
  const captureWidth = 1100;
  const captureHeight = Math.round(captureWidth * (8.5 / 11));
  const clone = sheet.cloneNode(true);
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'position:fixed;left:-14000px;top:0;margin:0;padding:0;background:#fff;pointer-events:none;z-index:-1;';
  clone.style.cssText = [
    'width:' + captureWidth + 'px',
    'height:' + captureHeight + 'px',
    'max-width:none',
    'aspect-ratio:11 / 8.5',
    'box-sizing:border-box',
    'overflow:hidden',
    'margin:0'
  ].join(';');
  host.appendChild(clone);
  document.body.appendChild(host);
  await Promise.all([...clone.querySelectorAll('img')].map((img) => (
    img.complete && img.naturalWidth ? Promise.resolve() : new Promise((resolve) => {
      img.onload = resolve;
      img.onerror = resolve;
    })
  )));

  try {
    return await html2canvas(clone, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      allowTaint: true,
      logging: false,
      width: captureWidth,
      height: captureHeight,
      windowWidth: captureWidth,
      windowHeight: captureHeight,
      scrollX: 0,
      scrollY: 0
    });
  } finally {
    host.remove();
  }
}

export async function renderCertificate(target, certificate, template) {
  if (!target || !certificate?.snapshot || !template) return false;
  target.innerHTML = buildCertificateMarkup(certificate, template);
  target.dataset.ready = 'true';
  return true;
}

export async function downloadCertificatePdf(mount, filename) {
  if (!mount || mount.dataset.ready !== 'true') return false;
  const canvas = await captureCertificateForDownload(mount);
  // US Letter landscape, full-bleed for print/download only.
  const pageWidth = 792;
  const pageHeight = 612;
  const imageBytes = Uint8Array.from(
    atob(canvas.toDataURL('image/jpeg', 0.97).split(',')[1]),
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
    add(number + ' 0 obj\n' + value + '\nendobj\n');
  };

  add('%PDF-1.4\n');
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  object(3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + pageWidth + ' ' + pageHeight + '] /Resources << /XObject << /Image0 4 0 R >> >> /Contents 5 0 R >>');
  offsets[4] = size;
  add('4 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + canvas.width + ' /Height ' + canvas.height + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + imageBytes.length + ' >>\nstream\n');
  add(imageBytes);
  add('\nendstream\nendobj\n');
  const stream = 'q\n' + pageWidth + ' 0 0 ' + pageHeight + ' 0 0 cm\n/Image0 Do\nQ\n';
  object(5, '<< /Length ' + encoder.encode(stream).length + ' >>\nstream\n' + stream + 'endstream');
  const xref = size;
  add('xref\n0 6\n0000000000 65535 f \n');
  for (let index = 1; index < 6; index += 1) {
    add(String(offsets[index]).padStart(10, '0') + ' 00000 n \n');
  }
  add('trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF');

  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob(chunks, { type: 'application/pdf' }));
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 500);
  return true;
}


export { FRAME_COLOR };
