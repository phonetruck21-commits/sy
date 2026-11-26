# תיעוד API

תיעוד חי ואינטראקטיבי (OpenAPI/Swagger) זמין בשרת בכתובת **`/api/docs`**, וגם כ-JSON בכתובת `/api/docs/json`.

## אימות
- **משתמשי צוות:** `POST /api/auth/login` מחזיר `token` (סשן אטום, ‏256 ביט, ‏12 שעות כברירת מחדל, ניתן לביטול). שולחים אותו בכל בקשה: `Authorization: Bearer <token>`.
- **לקוח צופה:** `POST /api/view/session` עם הטוקן מהקישור (ו-PIN אם הוגדר) מחזיר `viewerToken` (JWT ל-15 דקות, תקף לנתיב שידור אחד בלבד).
- **הרשאות (RBAC):** `owner` (בעל העסק), `admin` (מנהל), `technician` (טכנאי).
- **שגיאות:** `{ "error": "<code>", "message": "<הודעה בעברית>" }`. קודים עיקריים: ‏400 קלט, ‏401 לא מחובר, ‏403 אין הרשאה, ‏404 לא נמצא (כולל משאב של עסק אחר), ‏409 מכסה או מצב, ‏410 קישור לא בתוקף, ‏412 חסרה הסכמת לקוח, ‏423 חשבון נעול, ‏429 יותר מדי בקשות.

## Endpoints

| שיטה | נתיב | הרשאה | תיאור |
|---|---|---|---|
| GET | `/api/health` | – | תקינות DB ושרת מדיה |
| GET | `/api/auth/bootstrap-status` | – | האם נדרשת הקמה ראשונית |
| POST | `/api/auth/signup` | – | פתיחת עסק ובעלים (הראשון תמיד, השאר רק אם `ALLOW_SIGNUP`) |
| POST | `/api/auth/login` | – | התחברות (10 בקשות לדקה, נעילה אחרי 5 כשלונות) |
| POST | `/api/auth/logout` | משתמש | ביטול הסשן |
| GET | `/api/auth/me` | משתמש | משתמש, עסק, חבילה |
| GET/POST | `/api/users` | צפייה: משתמש / הוספה: מנהל | ניהול משתמשים (במסגרת מכסת החבילה) |
| PATCH | `/api/users/:id` | מנהל | השבתה, תפקיד, איפוס סיסמה (מבטל את הסשנים) |
| PATCH | `/api/tenant` | מנהל | שם העסק, ימי שמירת מדיה |
| GET/PUT | `/api/job-statuses` | משתמש / מנהל | סטטוסים מותאמים לעסק |
| GET | `/api/audit-log` | מנהל | יומן פעולות |
| GET/PUT | `/api/workstations/:name` | משתמש | הגדרות עמדת עבודה |
| POST | `/api/cameras/report` · GET `/api/cameras` | משתמש | רישום וניטור מצלמות |
| GET/POST | `/api/customers` | משתמש | חיפוש (שם או טלפון מלא) ויצירה |
| GET | `/api/customers/:id/jobs` | משתמש | היסטוריית שירות |
| GET/POST | `/api/jobs` | משתמש | רשימה (`?open=true&mine=true&status=`) ופתיחת קריאה |
| GET/PATCH | `/api/jobs/:id` | משתמש | תיק עבודה מלא / עדכון פרטים, הערות, סיכום, חלקים |
| POST | `/api/jobs/:id/status` | משתמש | שינוי סטטוס (סטטוס סופי סוגר את השידור והקישורים) |
| POST | `/api/jobs/:id/consent` | משתמש | תיעוד או ביטול הסכמה |
| POST | `/api/jobs/:id/stream/start` | משתמש | אסימון WHIP (דורש הסכמה ועמידה במכסת השידורים) |
| POST | `/api/jobs/:id/stream/stop` | משתמש | עצירת שידור |
| GET | `/api/streams/active` | משתמש | שידורים פעילים: צופים ונפח תעבורה |
| POST | `/api/jobs/:id/share-links` | משתמש | קישור צפייה: `{expiresInMinutes, pin?, maxViewers}`. ה-URL מוחזר פעם אחת בלבד |
| POST | `/api/share-links/:id/revoke` | משתמש | ביטול קישור |
| POST | `/api/view/session` | טוקן קישור | פתיחת צפייה (30 בקשות לדקה, נעילה אחרי 5 קודים שגויים) |
| GET | `/api/view/status` | viewerToken | פרטי עבודה מצומצמים ומצב שידור |
| POST | `/api/stream/:path/whip` / `whep` | אסימון שידור/צפייה | איתות WebRTC (SDP), ‏proxy ל-MediaMTX |
| PATCH/DELETE | `/api/stream/:path/whip|whep/:session` | כנ"ל | ICE נוסף / סיום סשן |
| POST | `/api/jobs/:id/media?clientId=&capturedAt=` | משתמש | העלאת תמונה או וידאו (multipart, שדה `file`). חוזר על עצמו בבטחה לפי `clientId` |
| GET | `/api/media/:id/content` | משתמש (אותו עסק) | הורדת קובץ. **אין גישה ציבורית לקבצים** |
| DELETE | `/api/media/:id` | מנהל | מחיקת קובץ |
| POST | `/api/jobs/:id/uploads` | משתמש | פתיחת העלאה בחלקים `{mime, size, clientId}`; אותו clientId ממשיך העלאה קיימת |
| PUT | `/api/uploads/:id?offset=N` | משתמש | חלק של עד 8MB (`application/octet-stream`); offset שגוי מחזיר 409 עם `details.received` |
| GET | `/api/uploads/:id` | משתמש | מאיפה להמשיך |
| POST | `/api/uploads/:id/complete` | משתמש | סיום – הקובץ נוסף לתיק העבודה (חוזר על עצמו בבטחה) |
| DELETE | `/api/uploads/:id` | משתמש | ביטול העלאה |
| GET | `/api/reports/summary?from=YYYY-MM-DD&to=YYYY-MM-DD` | מנהל | דוח פעילות (עד 400 ימים, שעון ישראל) |
| GET | `/api/usage` | משתמש | ניצול מכסות והתראות (מעל 80%) |

`/internal/mediamtx/auth` הוא hook פנימי של שרת המדיה. Caddy חוסם אותו מבחוץ, והוא מוגן בנוסף בסוד משותף.

## דוגמה: מסלול מלא עם curl
```bash
B=https://live.example.co.il
T=$(curl -s $B/api/auth/login -H 'content-type: application/json' -d '{"email":"me@x.co.il","password":"..."}' | jq -r .token)
JOB=$(curl -s $B/api/jobs -H "authorization: Bearer $T" -H 'content-type: application/json' \
  -d '{"deviceType":"iPhone 13","issueDescription":"מסך","consentStreaming":true,"consentRecording":true,"consentMethod":"טופס"}' | jq -r .id)
curl -s $B/api/jobs/$JOB/share-links -H "authorization: Bearer $T" -H 'content-type: application/json' -d '{"expiresInMinutes":240,"pin":"1234"}'
```

## חיבור עתידי ל-S.Y CRM (תכנון, לא מומש)
ה-API הקיים כבר מכסה את רוב הצרכים. לשלב 3 מתוכננים:
1. **מפתחות API לאינטגרציה** (`integration` role, ‏scopes: `jobs:write`, `jobs:read`, `links:create`), במקום סשן משתמש.
2. **Webhooks יוצאים** (חתומים ב-HMAC-SHA256): `job.created`, `job.status_changed`, `job.closed`, `media.uploaded`, `stream.started`.
3. **מיפוי מזהים חיצוניים:** שדה `external_ref` לעבודות וללקוחות (`crm_ticket_id`), עם endpoint `GET /api/jobs/by-ref/:ref`.
4. **"שליחת הודעה בסיום תיקון":** ה-CRM מאזין ל-`job.status_changed` ושולח SMS/WhatsApp דרך הספק שלו. המערכת לא שולחת הודעות בעצמה.

**שום שינוי לא יבוצע במערכת ה-CRM הקיימת בלי אישורכם המפורש.** הצד שלנו יוגדר כ-API שה-CRM קורא לו, ולא להפך.
