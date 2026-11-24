// Minimal, dependency-free .docx writer (OOXML in a ZIP). Enough for headings, paragraphs, tables and page breaks.
const zlib = require('zlib');

/* ---------------- zip ---------------- */
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) {
  if (typeof zlib.crc32 === 'function') return zlib.crc32(buf) >>> 0;
  let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0;
}
function zip(files) {
  const d = new Date();
  const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const locals = [], centrals = []; let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8'), raw = Buffer.from(f.data, 'utf8'), comp = zlib.deflateRawSync(raw), crc = crc32(raw);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(8, 8);
    lh.writeUInt16LE(dosTime, 10); lh.writeUInt16LE(dosDate, 12); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(raw.length, 22);
    lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28);
    locals.push(lh, name, comp);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(8, 10);
    ch.writeUInt16LE(dosTime, 12); ch.writeUInt16LE(dosDate, 14); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(raw.length, 24);
    ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(offset, 42);
    centrals.push(ch, name);
    offset += 30 + name.length + comp.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

/* ---------------- WordprocessingML helpers ---------------- */
const x = s => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const run = (t, o = {}) => `<w:r><w:rPr>${o.bold ? '<w:b/>' : ''}${o.italic ? '<w:i/>' : ''}${o.color ? `<w:color w:val="${o.color}"/>` : ''}${o.size ? `<w:sz w:val="${Math.round(o.size * 2)}"/>` : ''}</w:rPr><w:t xml:space="preserve">${x(t)}</w:t></w:r>`;
// runs: string or [{t, ...opts}]
function para(runs, o = {}) {
  const rs = (typeof runs === 'string' ? [{ t: runs }] : runs).map(r => run(r.t, { ...o, ...r })).join('');
  const ppr = (o.keepNext ? '<w:keepNext/>' : '') + (o.borderBottom ? `<w:pBdr><w:bottom w:val="single" w:sz="8" w:space="2" w:color="${o.borderBottom}"/></w:pBdr>` : '') +
    (o.fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${o.fill}"/>` : '') +
    `<w:spacing w:before="${o.before ?? 0}" w:after="${o.after ?? 120}"/>` + (o.indent ? `<w:ind w:left="${o.indent}" w:hanging="${o.hanging || 0}"/>` : '') + (o.align ? `<w:jc w:val="${o.align}"/>` : '');
  return `<w:p><w:pPr>${ppr}</w:pPr>${rs}</w:p>`;
}
const pageBreak = () => '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
function cell(content, w, o = {}) {
  const inner = Array.isArray(content) ? content.join('') : para(content, { after: 40, before: 40, ...o });
  return `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${o.fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${o.fill}"/>` : ''}</w:tcPr>${inner}</w:tc>`;
}
function table(rows, widths, o = {}) {
  const b = c => `w:val="single" w:sz="4" w:space="0" w:color="${c}"`;
  const border = o.border === false ? '' : `<w:tblBorders><w:top ${b('B7C3D8')}/><w:left ${b('B7C3D8')}/><w:bottom ${b('B7C3D8')}/><w:right ${b('B7C3D8')}/><w:insideH ${b('D5DDEB')}/><w:insideV ${b('D5DDEB')}/></w:tblBorders>`;
  return `<w:tbl><w:tblPr><w:tblW w:w="${widths.reduce((a, c) => a + c, 0)}" w:type="dxa"/>${border}<w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="110" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="110" w:type="dxa"/></w:tblCellMar></w:tblPr>` +
    `<w:tblGrid>${widths.map(w => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${rows.map(r => `<w:tr>${r.join('')}</w:tr>`).join('')}</w:tbl>`;
}

function build(bodyXml) {
  const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  const head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  return zip([
    { name: '[Content_Types].xml', data: `${head}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>` },
    { name: '_rels/.rels', data: `${head}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>` },
    { name: 'word/_rels/document.xml.rels', data: `${head}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: 'word/styles.xml', data: `${head}<w:styles ${NS}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:eastAsia="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-GB"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style></w:styles>` },
    { name: 'word/document.xml', data: `${head}<w:document ${NS}><w:body>${bodyXml}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1000" w:right="1134" w:bottom="1000" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>` },
  ]);
}

module.exports = { build, para, table, cell, pageBreak, x };
