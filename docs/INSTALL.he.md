# הוראות התקנה והפעלה

## 1. דרישות

| רכיב | גרסה |
|---|---|
| Node.js | 22 LTS (לפחות 20) |
| PostgreSQL | 16 (בפריסת Docker מגיע אוטומטית) |
| MediaMTX | 1.21.x ‏([הורדה](https://github.com/bluenviron/mediamtx/releases), או אוטומטית ב-Docker) |
| Docker + Compose | לפריסה על שרת |
| Rust (stable) + Visual Studio Build Tools | רק לבניית תוכנת ה-Windows |

---

## 2. סביבת פיתוח מקומית (Windows/Linux/Mac)

```bash
git clone <repo> sy && cd sy
npm ci

# מסד נתונים (פעם אחת)
psql -U postgres -c "CREATE ROLE sylive LOGIN PASSWORD 'sylive_dev' CREATEDB;"
createdb -U postgres -O sylive sylive
createdb -U postgres -O sylive sylive_test      # לבדיקות

cp server/.env.example server/.env
npm run build -w web                            # בניית הממשק
npm run migrate -w server

# חלון 1 – שרת המדיה
mediamtx deploy/mediamtx.local.yml
# חלון 2 – ה-API (מגיש גם את הממשק)
npm run dev -w server                          # קורא את server/.env
```

פתחו את `http://localhost:8080`. בכניסה הראשונה נפתח מסך **"הקמה ראשונית"** שבו יוצרים את העסק ואת משתמש הבעלים.

> **חשוב:** דפדפנים מאפשרים גישה למצלמה רק ב-`https://` או ב-`localhost`. כדי לבדוק מטלפון ברשת המקומית צריך HTTPS (ראו סעיף 3), או להשתמש בתוכנת הדסקטופ.

נתוני דוגמה (מסומנים "[דוגמה]"): `npm run seed:demo -w server`. התחברות: `demo@sy-live.local` / `DemoPass-2026`. **אין להפעיל בייצור.**

פיתוח ממשק עם רענון חם: `npm run dev -w web` (פורט 5173, עם proxy ל-API).

---

## 3. פריסת פיילוט על Dell PowerEdge R220 (Ubuntu Server 24.04 + Docker)

### 3.1 הכנות רשת (בצד השרת בלבד, לא בעמדות הטכנאים)
1. כתובת DNS (למשל `live.your-business.co.il`) שמצביעה ל-IP הציבורי של השרת.
2. העברת פורטים בנתב אל השרת:
   - `443/TCP` ו-`80/TCP` (HTTPS ותעודת Let's Encrypt)
   - `8189/UDP` ו-`8189/TCP` (מדיה של WebRTC)
3. בחומת האש של השרת: `sudo ufw allow 80,443/tcp && sudo ufw allow 8189`.

### 3.2 התקנה
```bash
sudo apt install -y docker.io docker-compose-v2 git
git clone <repo> /opt/sy-live && cd /opt/sy-live
cp .env.example .env
# מלאו ב-.env: SY_DOMAIN, ACME_EMAIL, ושלושה סודות. יצירת כל סוד:
openssl rand -base64 48
nano .env
docker compose up -d --build
docker compose ps                 # כל השירותים במצב running/healthy
docker compose logs -f api        # לוגים (JSON)
```
גלשו ל-`https://SY_DOMAIN`, צרו את העסק והוסיפו טכנאים במסך **ניהול**.

### 3.3 יצירת בעלים משורת הפקודה (חלופה למסך ההקמה)
```bash
docker compose exec -e SY_OWNER_PASSWORD='סיסמה-חזקה-כאן' api \
  node dist/cli/createOwner.js --business "שם העסק" --slug my-lab --email me@example.co.il --name "שם מלא"
```
הסיסמה מועברת במשתנה סביבה ולא כארגומנט, כדי שלא תישמר בהיסטוריית הפקודות.

### 3.4 גיבויים
```bash
./deploy/backup.sh /mnt/backup/sy-live     # dump של DB + ארכיון קבצי מדיה, שמירה ל-14 יום
```
מומלץ להריץ מ-cron מדי לילה, לשמור את הגיבוי על דיסק או מחשב אחר, ולבדוק שחזור אחת לחודש (הוראות שחזור בסוף הסקריפט).

### 3.5 עדכון גרסה
```bash
git pull && docker compose up -d --build   # migrations רצות אוטומטית בעליית השרת
```

---

## 4. תוכנת הטכנאי ל-Windows 10/11

### 4.1 שימוש בלי התקנה (הכי מהיר לבדיקה)
פותחים ב-**Chrome או Edge** את `https://SY_DOMAIN/tech`. כל יכולות העמדה עובדות בדפדפן. ההבדל היחיד: הקלטות נשמרות לתיקיית ההורדות ולא נכתבות ברציפות לדיסק.

### 4.2 בניית קובץ התקנה (exe/msi)
**אפשרות א' – GitHub Actions (לא צריך להתקין כלים):** ב-GitHub נכנסים ל-Actions ← **Windows desktop installer** ← Run workflow. בסיום מורידים את ה-artifact, שמכיל קובץ `SY Live Service_0.1.0_x64-setup.exe` וקובץ `.msi`.

**אפשרות ב' – על מחשב Windows:**
1. מתקינים [Rust](https://rustup.rs), ‏[Node.js 22](https://nodejs.org) ו-Visual Studio Build Tools (רכיב "Desktop development with C++").
2. מריצים:
```powershell
npm ci
npm run build -w desktop
```
3. הקבצים נוצרים ב-`desktop\src-tauri\target\release\bundle\nsis\` וב-`...\msi\`.

> קובץ ההתקנה אינו חתום דיגיטלית, ולכן Windows SmartScreen יציג אזהרה. להפצה מסחרית נדרשת תעודת Code Signing.

### 4.3 הפעלה ראשונה
1. במסך הכניסה מזינים את **כתובת השרת** (למשל `https://live.your-business.co.il`), דוא"ל וסיסמה.
2. מאשרים גישה למצלמה ולמיקרופון.
3. בכרטיס **מצלמה ועמדת עבודה** בוחרים מצלמה, רזולוציה, קצב פריימים, איכות שידור ומיקרופון, ונותנים שם לעמדה. "שמור" שומר את ההגדרות גם בשרת.
4. הקלטות נשמרות בתיקייה `וידאו\SY Live Service`.

### 4.4 EMEET PIXY 4K – מה לבדוק בפועל
- לסגור את EMEET Studio ותוכנות וידאו אחרות לפני הפתיחה (ב-Windows רק תוכנה אחת יכולה להשתמש במצלמה בכל רגע).
- לוודא שהמצלמה מופיעה ברשימה ושהשורה "בפועל מהמצלמה" מציגה את הרזולוציה שנבחרה.
- לפתוח את "בקרות מצלמה נתמכות" ולבדוק אילו בקרות (זום/פוקוס/Pan/Tilt) Windows מדווח. מוצגות רק בקרות שהמכשיר מדווח בפועל.
- **PTZ (מנועי הכיוון):** בפתיחת המצלמה הדפדפן או התוכנה יבקשו הרשאה "להזיז את המצלמה". יש לאשר. אם המצלמה מדווחת על Pan/Tilt/Zoom, תופיע בכרטיס המצלמה **לוחית חיצים** (🕹️) לשליטה בכיוון ובזום. אם הלוחית לא מופיעה, המצלמה לא חושפת PTZ דרך Windows, והשליטה אפשרית רק דרך EMEET Studio.
- לפני שליטה ידנית מומלץ לכבות את מעקב ה-AI ב-EMEET Studio, אחרת המצלמה "תתווכח" עם הפקודות.
- מעקב AI, מחוות והחלפת עדשות נשלטים ב-EMEET Studio. המערכת לא שולטת בהם.

---

## 5. איך לבדוק בעצמכם את המסלול המלא
1. בעמדת הטכנאי: **🔧 פתח עבודה חדשה** ← ממלאים מכשיר ותקלה ← מסמנים את שתי ההסכמות ← "פתח עבודה".
2. **🔴 התחל שידור** ← הסטטוס משתנה ל"משדר בשידור חי" ומופיע תג LIVE.
3. בכרטיס **קישור צפייה ללקוח**: בוחרים תוקף, ואופציונלית קוד אימות ← "צור קישור".
4. סורקים את ה-QR בטלפון (בסלולר, לא ב-Wi-Fi של העסק, כדי לבדוק גישה מבחוץ) ← מזינים את הקוד ← השידור מתחיל.
5. בודקים: מסך מלא, הפעלת קול, מונה "צופים" בעמדה, ניתוק רשת בטלפון וחזרה (חיבור מחדש אוטומטי).
6. **⏹️ עצור שידור** ← בטלפון מופיע "השידור אינו פעיל כרגע".
7. **✅ סיים תיקון** ← בוחרים "נסגר" ← הקישור בטלפון נחסם.

### בדיקות אוטומטיות
```bash
npm test                                   # API (דורש DB בשם sylive_test)
# מקצה לקצה – כשהשרת ו-MediaMTX רצים:
E2E_BASE_URL=http://127.0.0.1:8080 npm run test:e2e
# מבחן עומס צופים לשרת (ראו docs/SERVER_SIZING.he.md):
node e2e/load/viewers.mjs <קישור-צפייה> <PIN> <מספר-צופים>
```

## 6. לוגים ותקלות נפוצות
| תסמין | בדיקה |
|---|---|
| "אין גישה למצלמה" | הדף חייב לרוץ ב-HTTPS או ב-localhost. בדקו בהגדרות Windows ← פרטיות ← מצלמה. |
| "המצלמה בשימוש" | סגרו את EMEET Studio, Zoom, Teams וכדומה. |
| השידור נתקע ב"מתחבר…" | פורט 8189 UDP/TCP לא פתוח לשרת, או ש-`PUBLIC_HOST` שגוי. בדקו `docker compose logs mediamtx`. |
| הלקוח רואה "השידור אינו פעיל" | הטכנאי לא משדר, או שהגיעו למכסת הצופים. |
| שגיאת 412 | לא תועדה הסכמת לקוח. |
לוגים: `docker compose logs api` (JSON מובנה, ללא סיסמאות או אסימונים) ו-`docker compose logs mediamtx`. יומן פעולות עסקי נמצא במסך ניהול ← יומן פעולות.
