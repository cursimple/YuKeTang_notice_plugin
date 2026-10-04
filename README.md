# 雨课堂通知 · 课简扩展组件

登录自己的雨课堂账号后，老师发布的**作业、章节测试、考试和课程公告**由 [课简](https://github.com/cursimple/cursimple-app) 来提醒：

- **新内容通知**：老师新发了作业、考试或公告，推一条通知
- **截止前提醒**：作业、考试截止前 N 小时再提醒一次（1 / 3 / 6 / 12 / 24 / 48 小时可选）
- **组件自带月历**：界面随组件包安装，整月显示，点击日期查看当天内容；往期公告用灰色弱化
- **写进课表事务**（可选）：还没做完的作业直接出现在课表上，做完或删掉后自动撤掉

组件和课简本体是解耦的：组件包负责登录、数据获取及所有业务页面；课简提供通用容器、主题颜色、通知、存储和课表接口。

组件还自带 `ui/feed.html` 页面。课简只提供通用容器、数据和同步桥，月历与公告详情由组件自己绘制；以后替换这个页面只需要更新组件 ZIP。

组件自带 `ui/login.html`（登录）和 `ui/settings.html`（设置）两个页面，登录协议（短信验证码、腾讯安全验证、微信扫码）也全在组件里。课简不解析任何雨课堂接口，只提供通用的 Cookie、网络、二维码渲染和存储能力。

内容的类型也由组件定义：清单里 `feedTypes` 的每一项声明 `kind` 为 `task`（有截止，会算逾期、能写进课表）或 `notice`（读完即止）。课简不认具体类型名，换个平台或改类型 id 都不用动课简。

## 安装

需要支持扩展组件（插件接口版本 4）的课简；更老的版本会提示「接口版本太新」而拒绝安装。

1. 在 [Releases](https://github.com/cursimple/YuKeTang_notice_plugin/releases) 下载 `yuketang-notice-vX.Y.Z.zip`
2. 课简 → 侧边栏「插件」→「组件」标签页 →「导入 ZIP」，选中这个包
3. 在已安装组件里点「雨课堂通知」→「打开组件设置」，先登录

## 登录

点「登录」会在课简内打开手机端登录面板，支持手机号短信验证码和微信扫码。短信发码前先完成官方腾讯安全验证；微信二维码通过官方 HTTPS 接口获取和确认。账号校验通过后显示“连接成功”，可进入课堂页面或调整设置；失败显示具体原因，支持重新检查登录结果。二维码显示有效期倒计时，过期后可刷新。

- 短信验证码和微信扫码直接交给雨课堂登录接口；课简不保存手机号和验证码，只保存登录后的 Cookie，用来在后台同步
- 登录过期时课简会发一条通知，点进去重新登录即可
- 「退出登录」「移除组件」会作废这些 Cookie，并删掉已同步的内容

## 界面

未登录或登录过期时，专属页面只显示登录引导。登录后可切换月历和列表；点击日期查看当天条目，点条目阅读正文、图片和附件。设置首页收纳为四个入口，详细选项在独立面板中显示。常规手机尺寸下主页面保持一屏；长列表、正文、大字体和键盘弹出时允许必要滚动。配色跟随宿主浅色／深色主题。

## 选项

| 选项 | 说明 |
| --- | --- |
| 雨课堂站点 | 长江雨课堂 / 雨课堂 / 黄河雨课堂 / 荷塘雨课堂，换站点后要重新登录 |
| 作业与章节测试 | 带截止时间；已完成的不再查截止时间 |
| 考试 | 试卷的开考与截止时间、作答状态 |
| 课程公告 | 当前学期优先，公告分页读取；往期课程公告也会同步并灰色显示 |
| 平台系统消息 | 雨课堂官方的系统通知，默认关 |
| 只看当前学期 | 只同步最新学期的课，默认开 |
| 隐藏已完成 | 做完的作业、交过的试卷、读过的公告不再显示 |

同步间隔、新内容通知、截止前提醒、侧边栏页面、写进课表事务这几项在课简的组件设置里调，所有扩展组件通用。

## 用到的接口

同步内容使用雨课堂网页版的只读接口；登录只提交用户主动完成的验证与登录操作：

| 用途 | 接口 |
| --- | --- |
| 短信登录 | `POST /pc/login/send_sms_login_code/` → `POST /pc/login/verify_pwd_login/` |
| 微信扫码 | `GET /api/v3/user/login/app-web-pre-info` → `POST /api/v3/user/login/app-web-login` |
| 课程列表 | `GET /v2/api/web/courses/list?identity=2` |
| 登录校验与账号 | `GET /api/v3/user/basic-info` |
| 作业列表 | `GET /c27/online_courseware/course/classroom/{cid}/0/sku_list/` → `…/schedule/score_detail/single/{sku}/0/` |
| 作业截止时间 | `GET /mooc-api/v1/lms/learn/leaf_info/{cid}/{leaf}/` |
| 考试 | `GET /v2/api/web/logs/learn/{cid}`（type 5）+ `GET /v/exam/cover` |
| 公告 | `GET /v/discussion/v2/announcements/?cid={cid}&type=9` |
| 系统消息 | `GET /c27/online_courseware/ykt/system_message/?client_type=2` |

截止时间和交卷状态会缓存在组件自己的存储里，已完成、已截止的条目不再重复请求。

## 开发

```bash
node --test test/        # 单测：假的 ctx + 按接口结构写的假数据
node scripts/preview-server.mjs # 本地界面演示，使用模拟数据，不连接真实账号
bash scripts/pack.sh     # 重算 checksums.json，打包到 dist/
```

发版：改 `plugin-packages/yuketang-notice/manifest.json` 的 `version` / `versionCode`，推 `v<version>` 标签，GitHub Actions 会校验版本号、跑单测、打包并发布 Release（zip + `manifest.json`）。

扩展组件的 manifest 格式与 `ctx` 接口见课简仓库的 [docs/plugin-system.md](https://github.com/cursimple/cursimple-app/blob/main/docs/plugin-system.md#扩展组件kind--extension)。

## 许可

MIT
