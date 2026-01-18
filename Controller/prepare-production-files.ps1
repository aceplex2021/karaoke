# prepare-production-files.ps1
# Prepare clean production files for TrueNAS deployment

$sourceDir = "c:\Users\aceon\AI\karaoke\Controller"
$targetDir = "c:\temp\controller-update"

Write-Host "🚀 Preparing Node Controller Production Files" -ForegroundColor Cyan
Write-Host ""

# Create temp directory
if (Test-Path $targetDir) {
    Write-Host "⚠️  Target directory exists. Removing old files..." -ForegroundColor Yellow
    Remove-Item -Path $targetDir -Recurse -Force
}

New-Item -ItemType Directory -Path $targetDir | Out-Null
Write-Host "✅ Created: $targetDir" -ForegroundColor Green

# Copy the 4 new enhanced files
$filesToCopy = @(
    "rules-enhanced.js",
    "parseFilename-enhanced.js",
    "dbUpsert-enhanced.js",
    "channelSources.md"
)

Write-Host ""
Write-Host "📁 Copying production files..." -ForegroundColor Cyan

foreach ($file in $filesToCopy) {
    $sourcePath = Join-Path $sourceDir $file
    $targetPath = Join-Path $targetDir $file
    
    if (Test-Path $sourcePath) {
        Copy-Item -Path $sourcePath -Destination $targetPath
        Write-Host "  ✅ $file" -ForegroundColor Green
    } else {
        Write-Host "  ❌ $file (NOT FOUND)" -ForegroundColor Red
    }
}

# Create modified versions of the 3 files that need import changes
Write-Host ""
Write-Host "✏️  Creating modified import files..." -ForegroundColor Cyan

# Read original files and update imports
$filesToModify = @(
    "index.js",
    "promoteIncoming.js",
    "watchVideos.js"
)

foreach ($file in $filesToModify) {
    $sourcePath = Join-Path $sourceDir $file
    $targetPath = Join-Path $targetDir $file
    
    if (Test-Path $sourcePath) {
        $content = Get-Content -Path $sourcePath -Raw
        
        # Update imports to use enhanced parser
        $content = $content -replace "from ['""]\.\/parseFilename\.js['""]", "from './parseFilename-enhanced.js'"
        $content = $content -replace 'from [''"]\.\/parseFilename\.js[''"]', 'from "./parseFilename-enhanced.js"'
        
        Set-Content -Path $targetPath -Value $content
        Write-Host "  ✅ $file (imports updated)" -ForegroundColor Green
    } else {
        Write-Host "  ❌ $file (NOT FOUND)" -ForegroundColor Red
    }
}

# Create README for deployment
$readmeContent = @"
# Node Controller Production Files

This folder contains ONLY the files needed to update your TrueNAS Node Controller.

## Files in this folder:

### New Files (Add to controller):
1. rules-enhanced.js
2. parseFilename-enhanced.js
3. dbUpsert-enhanced.js
4. channelSources.md

### Modified Files (Replace existing):
5. index.js (import updated)
6. promoteIncoming.js (import updated)
7. watchVideos.js (import updated)

## Deployment Steps:

1. **Backup your current controller first!**
   ```bash
   cp -r /path/to/controller /path/to/controller-backup-$(date +%Y%m%d)
   ```

2. **Upload all files from this folder to your TrueNAS controller directory**

3. **Restart the Node Controller:**
   ```bash
   docker restart karaoke-node
   ```

4. **Check logs for any errors:**
   ```bash
   docker logs -f karaoke-node
   ```

5. **Test with a sample video file**

## What Changed:

- **rules-enhanced.js**: Dynamically loads mixer names from channelSources.md
- **parseFilename-enhanced.js**: Enhanced parser with better cleanup and metadata extraction
- **dbUpsert-enhanced.js**: Writes artist_name and performance_type to database
- **channelSources.md**: List of mixer/channel names (edit this to add new mixers)
- **3 files updated**: Import statements changed to use enhanced parser

## Adding New Mixers:

Just edit `channelSources.md` (one name per line, use Vietnamese accents):
```
Trọng Hiếu
Kim Quy
Your New Mixer
```

Restart controller after changes.

## Rollback:

If issues occur, restore from backup:
```bash
rm -rf /path/to/controller
cp -r /path/to/controller-backup-YYYYMMDD /path/to/controller
docker restart karaoke-node
```

---
Generated: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
"@

Set-Content -Path (Join-Path $targetDir "DEPLOY_README.txt") -Value $readmeContent
Write-Host "  ✅ DEPLOY_README.txt" -ForegroundColor Green

# List all files
Write-Host ""
Write-Host "📦 Production files ready in: $targetDir" -ForegroundColor Cyan
Write-Host ""
Write-Host "Files prepared:" -ForegroundColor White
Get-ChildItem -Path $targetDir | ForEach-Object {
    Write-Host "  • $($_.Name)" -ForegroundColor Gray
}

Write-Host ""
Write-Host "✅ Done! Next steps:" -ForegroundColor Green
Write-Host "  1. Review files in: $targetDir" -ForegroundColor White
Write-Host "  2. Backup your TrueNAS controller" -ForegroundColor White
Write-Host "  3. Upload all files to TrueNAS" -ForegroundColor White
Write-Host "  4. Restart Node Controller" -ForegroundColor White
Write-Host ""
Write-Host "📖 See INTEGRATION_GUIDE.md for detailed instructions" -ForegroundColor Cyan
