import { normalizeAvatarUrl } from '../main.js';
import { normalizeSlideLayout, originalSlideImageUrl } from './courseware-layout.js';

export const COURSEWARE_PROGRESS_HINT = '请前往雨课堂查看，完成情况会在下次同步时按雨课堂记录更新。';

function coursewareHost(site) {
  return /^[a-z0-9.-]+\.yuketang\.cn$/.test(site || '') ? site : 'changjiang.yuketang.cn';
}

export function coursewareOfficialUrl(item, site) {
  const { classroomId } = coursewareReference(item);
  return `https://${coursewareHost(site)}/v2/web/studentLog/${classroomId}`;
}

export function coursewareReference(item) {
  if (item?.type !== 'homework' || item?.category !== '课件') throw new Error('这条内容不是课件');
  const match = /^courseware:([1-9]\d*):([1-9]\d*)$/.exec(item.id || '');
  if (!match) throw new Error('课件信息已变更，请重新同步');
  return { classroomId: match[1], cardsId: match[2] };
}

export function normalizeCourseware(json, baseUrl) {
  if (json?.code === 50000 || json?.msg === 'UNAUTHENTICATED') throw new Error('登录已失效，请重新登录雨课堂');
  if (json?.success === false || [json?.errcode, json?.code].some(n => n != null && String(n) !== '0')) {
    throw new Error(String(json?.errmsg || json?.msg || '课件暂时无法读取').slice(0, 160));
  }
  const data = json?.data;
  if (!Array.isArray(data?.Slides) || !data.Slides.length) throw new Error('这份课件没有可预览的页面');
  const pages = data.Slides.map((slide, index) => {
    const width = Number(data.Width), height = Number(data.Height);
    const cover = normalizeAvatarUrl(slide?.Cover);
    const page = {
      number: Number(slide?.PageIndex) > 0 ? Number(slide.PageIndex) : index + 1,
      url: cover ? originalSlideImageUrl(cover, baseUrl) : '',
    };
    if (cover && page.url !== new URL(cover, baseUrl).href) page.fallbackUrl = new URL(cover, baseUrl).href;
    // A single picture covering the whole slide has a readable original image.
    // Keep the PPT's aspect ratio; multi-shape pages use its rendered cover.
    const shape = slide?.Shapes?.length === 1 ? slide.Shapes[0] : null;
    const original = normalizeAvatarUrl(shape?.URL);
    if (original && (shape.Type === 'msoPicture' || shape.ShapeType === 13) &&
        Number(shape.Left) === 0 && Number(shape.Top) === 0 && !Number(shape.Rotation) &&
        width > 0 && height > 0 && Number(shape.Width) === width && Number(shape.Height) === height) {
      page.fallbackUrl = page.url;
      page.url = originalSlideImageUrl(original, baseUrl);
      page.width = width; page.height = height;
    } else {
      const layout = normalizeSlideLayout(slide, width, height, baseUrl);
      if (layout) { page.layout = layout; page.width = width; page.height = height; }
    }
    return page;
  });
  if (!pages.some(p => p.url || p.layout)) throw new Error('课件页面暂时不可用，请稍后重试');
  return { title: String(data.Title || '课件'), pages };
}

export async function readCourseware(item, { site, fetch: fetcher = globalThis.fetch, signal } = {}) {
  const { classroomId, cardsId } = coursewareReference(item);
  const host = coursewareHost(site);
  const url = `https://${host}/v2/api/web/cards/detlist/${cardsId}?classroom_id=${classroomId}`;
  const response = await fetcher(url, { method: 'GET', credentials: 'include', signal });
  if (response.status === 401) throw new Error('登录已失效，请重新登录雨课堂');
  if (!response.ok) throw new Error(response.status === 403 ? '雨课堂未开放这份课件的阅读权限' : '课件读取失败，请重试');
  const text = await response.text();
  let json;
  try { json = JSON.parse(text); } catch (_) {
    throw new Error(/<html/i.test(text) ? '登录已失效，请重新登录雨课堂' : '课件内容格式不正确，请重试');
  }
  return normalizeCourseware(json, response.url || url);
}
