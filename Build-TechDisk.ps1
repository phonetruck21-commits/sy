# Build a categorized technician USB folder from official downloads.
#Requires -Version 5.1
param(
    [string]$Destination,
    [ValidateSet('core', 'full', 'all')]
    [string]$Profile = 'full',
    [string]$Only = '',
    [switch]$Check,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $Destination) {
    $Destination = Join-Path $Root 'TechDisk'
}
$Destination = [IO.Path]::GetFullPath($Destination)
$ManifestPath = Join-Path $Root 'manifest.json'
$Pause = $PSBoundParameters.Count -eq 0

function Get-Text([string]$Url) {
    $client = New-Object System.Net.WebClient
    $client.Encoding = [Text.Encoding]::UTF8
    $client.Headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
    try {
        return $client.DownloadString($Url)
    } finally {
        $client.Dispose()
    }
}

function Get-FileNameFromUrl([string]$Url, [string]$Fallback) {
    $path = ($Url -split '\?')[0].TrimEnd('/')
    $name = [Uri]::UnescapeDataString(($path -split '/')[-1])
    if (-not $name -or $name -notmatch '\.') { return $Fallback }
    return $name
}

function Resolve-Tool($Tool) {
    if ($Tool.kind -eq 'url') {
        $name = $Tool.filename
        if (-not $name) { $name = Get-FileNameFromUrl $Tool.url $Tool.id }
        return @{ Url = $Tool.url; Name = $name }
    }
    if ($Tool.kind -eq 'github') {
        $api = "https://api.github.com/repos/$($Tool.repo)/releases/latest"
        $release = Get-Text $api | ConvertFrom-Json
        $matches = @($release.assets | Where-Object { $_.name -match $Tool.asset_regex })
        if ($matches.Count -eq 0) { throw "no asset matched $($Tool.asset_regex)" }
        $asset = $matches | Sort-Object name | Select-Object -Last 1
        return @{ Url = $asset.browser_download_url; Name = $asset.name }
    }
    if ($Tool.kind -eq 'page') {
        $html = Get-Text $Tool.page
        $found = @([regex]::Matches($html, $Tool.match) | ForEach-Object { $_.Value } | Sort-Object -Unique)
        $found = @($found | Where-Object { $_ -notmatch '\.(zsync|torrent|md5|sha256)$' })
        if ($found.Count -eq 0) { throw "no link matched $($Tool.match)" }
        $name = ($found | Sort-Object | Select-Object -Last 1)
        if ($Tool.url_template) {
            $url = $Tool.url_template.Replace('{name}', $name)
        } elseif ($name -like 'http*') {
            $url = $name
        } else {
            $base = $Tool.base
            if (-not $base) { $base = $Tool.page }
            if (-not $base.EndsWith('/')) { $base += '/' }
            $url = $base + $name
        }
        if ($Tool.follow) {
            $page = Get-Text $url
            $followed = @([regex]::Matches($page, $Tool.follow) | ForEach-Object { $_.Value } | Sort-Object -Unique)
            if ($followed.Count -eq 0) { throw 'follow link not found' }
            $url = ($followed | Sort-Object | Select-Object -Last 1)
        }
        $filename = $Tool.filename
        if (-not $filename) { $filename = Get-FileNameFromUrl $url $Tool.id }
        return @{ Url = $url; Name = $filename }
    }
    throw "unknown kind $($Tool.kind)"
}

function Read-Head([string]$Url) {
    $request = [Net.HttpWebRequest]::Create($Url)
    $request.UserAgent = 'Wget/1.21.4'
    $request.AddRange(0, 15)
    $request.Timeout = 60000
    $request.ReadWriteTimeout = 60000
    $response = $request.GetResponse()
    try {
        $stream = $response.GetResponseStream()
        $buffer = New-Object byte[] 16
        $read = 0
        while ($read -lt 16) {
            $count = $stream.Read($buffer, $read, 16 - $read)
            if ($count -le 0) { break }
            $read += $count
        }
        $stream.Close()
        return $buffer
    } finally {
        $response.Close()
    }
}

function Save-Url([string]$Url, [string]$Dest) {
    $dir = Split-Path -Parent $Dest
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    $partial = "$Dest.partial"
    if (Test-Path $partial) { Remove-Item $partial -Force }
    $client = New-Object System.Net.WebClient
    $client.Headers['User-Agent'] = 'Wget/1.21.4'
    try {
        $client.DownloadFile($Url, $partial)
    } catch {
        if (Test-Path $partial) { Remove-Item $partial -Force }
        throw
    } finally {
        $client.Dispose()
    }
    $item = Get-Item $partial
    $stream = [IO.File]::OpenRead($partial)
    $buffer = New-Object byte[] 16
    [void]$stream.Read($buffer, 0, 16)
    $stream.Close()
    if ($item.Length -lt 512 -or $buffer[0] -eq 60) {
        Remove-Item $partial -Force
        throw 'הקובץ שהתקבל אינו תוכנה'
    }
    Move-Item -Force $partial $Dest
}

function Expand-ToolZip([string]$Archive, [string]$Mode, [string]$Target) {
    if (-not (Test-Path $Target)) { New-Item -ItemType Directory -Force -Path $Target | Out-Null }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [IO.Compression.ZipFile]::OpenRead($Archive)
    try {
        if ($Mode -eq 'iso') {
            $entries = @($zip.Entries | Where-Object { $_.FullName -match '\.(iso|img)$' -and $_.FullName -notmatch '/$' })
            if ($entries.Count -eq 0) { throw 'archive has no iso/img' }
            foreach ($entry in $entries) {
                $out = Join-Path $Target ([IO.Path]::GetFileName($entry.FullName))
                [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $out, $true)
            }
        } else {
            foreach ($entry in $zip.Entries) {
                $out = Join-Path $Target $entry.FullName
                if ($entry.FullName.EndsWith('/')) {
                    if (-not (Test-Path $out)) { New-Item -ItemType Directory -Force -Path $out | Out-Null }
                    continue
                }
                $parent = Split-Path -Parent $out
                if (-not (Test-Path $parent)) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
                [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $out, $true)
            }
        }
    } finally {
        $zip.Dispose()
    }
    Remove-Item $Archive -Force
}

function Test-Selected($Tool, [string]$ProfileName, $OnlySet) {
    if ($Tool.kind -eq 'manual') { return $false }
    if ($OnlySet.Count -gt 0 -and -not $OnlySet.Contains($Tool.id)) { return $false }
    $level = $Tool.profile
    if (-not $level) { $level = 'core' }
    if ($ProfileName -eq 'all') { return $true }
    if ($ProfileName -eq 'full') { return $level -in @('core', 'full') }
    return $level -eq 'core'
}

$raw = [IO.File]::ReadAllText($ManifestPath, [Text.UTF8Encoding]::new($false))
$manifest = $raw | ConvertFrom-Json
$onlySet = New-Object 'System.Collections.Generic.HashSet[string]'
foreach ($item in ($Only -split ',' | Where-Object { $_ })) {
    [void]$onlySet.Add($item.Trim())
}

$downloaded = New-Object System.Collections.Generic.List[string]
$failed = New-Object System.Collections.Generic.List[string]
$manuals = @($manifest.tools | Where-Object { $_.kind -eq 'manual' })

if (-not $Check) {
    if (-not (Test-Path $Destination)) { New-Item -ItemType Directory -Force -Path $Destination | Out-Null }
    foreach ($tool in $manuals) {
        $link = Join-Path $Destination (Join-Path 'Links' (Join-Path $tool.category "$($tool.id).url"))
        $linkDir = Split-Path -Parent $link
        if (-not (Test-Path $linkDir)) { New-Item -ItemType Directory -Force -Path $linkDir | Out-Null }
        [IO.File]::WriteAllText($link, "[InternetShortcut]`r`nURL=$($tool.url)`r`n", [Text.Encoding]::ASCII)
    }
}

foreach ($tool in $manifest.tools) {
    if (-not (Test-Selected $tool $Profile $onlySet)) { continue }
    $label = "$($tool.name) ($($tool.id))"
    try {
        $marker = Join-Path $Destination (Join-Path '.done' $tool.id)
        if (-not $Check -and (Test-Path $marker) -and -not $Force) {
            Write-Host "יש  $label"
            $downloaded.Add("- $label (כבר היה)")
            continue
        }
        $resolved = Resolve-Tool $tool
        Write-Host "OK  $label"
        Write-Host "    $($resolved.Name)"
        Write-Host "    $($resolved.Url)"
        if ($Check) {
            $head = Read-Head $resolved.Url
            if ($head[0] -eq 60) { throw 'URL returned HTML' }
            $downloaded.Add("- $label")
            continue
        }
        $bucket = 'Portable'
        if ($tool.bucket -eq 'iso') { $bucket = 'ISO' }
        $folder = Join-Path $Destination (Join-Path $bucket $tool.category)
        $target = Join-Path $folder $resolved.Name
        Write-Host '    מוריד...'
        Save-Url $resolved.Url $target
        if ($tool.unpack) {
            $unpackTarget = $folder
            if ($tool.unpack -eq 'dir') { $unpackTarget = Join-Path $folder $tool.id }
            Expand-ToolZip $target $tool.unpack $unpackTarget
        }
        $markerDir = Split-Path -Parent $marker
        if (-not (Test-Path $markerDir)) { New-Item -ItemType Directory -Force -Path $markerDir | Out-Null }
        [IO.File]::WriteAllText($marker, $resolved.Url + "`n", [Text.UTF8Encoding]::new($false))
        $downloaded.Add("- $label")
    } catch {
        Write-Host "FAIL $label : $($_.Exception.Message)" -ForegroundColor Red
        $failed.Add("$label : $($_.Exception.Message)")
    }
}

if (-not $Check) {
    $lines = @(
        'דיסק טכנאי',
        '==========',
        '',
        "פרופיל שהורד: $Profile",
        '',
        'הכנה של הכונן',
        '1. פתח את Portable/01-Boot/ventoy ומצא את Ventoy2Disk.exe',
        '2. הרץ אותו כמנהל, בחר את הכונן הנשלף, והתקן.',
        '3. העתק אל המחיצה הגדולה שנוצרה את התיקיות ISO, Portable, Links ואת הקובץ הזה.',
        '4. באתחול בוחרים ISO מתוך התפריט של Ventoy.',
        '5. תוכנות מתוך Portable רצות כש-Windows של הלקוח עולה.',
        '',
        'ISO של Windows מורידים עם Fido, מתוך תיקיית Portable/03-Installers:',
        'powershell -ExecutionPolicy Bypass -File .\Fido.ps1 -Win 11 -Rel Latest -Ed Pro -Lang Hebrew -Arch x64',
        '',
        'לפני עבודה על דיסק של לקוח: לבדוק BitLocker ולבקש את מפתח השחזור, ולגבות קבצים לפני מחיקות או תיקון מחיצות.',
        '',
        'קטגוריות',
        '----------'
    )
    foreach ($prop in $manifest.categories.PSObject.Properties) {
        $lines += "$($prop.Name)  $($prop.Value)"
    }
    $lines += @('', 'ירדו אוטומטית', '---------------')
    if ($downloaded.Count -eq 0) { $lines += '(אין)' } else { $lines += $downloaded }
    $lines += @('', 'להורדה ידנית מהקישורים בתיקיית Links', '----------------------------------')
    foreach ($tool in $manuals) {
        $title = $manifest.categories.($tool.category)
        if (-not $title) { $title = $tool.category }
        $lines += "- $title / $($tool.name): $($tool.note)"
    }
    if ($failed.Count -gt 0) {
        $lines += @('', 'נכשלו בהורדה', '-------------')
        foreach ($item in $failed) { $lines += "- $item" }
    }
    $start = Join-Path $Destination 'START-HERE.txt'
    [IO.File]::WriteAllText($start, (($lines -join "`r`n") + "`r`n"), [Text.UTF8Encoding]::new($true))
    Write-Host ""
    Write-Host "התיקייה מוכנה: $Destination"
}

Write-Host "הצליחו: $($downloaded.Count)  נכשלו: $($failed.Count)"
if ($Pause) { Read-Host 'Enter לסגירה' }
if ($failed.Count -gt 0) { exit 1 }
exit 0
