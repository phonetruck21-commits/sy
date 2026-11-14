# ארכיטקטורה – S.Y LIVE SERVICE

## תמונה כללית

```
 עמדת טכנאי (Windows)                      שרת (Dell R220 / ענן)                         לקוח (טלפון/מחשב)
┌──────────────────────────┐         ┌──────────────────────────────────────┐        ┌──────────────────────┐
│ Tauri (WebView2) / Edge  │  HTTPS  │ Caddy :443 (TLS, Let's Encrypt)       │ HTTPS  │ דפדפן – ללא התקנה     │
│ ┌──────────────────────┐ │────────▶│   └▶ API (Fastify) :8080 ──┐          │◀───────│ /v/<token> + PIN      │
│ │ React: עמדת טכנאי     │ │ WHIP    │        │  PostgreSQL       │ auth hook│  WHEP  │ נגן WebRTC            │
│ │ getUserMedia (UVC)    │ │ (proxy) │        ▼                   │          │ (proxy)│                      │
│ │ MediaRecorder → דיסק  │ │         │   MediaMTX (WebRTC relay) ◀┘          │        │                      │
│ └──────────────────────┘ │  SRTP   │     :8189 UDP/TCP ───────────────────────────▶ │ SRTP (מוצפן)          │
│  מצלמת USB (EMEET PIXY)   │────────▶│                                      │        │                      │
└──────────────────────────┘ יוצא בלבד└──────────────────────────────────────┘        └──────────────────────┘
```

### זרימת השידור
1. הטכנאי פותח עבודה ומתעד **הסכמת לקוח**. ללא הסכמה השרת מסרב לשדר (HTTP 412).
2. "התחל שידור" ← `POST /api/jobs/:id/stream/start` מחזיר **אסימון פרסום** (JWT, 15 דק') שתקף **לנתיב אחד בלבד** (`j_<128 bit אקראי>`).
3. הדפדפן יוצר הצעת WebRTC ושולח אותה ב-**WHIP** ל-`/api/stream/<path>/whip`. ה-API בודק את האסימון וכללי העסק ומעביר ל-MediaMTX.
4. MediaMTX פונה שוב ל-API (`/internal/mediamtx/auth`) לאימות כפול, ומקבל את המדיה ב-SRTP מוצפן.
5. הטכנאי יוצר **קישור צפייה אישי**: 256 ביט אקראיים, נשמר בשרת רק כ-hash, עם תוקף, PIN אופציונלי, מגבלת צופים וביטול מיידי.
6. הלקוח פותח את הקישור ← `POST /api/view/session` ← מקבל **אסימון צפייה** קצר (15 דק', מתחדש אוטומטית) ← מנגן ב-**WHEP**.
7. סגירת עבודה, ביטול הסכמה או ביטול קישור מנתקים את השידור ומונעים חיבור מחדש.

**אין צורך לפתוח פורטים ברשת העסק.** עמדת הטכנאי יוזמת רק חיבורים יוצאים (HTTPS + ‏WebRTC אל השרת).

## בחירת טכנולוגיות ונימוקים

| החלטה | בחירה | נימוק |
|---|---|---|
| פרוטוקול שידור | **WebRTC** (WHIP/WHEP) | השהיה של פחות משנייה, מוצפן תמיד (DTLS-SRTP), נתמך בכל דפדפן כולל iPhone, בלי תוסף. HLS נפסל בגלל השהיה של 3 עד 10 שניות. |
| שרת מדיה | **MediaMTX** | בינארי Go יחיד, תומך WHIP/WHEP, אימות HTTP חיצוני, ‏API לניטור, ובהמשך RTSP/ONVIF למצלמות IP. Janus/mediasoup נפסלו כמורכבים מדי לפיילוט. |
| קידוד | **ללא קידוד מחדש בשרת** | השרת רק מעביר חבילות (SFU), כך שה-CPU של ה-R220 כמעט לא נדרש. הדחיסה נעשית במחשב הטכנאי. קידוד מחדש של 4K לכמה מצלמות אינו ריאלי על E3-1220 v3. |
| FFmpeg | **לא בשימוש ב-MVP** | אין הצדקה הנדסית כרגע. ייכנס בהמשך לייצור תצוגות מקדימות, ל-AI ולמצלמות IP. |
| STUN/TURN | **אופציונלי** (coturn ב-profile) | לשרת יש כתובת ציבורית ו-MediaMTX מאזין ל-ICE ב-UDP וגם ב-TCP ‏(8189), כך שרוב הרשתות יעבדו בלי TURN. ‏TURN מיועד לרשתות סלולר/ארגוניות קשוחות במיוחד. |
| WebSocket | **לא נדרש** | האיתות נעשה ב-HTTP (WHIP/WHEP). עדכוני סטטוס לצופה נעשים ב-polling כל 5 שניות, שזה פשוט ועמיד. |
| Backend | **Node.js + Fastify + TypeScript** | שפה אחת לכל המערכת (שרת ולקוח), טיפוסים משותפים, ביצועים טובים, ‏OpenAPI מובנה. |
| מסד נתונים | **PostgreSQL 16** | migrations ב-SQL נקי (`server/migrations`), ‏`tenant_id` בכל טבלה. |
| Desktop | **Tauri v2** | קטן בהרבה מ-Electron (כ-10MB מול 150MB), משתמש ב-WebView2 של Windows, ‏Rust לכתיבה בטוחה לדיסק. אותו קוד UI רץ גם ב-Chrome/Edge. |
| UI | React + Tailwind | רכיבים בסגנון shadcn/ui נכתבו ידנית (`web/src/components/ui.tsx`) בלי תלות ב-Radix, כדי לשמור על חבילה קטנה. |
| HTTPS | **Caddy** | תעודות Let's Encrypt אוטומטיות, הגדרה של כמה שורות. |
| אחסון קבצים | דיסק מקומי מאחורי ממשק `MediaStorage` | מימוש S3 (MinIO/Wasabi/AWS) יתווסף בלי לשנות את ה-routes. |

## מבנה תיקיות

```
server/
  migrations/001_init.sql   סכמת DB (tenants, users, sessions, customers, jobs, share_links, media, audit_log...)
  src/app.ts                הרכבת השרת: אבטחה (helmet, CORS, rate-limit), Swagger, שגיאות, הגשת ה-UI
  src/auth.ts               סשנים אטומים (hash בלבד ב-DB), RBAC
  src/routes/               auth, admin (משתמשים/הגדרות/מצלמות), jobs (לקוחות/עבודות), stream (שידור/קישורים/proxy/hook), media
  src/services/             tenants, storage (דיסק/S3), retention (מחיקה אוטומטית)
  src/lib/                  crypto (scrypt, AES-GCM, blind index), streamTokens (JWT לנתיב), mediamtx (API client), audit
  src/cli/                  migrate, create-owner, seed:demo
  test/                     בדיקות API מול Postgres אמיתי
web/src/
  lib/camera.ts             זיהוי מצלמות/מיקרופונים, רזולוציות, בקרות UVC שהמכשיר מדווח
  lib/webrtc.ts             WhipPublisher / WhepPlayer עם חיבור מחדש אוטומטי
  lib/recorder.ts           הקלטה מקומית (דיסק בדסקטופ, IndexedDB בדפדפן)
  lib/storage.ts            תור סנכרון לא-מקוון (IndexedDB)
  pages/TechConsole.tsx     עמדת הטכנאי
  pages/Viewer.tsx          צפיית לקוח
  pages/Jobs.tsx, JobDetail.tsx, Admin.tsx
desktop/src-tauri/          מעטפת Windows (Rust): כתיבת הקלטות לדיסק, פתיחת תיקייה, פרטי מחשב
deploy/                     mediamtx.yml, Caddyfile, backup.sh
e2e/                        בדיקת Playwright מקצה לקצה
```

## מודל נתונים – הפרדת עסקים
- כל טבלה עסקית כוללת `tenant_id`. כל שאילתה ב-API מסוננת לפי ה-tenant של המשתמש המחובר. **אין אף endpoint שמקבל tenant מהלקוח.**
- מזהי עבודה הם UUID. מספר הקריאה (`job_number`) מוצג למשתמש בלבד ואינו משמש לאימות.
- נתיב השידור אקראי, אינו נגזר ממספר העבודה ואינו מוחזר באף API ניהולי.
- בדיקות אוטומטיות מוודאות שעסק B לא יכול לקרוא, לעדכן, לשדר או לשתף נתונים של עסק A (`server/test/api.test.ts`).
- שלב הבא: Row-Level Security ב-PostgreSQL כשכבת הגנה נוספת.
