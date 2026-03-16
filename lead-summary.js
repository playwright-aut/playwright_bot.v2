function clean(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

function pick(obj, paths) {
  for (const p of paths) {
    try {
      const v = p.split('.').reduce((a, k) => (a && a[k] !== undefined) ? a[k] : undefined, obj);
      if (v !== undefined && v !== null && String(v).trim() !== '') return v;
    } catch {}
  }
  return '';
}

function firstMatch(text, patterns) {
  for (const re of patterns) {
    const m = String(text || '').match(re);
    if (m && m[1]) return clean(m[1]);
  }
  return '';
}

function hasTestDriveInterest(text) {
  const t = String(text || '');
  return (
    /Érdekel\s+tesztvezetési\s+lehetőség\.?/i.test(t) ||
    /tesztvezet/i.test(t)
  );
}

function buildLeadSummary(obj, leadId) {
  if (!obj || typeof obj !== 'object') return `Lead #${leadId} feldolgozva (nincs részlet)`;

  const first = pick(obj, [
    'salesLeadContactPDTO.contactPersonPDTO.firstName',
    'salesLeadContactPDTO.contactPersonPDTO.firstname',
  ]);
  const last = pick(obj, [
    'salesLeadContactPDTO.contactPersonPDTO.lastName',
    'salesLeadContactPDTO.contactPersonPDTO.lastname',
  ]);
  const name = clean([first, last].filter(Boolean).join(' '));

  const company = clean(pick(obj, [
    'salesLeadContactPDTO.contactPersonPDTO.company',
    'salesLeadContactPDTO.contactPersonPDTO.companyName',
  ]));

  const street = clean(pick(obj, ['salesLeadContactPDTO.contactAddressPDTO.street']));
  const city = clean(pick(obj, ['salesLeadContactPDTO.contactAddressPDTO.city']));
  const postal = clean(pick(obj, ['salesLeadContactPDTO.contactAddressPDTO.postalCode']));
  const address = clean([street, [postal, city].filter(Boolean).join(' ')].filter(Boolean).join(', '));

  const channels = Array.isArray(obj?.salesLeadContactPDTO?.contactChannelPDTOList)
    ? obj.salesLeadContactPDTO.contactChannelPDTOList
    : [];

  const email = clean(
    (channels.find(c => c?.type === 'EMAIL' && c?.primary)?.contact) ||
    (channels.find(c => c?.type === 'EMAIL')?.contact) ||
    ''
  );

  const phone = clean(
    (channels.find(c => c?.type === 'TELEPHONE' && c?.primary)?.contact) ||
    (channels.find(c => c?.type === 'TELEPHONE')?.contact) ||
    ''
  );

  const model = clean(pick(obj, [
    'vehiclePDTO.modelDesignation',
    'vehiclePDTO.model',
    'vehiclePDTO.modelName'
  ]));

  const remarks = String(obj?.salesLeadInterestPDTO?.remarks || '');

  const cfg = firstMatch(remarks, [
    /Konfiguráció\s+azonosító:\s*([A-Z0-9]+)/i
  ]);

  const company2 = firstMatch(remarks, [
    /\bCég:\s*(.+?)(?:\n|$)/i
  ]);

  const additionalNotes = firstMatch(remarks, [
    /További\s+megjegyzések:\s*(.+?)(?:\n(?:[A-ZÁÉÍÓÖŐÚÜŰ][^:\n]{0,80}:)|\n\s*\n|$)/is
  ]);

  const wantsTestDrive = hasTestDriveInterest(remarks);

  const finalCompany = company || company2;

  const lines = [];
  lines.push('Ügyféladatok:');
  lines.push('');
  if (name) lines.push(`Név: ${name}`);
  if (finalCompany) lines.push(`Cég: ${finalCompany}`);
  if (address) lines.push(`Cím: ${address}`);
  if (email) lines.push(`E-mail: ${email}`);
  if (phone) lines.push(`Telefonszám: ${phone}`);
  if (additionalNotes) lines.push(`További megjegyzések: ${additionalNotes}`);

  lines.push('');
  if (model) {
    lines.push('Modell:');
    lines.push(model);
    lines.push('');
  }

  if (cfg) lines.push(`Konfiguráció azonosító: ${cfg}`);

  if (wantsTestDrive) {
    lines.push('');
    lines.push('Érdekel tesztvezetési lehetőség.');
  }

  if (email) {
    lines.push('');
    lines.push('Elérhető vagyok az alábbiakon:');
    lines.push(`E-mail: ${email}`);
  }

  const msg = lines.join('\n').trim();
  return msg || `Lead #${leadId} feldolgozva (nincs részlet)`;
}

module.exports = { buildLeadSummary };
