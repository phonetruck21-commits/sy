# SY Antivirus 🛡️

אנטי-וירוס קל משקל שנכתב ב-Python, ללא תלויות חיצוניות. עובד על Windows, macOS ו-Linux.

## יכולות

| רכיב | מה הוא עושה |
|------|-------------|
| **זיהוי לפי חתימות hash** | משווה SHA-256 / MD5 של כל קובץ למאגר של קבצים זדוניים ידועים |
| **זיהוי לפי תבניות (patterns)** | מחפש רצפי בתים מוכרים בתוך הקובץ (webshells, Mirai, WannaCry, EICAR ועוד) |
| **ניתוח היוריסטי** | מזהה קבצים חשודים גם בלי חתימה: סיומת כפולה (`invoice.pdf.exe`), קובץ הרצה שמתחפש לתמונה, אנטרופיה גבוהה (packer), פקודות PowerShell מוצפנות, מחיקת shadow copies, טקסט של כופר, reverse shell, כורי מטבעות ועוד. כל ממצא מקבל ניקוד, ומעל סף מסוים הקובץ מסומן |
| **סריקת ארכיונים** | נכנס לתוך קובצי ZIP (כולל ZIP בתוך ZIP) |
| **הסגר (Quarantine)** | מעביר קבצים נגועים לתיקייה מבודדת בצורה מוצפנת (XOR) כך שלא ניתן להריץ אותם. אפשר לשחזר או למחוק לצמיתות |
| **הגנה בזמן אמת** | מנטר תיקיות (למשל "הורדות") וסורק כל קובץ חדש או שהשתנה |
| **ממשק גרפי** | חלון עם לשוניות: סריקה, הגנה בזמן אמת, הסגר |
| **ממשק שורת פקודה** | לסקריפטים, תזמון ואוטומציה (כולל פלט JSON) |

> 📱 **יש גם גרסה לאנדרואיד** - ראה [אפליקציית אנדרואיד](#אפליקציית-אנדרואיד) למטה.

## התקנה

```bash
pip install .
```

או בלי התקנה: `python -m sy_antivirus ...`

## שימוש

### ממשק גרפי
```bash
sy-av gui
```
> ב-Linux ייתכן שצריך להתקין קודם את Tkinter: `sudo apt install python3-tk`

### סריקה
```bash
sy-av scan ~/Downloads                  # דוח בלבד
sy-av scan ~/Downloads -a quarantine    # העברת איומים להסגר
sy-av scan / -x /mnt/backup --max-size 50 -v
sy-av scan file.exe --json              # פלט JSON
```
קוד יציאה: `0` = נקי, `1` = נמצאו איומים, `2` = שגיאה.

פעולות אפשריות ל-`-a`: `report` (ברירת מחדל), `quarantine`, `quarantine-high` (רק איומים ודאיים), `delete`.

### הגנה בזמן אמת
```bash
sy-av monitor ~/Downloads ~/Desktop -a quarantine
```

### ניהול הסגר
```bash
sy-av quarantine list
sy-av quarantine restore <id>     # מספיקים כמה תווים ראשונים של המזהה
sy-av quarantine delete <id>
```

### ניהול מאגר החתימות
```bash
sy-av db info
sy-av db add-file sample.exe "Trojan.MySample"      # הוספת hash של קובץ
sy-av db add-hash <sha256> "Trojan.Name"
sy-av db add-pattern "Backdoor.X" "EVIL_MARKER_[0-9]+"
sy-av db import hashes.txt --name "MalwareBazaar"   # קובץ טקסט: hash בכל שורה
```
אפשר לייבא רשימות hash ציבוריות (למשל מ-[MalwareBazaar](https://bazaar.abuse.ch/export/)) כדי להגדיל את המאגר משמעותית.

## בדיקה שהאנטי-וירוס עובד

[קובץ הבדיקה EICAR](https://www.eicar.org/download-anti-malware-testfile/) הוא קובץ תמים שכל אנטי-וירוס מזהה כ"וירוס" לצורך בדיקה:

```bash
printf '%s%s' 'X5O!P%@AP[4\PZX54(P^)7CC)7}$' 'EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*' > /tmp/eicar.com
sy-av scan /tmp/eicar.com
# INFECTED  /tmp/eicar.com
#     -> EICAR-Test-File [hash, high]
```

## בדיקות

```bash
python -m unittest -v
```

## מבנה הפרויקט

```
sy_antivirus/
├── scanner.py        # מנוע הסריקה (hash, patterns, היוריסטיקה, ZIP)
├── signatures.py     # טעינה ושמירה של מאגר החתימות
├── heuristics.py     # כללי הזיהוי ההיוריסטיים
├── quarantine.py     # הסגר: העברה, שחזור, מחיקה
├── monitor.py        # הגנה בזמן אמת
├── cli.py            # שורת פקודה
├── gui.py            # ממשק גרפי (Tkinter)
└── data/signatures.json
```

## אפליקציית אנדרואיד

התיקייה `android/` מכילה את **SY Security**, אפליקציית אנדרואיד (Kotlin + Jetpack Compose) עם ממשק בעברית:

| לשונית | מה היא עושה |
|--------|-------------|
| **בית** | לוח בקרה: כפתור סריקה עגול, סטטיסטיקות, באנר טיפים מתחלף, אריחי כלים ובאנר פרסומת |
| **אפליקציות** | כל אפליקציה מקבלת דירוג: תקינה / סיכון נמוך / חשודה / נוזקה, עם הסבר למה. כפתור להסרה |
| **קבצים** | סריקת תיקייה שבוחרים (הורדות, WhatsApp...) כולל בתוך ZIP ו-APK, והעברה להסגר |
| **הסגר** | שחזור או מחיקה לצמיתות של קבצים שהועברו להסגר |

**איך מזוהות אפליקציות זדוניות:**
- **חתימות**: hash של קובץ ה-APK, שם החבילה ותעודת החתימה של המפתח מושווים למאגר.
- **ניתוח הרשאות**: שילובים שאופייניים לנוזקות מקבלים ניקוד גבוה. למשל נגישות + SMS (טרויאני בנקאות), נגישות + חלון צף (גניבת סיסמאות), אפליקציה מוסתרת ללא אייקון, או התקנה ממקור לא רשמי. אפליקציות מערכת לא נחשדות.
- **הגנה ברקע**: כל 15 דקות האפליקציה שואלת את אנדרואיד אילו אפליקציות הותקנו או עודכנו, סורקת רק אותן ושולחת התראה אם משהו חשוד.

### איך מתקינים בטלפון
1. בלשונית **Actions** במאגר ב-GitHub, פתח את הריצה האחרונה של **Build** והורד את `sy-antivirus-apk`.
2. חלץ את הקובץ `app-debug.apk` מה-ZIP והעבר אותו לטלפון.
3. פתח אותו בטלפון ואשר "התקנה ממקורות לא ידועים".

### פרסומות (AdMob)
ברירת המחדל היא מזהי **הבדיקה** של Google: מוצגות פרסומות לדוגמה ואין הכנסה. כדי להרוויח:
1. פתח חשבון ב-[AdMob](https://admob.google.com), הוסף אפליקציה וצור יחידת מודעות מסוג Banner.
2. הוסף ל-`~/.gradle/gradle.properties` (או כ-Secrets ב-GitHub):
   ```
   admobAppId=ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY
   admobBannerId=ca-app-pub-XXXXXXXXXXXXXXXX/ZZZZZZZZZZ
   ```
3. אל תלחץ על הפרסומות שלך בעצמך. Google חוסמת חשבונות על זה.

### בנייה עצמית
```bash
cd android
./gradlew :engine:test          # בדיקות המנוע
./gradlew :app:assembleDebug    # ה-APK ייווצר ב-app/build/outputs/apk/debug/
```
דורש JDK 17 ו-Android SDK (או פשוט לפתוח את התיקייה `android` ב-Android Studio).

## מגבלות חשובות

זהו פרויקט לימודי/אישי ואינו תחליף לאנטי-וירוס מסחרי (כמו Windows Defender):
- מאגר החתימות קטן — כדאי לייבא רשימות hash ציבוריות.
- ההגנה בזמן אמת מבוססת polling (בדיקה כל 2 שניות) ולא על driver ברמת מערכת ההפעלה, כך שהיא לא חוסמת קובץ *לפני* שהוא רץ.
- אין ניתוח התנהגותי של תהליכים רצים ואין emulation.
- באנדרואיד: אפליקציה רגילה לא יכולה למחוק אפליקציות אחרות בעצמה (רק לפתוח את חלון ההסרה), ולא יכולה לסרוק את התיקיות הפרטיות של אפליקציות אחרות.
