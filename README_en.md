# YuKeTang notices for CurSimple

Receive assignments, self-study courseware, chapter tests, exams and course announcements through [CurSimple](https://github.com/cursimple/cursimple-app) after signing into your own platform account.

[中文](README.md) · [Downloads](https://github.com/cursimple/YuKeTang_notice_plugin/releases) · [Host API](https://github.com/cursimple/cursimple-app/blob/main/docs/plugin-system.md#extension-components)

The component owns authentication, synchronization and its login/settings/calendar pages. The host supplies a generic container, theme, cookies, storage, notifications and timetable integration. Service APIs and item IDs stay outside the app.

## Features

- New-content notices and configurable deadline reminders.
- Owned month calendar and list, with historical notices visually subdued.
- Full content, images and retained attachments.
- Optional unfinished-task placement in timetable events.
- Confirmed read actions, manual ignore/restore and optional automatic overdue ignoring.

## Installation and sign-in

Current local version: **1.3.9**.

Requires plugin **API 11** or later; unsupported hosts reject installation.

1. Download `yuketang-notice-vX.Y.Z.zip` from Releases.
2. Open CurSimple → Plugins → Components → Import ZIP.
3. Open the installed component home and sign in.

SMS sign-in requires the platform's interactive security verification. Account validation must succeed before reporting a connection. The component does not persist phone numbers or SMS codes; session cookies support later synchronization. Expiry prompts reauthentication. Logout or removal clears cookies and synchronized content.

Account avatars come from the current profile, with web-profile field fallbacks and HTTPS URL normalization. Switching accounts fetches the avatar again; optional profile failures preserve the session already verified by v3.

Self-study courseware uses the assignment category and existing reminder/widget settings. Each sync reads official reading completion; matching resource IDs merge activity and chapter entries. Undated courseware does not inherit the course end date. Details open an in-component reader with page navigation, page jumps, pinch zoom and retry. Supported slides restore original images and text at platform coordinates instead of enlarging a 128-pixel cover; unsupported layouts or resource failures keep a complete preview with retry. Details and preview both offer Open YuKeTang, asking users to review and complete learning there. Completion updates from the official records on the next sync. Activity, score, leaf-detail and 28-page reading were verified in a real signed-in session; phone notification delivery remains unverified.


Local 1.3.8 removes QR sign-in and its connection/exchange logic. The login page uses SMS verification directly. Existing saved sessions remain available; import the new component alongside the previously delivered API 11 APK. After validation, sign-in opens the classroom and the paired host synchronizes once.

## Configuration

Select a supported YuKeTang endpoint; changing it requires signing in again. The available domains are declared in `manifest.json`.

| Option | Behavior |
|---|---|
| Assignments, courseware and chapter tests | Read answer/reading progress; remind before explicit deadlines |
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
| Account avatar | `/mobile-app/api/user/profile`, falling back to `/api/web_lesson/user_info/` |
| Assignment list/progress | `/c27/online_courseware/course/classroom/{cid}/0/sku_list/`, schedule score detail |
| Task deadline | `/mooc-api/v1/lms/learn/leaf_info/{cid}/{leaf}/` |
| Self-study courseware | `/v2/api/web/logs/learn/{cid}` (type 2), merged with published score leaves and leaf details |
| Courseware reading | `/v2/api/web/cards/detlist/{cards_id}?classroom_id={cid}` and official page images |
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

The local preview uses Mozilla PDF.js (Apache-2.0) with a real two-page PDF for paging, zooming, and downloads. Run `npm ci` before `node scripts/preview-server.mjs`. Preview dependencies and fixtures stay outside the component ZIP. Images use compact thumbnails and open at full size on click.

Local 1.3.9 renews the session passively from response headers and persists the rotation across sync runs; see "登录续期" in the Chinese README. Local 1.3.8: first sign-in schedules one sync that survives navigation. The reader supports tap zoom, double-tap reset, pinch, swipe and portrait/landscape controls. Rotation keeps the page and zoom; closing restores the previous orientation. All 28 layouts in the real courseware response were checked, with page 19 visually verified in the browser. On-phone rotation and post-login sync remain unverified.

Back closes the top image or courseware viewer before leaving its detail sheet or component. Courseware prefers available originals and complete supported layouts while retaining signed and cropped URLs. Retrying a failed high-resolution page refreshes its courseware metadata instead of repeatedly using an expired URL; thumbnail-only pages remain explicitly identified.
