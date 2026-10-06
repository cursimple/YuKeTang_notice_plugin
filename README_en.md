# YuKeTang notices for CurSimple

Receive assignments, chapter tests, exams and course announcements through [CurSimple](https://github.com/cursimple/cursimple-app) after signing into your own platform account.

[中文](README.md) · [Downloads](https://github.com/cursimple/YuKeTang_notice_plugin/releases) · [Host API](https://github.com/cursimple/cursimple-app/blob/main/docs/plugin-system.md#extension-components)

The component owns authentication, synchronization and its login/settings/calendar pages. The host supplies a generic container, theme, cookies, storage, notifications and timetable integration. Service APIs and item IDs stay outside the app.

## Features

- New-content notices and configurable deadline reminders.
- Owned month calendar and list, with historical notices visually subdued.
- Full content, images and retained attachments.
- Optional unfinished-task placement in timetable events.
- Confirmed read actions, manual ignore/restore and optional automatic overdue ignoring.

## Installation and sign-in

Current version: **1.3.1**.

Requires plugin **API 9** or later; unsupported hosts reject installation.

1. Download `yuketang-notice-vX.Y.Z.zip` from Releases.
2. Open CurSimple → Plugins → Components → Import ZIP.
3. Open the installed component's settings and sign in.

SMS sign-in requires the platform's interactive security verification. QR sign-in uses official platform connections and expiry handling. Account validation must succeed before reporting a connection. The component does not persist phone numbers or SMS codes; session cookies support later synchronization. Expiry prompts reauthentication. Logout or removal clears cookies and synchronized content.

## Configuration

Select a supported YuKeTang endpoint; changing it requires signing in again. The available domains are declared in `manifest.json`.

| Option | Behavior |
|---|---|
| Assignments and chapter tests | Read task progress and deadlines |
| Exams | Read availability, start/deadline and submission state |
| Course announcements | Read paginated notices, including historical courses |
| Platform messages | Optional system notices, disabled by default |
| Current term only | Limit task sync to the latest term by default |
| Hide completed | Hide completed tasks and read notices |
| Automatically ignore overdue tasks | Disabled by default; explicit restoration remains available |

Generic synchronization interval, notification timing, sidebar visibility and timetable placement are host settings. Feed-type IDs, labels and task/notice semantics belong to this manifest.

## Content actions

Announcement details expose a confirmed read action. The component follows student topic-detail access and rechecks `is_read` in the official list. `/v/discussion/v2/notice/read/info/` lists readers for teachers and is not used to write status. System notices use `/api/v3/message/notice/read` and also recheck status. Failure preserves unread state; local clicks never substitute for official confirmation.

**Real-account server synchronization has not been verified.** Tests cover simulated successful and failed branches; verify the first read operation against the official platform.

Ignoring affects host presentation only. Ignored items remain in a restorable list outside ordinary date filters, while widgets and reminders exclude them. Choices survive synchronization; an individually restored task remains visible even under automatic overdue ignoring.

## Platform requests

| Purpose | Route |
|---|---|
| SMS sign-in | `/pc/login/send_sms_login_code/`, `/pc/login/verify_pwd_login/` |
| QR sign-in | `/api/v3/user/login/app-web-pre-info`, `/api/v3/user/login/app-web-login` |
| Course list | `/v2/api/web/courses/list?identity=2` |
| Session validation | `/api/v3/user/basic-info` |
| Assignment list/progress | `/c27/online_courseware/course/classroom/{cid}/0/sku_list/`, schedule score detail |
| Task deadline | `/mooc-api/v1/lms/learn/leaf_info/{cid}/{leaf}/` |
| Exams | `/v2/api/web/logs/learn/{cid}`, `/v/exam/cover` |
| Announcements | `/v/discussion/v2/announcements/` |
| Platform messages | `/c27/online_courseware/ykt/system_message/` |

Cache deadline and submission lookups to avoid repeating completed or expired work. Read writes occur only after user confirmation; authentication submits the verification explicitly completed by the user.

## Development

```sh
npm test
node scripts/preview-server.mjs
npm run pack
```

Tests use fixture `ctx` and protocol-shaped responses. Preview uses simulated data without real account access. Packing recalculates checksums and writes ignored `dist/` artifacts.

Set manifest `version` and `versionCode`, then push the matching `v<version>` tag. CI validates, tests, packs and creates the ZIP and release manifest. Do not pre-create a duplicate Release.

[MIT License](LICENSE)

## Desktop widget

The component declares its own desktop widget in `extension.widgets`. `ui/widget.html`, `widget.css`, `widget.js` and `widget-model.js` own its layout, text, filtering and navigation. The host supplies API 9 rendering and binding only. It appears after this component is installed and enabled; removing the component removes its entry.
