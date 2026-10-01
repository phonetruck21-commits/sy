# Technician-USB-Toolkit

ערכת הדיסק שכבר מסודרת לפי קטגוריות. הסקריפט מוריד את התוכנות מהאתרים הרשמיים ומניח אותן בתיקייה `Technician-USB-Toolkit`. קבצי ההתקנה לא נשמרים בגיט.

צריך Windows וכונן של 128GB. פרופיל `full` שוקל בערך 8GB. פרופיל `all` מוסיף גם את Ubuntu, בערך 6GB נוספים.

## הרצה

מתוך התיקייה הזו, ב-PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File .\Build-TechDisk.ps1 -Destination D:\Technician-USB-Toolkit -Profile full
```

ערכה קטנה יותר, בלי ה-ISO הכבדים:

```powershell
powershell -ExecutionPolicy Bypass -File .\Build-TechDisk.ps1 -Destination D:\Technician-USB-Toolkit -Profile core
```

כולל Ubuntu:

```powershell
powershell -ExecutionPolicy Bypass -File .\Build-TechDisk.ps1 -Destination D:\Technician-USB-Toolkit -Profile all
```

בדיקה שהקישורים נפתחים, בלי להוריד:

```powershell
powershell -ExecutionPolicy Bypass -File .\Build-TechDisk.ps1 -Profile full -Check
```

אפשר להריץ גם עם Python 3:

```bash
python3 build_tech_disk.py --dest Technician-USB-Toolkit --profile full
```

## מה נוצר

```text
Technician-USB-Toolkit/
  ISO/            קבצי אתחול, Ventoy מוצא אותם לבד
  Portable/       תוכנות ל-Windows שעולה
  Links/          קיצורי דרך לכלים שמורידים ידנית
  START-HERE.txt  סדר העבודה
```

## קטגוריות

| תיקייה | תוכן | יורד אוטומטית |
|---|---|---|
| `01-Boot` | תשתית אתחול | Ventoy, Rufus, ובפרופיל המלא גם balenaEtcher |
| `02-Rescue` | סביבות הצלה | Hiren's BootCD PE, SystemRescue |
| `03-Installers` | התקנת מערכת | Fido ל-ISO של Windows. Ubuntu רק בפרופיל `all` |
| `04-Diagnostics` | אבחון חומרה | MemTest86+, CPU-Z, Prime95, BlueScreenView |
| `05-Disk-Health` | בריאות דיסק | CrystalDiskInfo, CrystalDiskMark, HDDScan, GSmartControl |
| `06-Imaging` | גיבוי ושיבוט | Clonezilla, Rescuezilla |
| `07-Recovery` | שחזור קבצים | TestDisk ו-PhotoRec, Recuva |
| `08-Partitions` | מחיצות | GParted Live |
| `09-Boot-Repair` | תיקון אתחול | Dism++ |
| `10-Malware` | נוזקות | AdwCleaner, Emsisoft Emergency Kit |
| `11-Network` | רשת | Angry IP Scanner, PuTTY, WinSCP, mRemoteNG, RustDesk, Wireshark |
| `12-Drivers` | דרייברים | Snappy Driver Installer Origin, DriverStore Explorer |
| `13-Secure-Erase` | מחיקה מאובטחת | ShredOS, VeraCrypt |
| `14-Portable` | כלים ניידים | 7-Zip, Notepad++, SumatraPDF, Everything, Geek Uninstaller, BleachBit, WinDirStat, Sysinternals, ShareX, VLC, Firefox בעברית |

בתיקיית `Links` יש קיצורי דרך לכלים שהאתר שלהם לא נותן הורדה אוטומטית: HWiNFO, GPU-Z, Medicat, Kaspersky Rescue Disk, DMDE, Macrium, כלי יצרן של Dell / HP / Lenovo / Samsung / WD, וחבילות הדרייברים של SDIO.

## אחרי ההורדה

1. פותחים את `Portable/01-Boot/ventoy` ומריצים את `Ventoy2Disk.exe` כמנהל.
2. בוחרים את הכונן הנשלף ומתקינים.
3. מעתיקים אל המחיצה הגדולה את `ISO`, `Portable`, `Links` ואת `START-HERE.txt`.
4. ISO של Windows מורידים עם Fido מתוך `Portable/03-Installers`.

לפני עבודה על דיסק של לקוח בודקים אם BitLocker דלוק ומבקשים את מפתח השחזור. איפוס סיסמה מקומית, דרך הקישור של Lazesoft, הוא רק למחשב שקיבלת אישור לטפל בו.
