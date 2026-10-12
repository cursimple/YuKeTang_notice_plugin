import { normalizeAvatarUrl } from '../main.js';

const number = value => value == null || value === '' ? NaN : Number(value);
const color = value => {
  if (typeof value === 'string' && /^(#[\da-f]{6}|white|black|transparent)$/i.test(value)) return value;
  if (typeof value === 'string' && /^#[\da-f]{3}$/i.test(value)) return '#' + [...value.slice(1)].map(x => x + x).join('');
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xffffff)
    return '#' + [value & 255, (value >> 8) & 255, (value >> 16) & 255].map(x => x.toString(16).padStart(2, '0')).join('');
  return '';
};
const urlOf = (value, base) => {
  const url = normalizeAvatarUrl(value);
  return url ? new URL(url, base).href : '';
};
/** Keep signed URLs and crop/watermark operations intact; remove public thumbnail-only transforms. */
export function originalSlideImageUrl(value, base) {
  const original = urlOf(value, base);
  if (!original) return '';
  const url = new URL(original);
  if ([...url.searchParams.keys()].some(key => /token|signature|sign|expires|^e$|auth|x-amz|x-oss|x-goog/i.test(key))) return original;
  const parts = url.search.slice(1).split('&');
  const kept = parts.filter(part => {
    let decoded;
    try { decoded = decodeURIComponent(part); } catch { return true; }
    return !/^imageView2\/[0234]\/(?:w|h|q|format)\//.test(decoded) || /[|=]/.test(decoded);
  });
  if (kept.length === parts.length) return original;
  url.search = kept.filter(Boolean).join('&');
  return url.href;
}
const bounds = value => {
  if (!value) return null;
  const b = { left: number(value.Left), top: number(value.Top), width: number(value.Width), height: number(value.Height) };
  return Object.values(b).every(Number.isFinite) && b.width >= 0 && b.height >= 0 ? b : null;
};
function fontOf(font, defaultSize) {
  const size = number(font?.Size ?? defaultSize), rgb = number(font?.RGB);
  if (!(size > 0 && size <= 2000)) return null;
  // PowerPoint RGB uses an OLE BGR integer.
  const rgbColor = Number.isInteger(rgb) && rgb >= 0 && rgb <= 0xffffff
    ? '#' + [rgb & 255, (rgb >> 8) & 255, (rgb >> 16) & 255].map(n => n.toString(16).padStart(2, '0')).join('') : '#000000';
  return { size, color: rgbColor, family: String(font?.Name || 'sans-serif').slice(0, 80),
    bold: font?.Bold === true, italic: font?.Italic === true, underline: font?.Underline === true,
    strike: font?.Strike === true, superscript: font?.Superscript === true, subscript: font?.Subscript === true };
}

/** Only restore complete supported slides; never omit a shape to claim a sharp preview. */
export function normalizeSlideLayout(slide, width, height, baseUrl) {
  if (!(width > 0 && height > 0) || !Array.isArray(slide.Shapes) || !slide.Shapes.length) return null;
  const bg = slide.Background;
  let background = '#ffffff', backgroundUrl = '';
  if (bg?.Data) {
    background = color(bg.Data);
    if (!background) backgroundUrl = originalSlideImageUrl(bg.Data, baseUrl);
    if (!background && !backgroundUrl) return null;
  }
  const shapes = [];
  for (const raw of slide.Shapes) {
    const box = bounds(raw), rotation = number(raw.Rotation ?? 0);
    if (!box || !(box.width > 0 && box.height > 0) || !Number.isFinite(rotation)) return null;
    const shape = { ...box, rotation, z: number(raw.ZOrderPosition) || 0 };
    const url = originalSlideImageUrl(raw.URL, baseUrl);
    if (url) shape.url = url;
    else {
      if (!Array.isArray(raw.Paragraphs) || (raw.Orientation && raw.Orientation !== 'msoTextOrientationHorizontal')) return null;
      const lines = [], bullets = [];
      for (const p of raw.Paragraphs) {
        const paragraph = bounds(p.Bound);
        if (!paragraph || !Array.isArray(p.Lines)) return null;
        for (const line of p.Lines) {
          if (!line.Texts?.length && !line.Html) continue;
          const lineBox = bounds(line.Bound);
          if (!lineBox || !Array.isArray(line.Texts)) return null;
          const runs = line.Texts.map(run => ({ text: typeof run.Text === 'string' ? run.Text.replace(/[\r\n\v]/g, '') : '', font: fontOf(run.Font, raw.FontSize) }));
          if (runs.some(run => !run.font)) return null;
          lines.push({ ...lineBox, left: paragraph.left + lineBox.left, top: paragraph.top + lineBox.top, runs });
        }
        if (p.BulletBound) {
          const b = bounds(p.BulletBound), font = fontOf(p.BulletFont, raw.FontSize);
          if (!b || !font) return null;
          const code = number(p.Character);
          // Private Wingdings glyphs are not portable to Android fonts.
          const text = code >= 0xf000 && code <= 0xf8ff ? (code === 61656 ? '›' : '•')
            : Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '•';
          bullets.push({ ...b, text, font });
        }
      }
      shape.lines = lines; shape.bullets = bullets;
      shape.fill = raw.Fill?.Visble === true ? color(raw.Fill.BackColor) : '';
      shape.opacity = Math.max(0, Math.min(1, 1 - (number(raw.Fill?.Transparency) || 0)));
      shape.stroke = raw.Line?.Visble === true ? color(raw.Line.BackColor) : '';
      shape.strokeWidth = Math.max(0, number(raw.Line?.Weight) || 0);
      if ((raw.Fill?.Visble === true && !shape.fill) || (raw.Line?.Visble === true && !shape.stroke)) return null;
    }
    shapes.push(shape);
  }
  return { width, height, background: background || '#ffffff', backgroundUrl, shapes: shapes.sort((a, b) => a.z - b.z) };
}

const ns = 'http://www.w3.org/2000/svg';
function node(name, attributes = {}) {
  const result = document.createElementNS(ns, name);
  for (const [key, value] of Object.entries(attributes)) result.setAttribute(key, String(value));
  return result;
}
function textNode(line) {
  const fonts = line.runs.map(run => run.font), size = Math.max(...fonts.map(f => f.size));
  const text = node('text', { x: line.left, y: line.top + Math.max(0, (line.height - size) / 2), 'dominant-baseline': 'text-before-edge', 'xml:space': 'preserve' });
  // Use the source line's measured bounds, rather than wrapping it in the app's font.
  if (line.width > 0) { text.setAttribute('textLength', line.width); text.setAttribute('lengthAdjust', 'spacingAndGlyphs'); }
  for (const run of line.runs) {
    const f = run.font;
    const span = node('tspan', { 'font-family': `${f.family}, sans-serif`, 'font-size': f.size,
      fill: f.color, 'font-weight': f.bold ? 700 : 400, 'font-style': f.italic ? 'italic' : 'normal',
      'text-decoration': [f.underline ? 'underline' : '', f.strike ? 'line-through' : ''].filter(Boolean).join(' ') || 'none' });
    if (f.superscript || f.subscript) { span.setAttribute('baseline-shift', f.superscript ? 'super' : 'sub'); span.setAttribute('font-size', f.size * .7); }
    span.textContent = run.text; text.append(span);
  }
  return text;
}

export function createSlideSvg(layout, title) {
  const svg = node('svg', { viewBox: `0 0 ${layout.width} ${layout.height}`, role: 'img', 'aria-label': title, width: '100%', height: '100%' });
  svg.append(node('rect', { width: layout.width, height: layout.height, fill: layout.background }));
  if (layout.backgroundUrl) svg.append(node('image', { href: layout.backgroundUrl, width: layout.width, height: layout.height, preserveAspectRatio: 'none' }));
  for (const s of layout.shapes) {
    const group = node('g', { transform: `translate(${s.left} ${s.top}) rotate(${s.rotation} ${s.width / 2} ${s.height / 2})` });
    if (s.url) group.append(node('image', { href: s.url, width: s.width, height: s.height, preserveAspectRatio: 'none' }));
    else {
      if (s.fill || s.stroke) group.append(node('rect', { width: s.width, height: s.height, fill: s.fill || 'none', 'fill-opacity': s.opacity, stroke: s.stroke || 'none', 'stroke-width': s.strokeWidth }));
      for (const line of s.lines) group.append(textNode(line));
      for (const bullet of s.bullets) group.append(textNode({ ...bullet, runs: [{ text: bullet.text, font: bullet.font }] }));
    }
    svg.append(group);
  }
  return svg;
}

/** Decode full-resolution resources once. Pinching only transforms the displayed page. */
export async function prepareSlideLayout(layout, { signal, loadImage = decodeSlideImage } = {}) {
  const urls = [...new Set([layout.backgroundUrl, ...layout.shapes.map(s => s.url)].filter(Boolean))];
  await Promise.all(urls.map(url => loadImage(url, { signal })));
}
export function decodeSlideImage(url, { signal } = {}) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const done = (failure) => {
      img.onload = img.onerror = null; signal?.removeEventListener('abort', abort);
      if (failure) { img.removeAttribute('src'); reject(failure); }
      else resolve(img);
    };
    const abort = () => done(new DOMException('cancelled', 'AbortError'));
    if (signal?.aborted) { abort(); return; }
    signal?.addEventListener('abort', abort, { once: true });
    img.onload = () => done(); img.onerror = () => done(new Error('高清课件图片加载失败'));
    img.src = url;
  });
}
