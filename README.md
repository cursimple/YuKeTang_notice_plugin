# 雨课堂通知 · 课简扩展组件

登录自己的雨课堂账号后，老师发布的**作业、章节测试、考试和课程公告**由 [课简](https://github.com/cursimple/cursimple-app) 来提醒：

- **新内容通知**：老师新发了作业、考试或公告，推一条通知
- **截止前提醒**：作业、考试截止前 N 小时再提醒一次（1 / 3 / 6 / 12 / 24 / 48 小时可选）
- **侧边栏日历**：像课表一样按周排开，另有「已逾期 / 今天 / 7 天内 / 以后」的列表
- **写进课表事务**（可选）：还没做完的作业直接出现在课表上，做完或删掉后自动撤掉

组件和课简本体是解耦的：它只是一个插件包，课简负责通知、日历和课表，组件只负责去雨课堂把内容取回来。

## 安装

需要支持扩展组件（插件接口版本 3）的课简；更老的版本会提示「接口版本太新」而拒绝安装。

1. 在 [Releases](https://github.com/cursimple/YuKeTang_notice_plugin/releases) 下载 `yuketang-notice-vX.Y.Z.zip`
2. 课简 → 侧边栏「插件」→「导入 ZIP」，选中这个包
3. 在已安装插件里点「雨课堂通知」→「打开组件设置」，先登录

## 登录

点「登录」会打开雨课堂**官方**登录页，扫码、账号密码、短信验证码都行。登上后自动回到课简。

- 账号密码直接交给雨课堂官网，**不经过课简，也不经过这个组件**；课简只保存登录后的 Cookie（和浏览器一样），用来在后台同步
- 登录过期时课简会发一条通知，点进去重新登录即可
- 「退出登录」「移除组件」会作废这些 Cookie，并删掉已同步的内容

## 选项

| 选项 | 说明 |
| --- | --- |
| 雨课堂站点 | 长江雨课堂 / 雨课堂 / 黄河雨课堂 / 荷塘雨课堂，换站点后要重新登录 |
| 作业与章节测试 | 带截止时间；已完成的不再查截止时间 |
| 考试 | 试卷的开考与截止时间、作答状态 |
| 课程公告 | 每门课最近 10 条 |
| 平台系统消息 | 雨课堂官方的系统通知，默认关 |
| 只看当前学期 | 只同步最新学期的课，默认开 |
| 隐藏已完成 | 做完的作业、交过的试卷、读过的公告不再显示 |

同步间隔、新内容通知、截止前提醒、侧边栏页面、写进课表事务这几项在课简的组件设置里调，所有扩展组件通用。

## 用到的接口

都是雨课堂网页版自己在用的接口，只读，不提交任何内容：

| 用途 | 接口 |
| --- | --- |
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
bash scripts/pack.sh     # 重算 checksums.json，打包到 dist/
```

发版：改 `plugin-packages/yuketang-notice/manifest.json` 的 `version` / `versionCode`，推 `v<version>` 标签，GitHub Actions 会校验版本号、跑单测、打包并发布 Release（zip + `manifest.json`）。

扩展组件的 manifest 格式与 `ctx` 接口见课简仓库的 [docs/plugin-system.md](https://github.com/cursimple/cursimple-app/blob/main/docs/plugin-system.md#扩展组件kind--extension)。

## 许可

MIT
