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

## מגבלות חשובות

זהו פרויקט לימודי/אישי ואינו תחליף לאנטי-וירוס מסחרי (כמו Windows Defender):
- מאגר החתימות קטן — כדאי לייבא רשימות hash ציבוריות.
- ההגנה בזמן אמת מבוססת polling (בדיקה כל 2 שניות) ולא על driver ברמת מערכת ההפעלה, כך שהיא לא חוסמת קובץ *לפני* שהוא רץ.
- אין ניתוח התנהגותי של תהליכים רצים ואין emulation.
