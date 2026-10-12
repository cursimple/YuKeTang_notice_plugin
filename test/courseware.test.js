import test from 'node:test';
import assert from 'node:assert/strict';
import { coursewareReference, normalizeCourseware, readCourseware } from '../plugin-packages/yuketang-notice/ui/courseware-api.js';
import { normalizeSlideLayout, prepareSlideLayout } from '../plugin-packages/yuketang-notice/ui/courseware-layout.js';

const item = { id:'courseware:101:3001',type:'homework',category:'课件' };
const data = { errcode:0,errmsg:'Success',data:{Title:'学习指南',Width:960,Height:540,Slides:[
  {PageIndex:1,Cover:'http://changjiang-public-qn.yuketang.cn/example/page1.jpg'},
  {PageIndex:2,Cover:'//yangtse-oplat.xuetangx.com/example/page2.jpg'},
]} };

test('课件阅读只接受组件自己的课件条目，保留字符串 ID 精度',()=>{
 assert.deepEqual(coursewareReference(item),{classroomId:'101',cardsId:'3001'});
 assert.equal(coursewareReference({...item,id:'courseware:101:1781102982428633216'}).cardsId,'1781102982428633216');
 for(const value of [{...item,category:'作业'},{...item,id:'https://evil.example'},{...item,id:'courseware:101:0'},{...item,type:'announcement'}])assert.throws(()=>coursewareReference(value));
});
test('真实课件响应结构产生实际页面，并将图片改为 HTTPS',()=>{
 const doc=normalizeCourseware(data,'https://changjiang.yuketang.cn');
 assert.equal(doc.title,'学习指南');
 assert.deepEqual(doc.pages,[{number:1,url:'https://changjiang-public-qn.yuketang.cn/example/page1.jpg'},{number:2,url:'https://yangtse-oplat.xuetangx.com/example/page2.jpg'}]);
});
test('整页单张图片使用清晰原图并保留 PPT 比例，不完整版式保留整页封面',()=>{
 const json=structuredClone(data), shape={ShapeType:13,Type:'msoPicture',Left:0,Top:0,Width:960,Height:540,Rotation:0,URL:'https://changjiang-public-qn.yuketang.cn/example/full.jpg'};
 json.data.Slides[0].Shapes=[shape];
 json.data.Slides[1].Shapes=[shape,{ShapeType:1}];
 const doc=normalizeCourseware(json,'https://changjiang.yuketang.cn');
 assert.equal(doc.pages[0].url,shape.URL);assert.equal(doc.pages[0].fallbackUrl,'https://changjiang-public-qn.yuketang.cn/example/page1.jpg');
 assert.equal(doc.pages[0].width,960);assert.equal(doc.pages[0].height,540);
 assert.equal(doc.pages[1].url,'https://yangtse-oplat.xuetangx.com/example/page2.jpg');
});

const box = (left = 0, top = 0, width = 200, height = 40) => ({ Left: left, Top: top, Width: width, Height: height });
const textShape = () => ({ ...box(20, 30, 880, 70), FontSize: 44, Type: 'msoTextBox', Rotation: 0, ZOrderPosition: 2,
  Paragraphs: [{ Bound: box(7, 1, 800, 60), Lines: [{ Bound: box(0, 4, 780, 52),
    Html: '<img src=x onerror="alert(1)">', Texts: [{ Text: 'WEB 操作方法——学习', Font: { Size: 44, RGB: 12611584, Bold: true } }] }] }] });

test('128像素封面改用原始图片和文字，保留坐标、颜色、图层与旋转', () => {
 const slide = { Cover: 'https://changjiang-public-qn.yuketang.cn/cover19.jpg', Background: { Type: 'FillSolid', Data: '#D5EDFF' }, Shapes: [
   textShape(), { ...box(35, 90, 888, 412), URL: 'http://changjiang-public-qn.yuketang.cn/slide19.png', Rotation: 12, ZOrderPosition: 1 },
 ] };
 const doc = normalizeCourseware({ data: { Width: 960, Height: 540, Slides: [slide] } }, 'https://changjiang.yuketang.cn');
 const p = doc.pages[0];
 assert.equal(p.width, 960); assert.equal(p.height, 540); assert.equal(p.layout.background, '#D5EDFF');
 assert.equal(p.layout.shapes[0].url, 'https://changjiang-public-qn.yuketang.cn/slide19.png');
 assert.equal(p.layout.shapes[0].rotation, 12);
 const line = p.layout.shapes[1].lines[0];
 assert.equal(line.left, 7); assert.equal(line.top, 5); assert.equal(line.runs[0].font.color, '#0070c0');
 assert.equal(line.runs[0].text, 'WEB 操作方法——学习'); assert.equal(line.runs[0].font.bold, true);
 assert.equal(JSON.stringify(p.layout).includes('onerror'), false);
});
test('安全地保留原版式；缺少文字、图片或不支持的方向必须回退整页，不能漏内容', () => {
 const slide = { Background: { Data: 'White' }, Shapes: [textShape()] };
 assert.ok(normalizeSlideLayout(slide, 960, 540, 'https://changjiang.yuketang.cn'));
 for (const mutate of [s => s.Shapes.push({ ...box(), URL: 'javascript:alert(1)' }),
   s => s.Shapes[0].Paragraphs[0].Lines[0].Texts = undefined,
   s => s.Shapes[0].Orientation = 'msoTextOrientationVertical',
   s => s.Background.Data = 'javascript:alert(1)', s => s.Shapes[0].Width = 'oops']) {
   const invalid = structuredClone(slide); mutate(invalid);
   assert.equal(normalizeSlideLayout(invalid, 960, 540, 'https://changjiang.yuketang.cn'), null);
 }
});
test('没有Cover但有完整高清版式仍能阅读；字符串数值的整页图片也使用原图', () => {
 const j = { data: { Width: '960', Height: '540', Slides: [{ Shapes: [textShape()] },
   { Cover: 'https://a.example/cover.jpg', Shapes: [{ ...box('0', '0', '960', '540'), Rotation: '0', Type: 'msoPicture', URL: 'https://a.example/original.jpg' }] }] } };
 const p = normalizeCourseware(j, 'https://changjiang.yuketang.cn').pages;
 assert.ok(p[0].layout); assert.equal(p[0].url, ''); assert.equal(p[1].url, 'https://a.example/original.jpg');
});
test('高清页面资源只加载一次，全部准备好才展示；失败和取消向阅读页返回', async () => {
 const layout = { backgroundUrl: 'https://a.example/bg.png', shapes: [{ url: 'https://a.example/image.png' }, { url: 'https://a.example/image.png' }] };
 const calls = [], controller = new AbortController();
 await prepareSlideLayout(layout, { signal: controller.signal, loadImage: async (url, options) => { calls.push(url); assert.equal(options.signal, controller.signal); } });
 assert.deepEqual(calls, ['https://a.example/bg.png', 'https://a.example/image.png']);
 await assert.rejects(prepareSlideLayout(layout, { loadImage: async () => { throw Error('图片不可用'); } }), /图片不可用/);
 controller.abort();
 await assert.rejects(prepareSlideLayout(layout, { signal: controller.signal, loadImage: async (_, { signal }) => { if(signal.aborted) throw new DOMException('cancelled', 'AbortError'); } }), { name: 'AbortError' });
});
test('缺少某页图片时保留页码顺序，全部无图和不安全链接报错',()=>{
 const mixed=structuredClone(data);mixed.data.Slides[0].Cover='javascript:alert(1)';
 assert.deepEqual(normalizeCourseware(mixed,'https://changjiang.yuketang.cn').pages[0],{number:1,url:''});
 mixed.data.Slides[1].Cover='https://user:password@example.com/page.jpg';
 assert.throws(()=>normalizeCourseware(mixed,'https://changjiang.yuketang.cn'),/暂时不可用/);
 assert.throws(()=>normalizeCourseware({data:{Slides:[]}},'https://changjiang.yuketang.cn'),/没有可预览/);
});
test('读取只发同站 GET，携带登录态、取消信号，不提交阅读完成状态',async()=>{
 const calls=[],controller=new AbortController();
 const result=await readCourseware(item,{site:'huanghe.yuketang.cn',signal:controller.signal,fetch:async(url,init)=>{
  calls.push({url,init});return{ok:true,status:200,text:async()=>JSON.stringify(data)};
 }});
 assert.equal(result.pages.length,2);
 assert.equal(calls.length,1);
 assert.equal(calls[0].url,'https://huanghe.yuketang.cn/v2/api/web/cards/detlist/3001?classroom_id=101');
 assert.equal(calls[0].init.method,'GET');assert.equal(calls[0].init.credentials,'include');assert.equal(calls[0].init.signal,controller.signal);
});
test('课件读取失败、登录失效与权限不足不能冒充预览成功',async()=>{
 for(const [response,pattern] of [
  [{status:401,ok:false},/登录已失效/],
  [{status:403,ok:false},/阅读权限/],
  [{status:503,ok:false},/读取失败/],
  [{status:200,ok:true,text:async()=>'<html>login</html>'},/登录已失效/],
  [{status:200,ok:true,text:async()=>JSON.stringify({errcode:12,errmsg:'课件尚未开放'})},/尚未开放/],
 ])await assert.rejects(readCourseware(item,{fetch:async()=>response}),pattern);
});

test('公开缩略图读原图，保留回退与原版式；签名和裁剪链接原样保留', async () => {
 const { originalSlideImageUrl } = await import('../plugin-packages/yuketang-notice/ui/courseware-layout.js');
 const base = 'https://changjiang.yuketang.cn';
 const resized = 'https://changjiang-public-qn.yuketang.cn/slide.jpg?imageView2/2/w/128/q/25&download=1';
 assert.equal(originalSlideImageUrl(resized, base), 'https://changjiang-public-qn.yuketang.cn/slide.jpg?download=1');
 for (const query of ['imageView2/2/w/128&e=123&token=signed', 'imageView2/2/w/128&X-Amz-Signature=abc', 'imageView2/1/w/128/h/128', 'imageView2/2/w/128|watermark/1/image/xyz']) {
   const url = 'https://changjiang-public-qn.yuketang.cn/slide.jpg?' + query;
   assert.equal(originalSlideImageUrl(url, base), url);
 }
 const doc = normalizeCourseware({data:{Width:960,Height:540,Slides:[{Cover:resized}]}}, base);
 assert.equal(doc.pages[0].url, 'https://changjiang-public-qn.yuketang.cn/slide.jpg?download=1');
 assert.equal(doc.pages[0].fallbackUrl, resized);
 const layout = normalizeSlideLayout({Shapes:[{...box(0,0,960,540), URL:resized}]},960,540,base);
 assert.equal(layout.shapes[0].url,doc.pages[0].url);
});

test('旧课件的数值颜色与短十六进制背景可恢复高清版式，不能漏掉无法解析的填充',()=>{
 const s={Background:{Data:'#def'},Shapes:[{...textShape(),Fill:{Visble:true,BackColor:12611584,Transparency:0},Line:{Visble:true,BackColor:0,Weight:1}}]};
 const layout=normalizeSlideLayout(s,960,540,'https://changjiang.yuketang.cn');
 assert.equal(layout.background,'#ddeeff');assert.equal(layout.shapes[0].fill,'#0070c0');assert.equal(layout.shapes[0].stroke,'#000000');
 const bad=structuredClone(s);bad.Shapes[0].Fill.BackColor='unsupported paint';
 assert.equal(normalizeSlideLayout(bad,960,540,'https://changjiang.yuketang.cn'),null);
});
