# Generate Simple PWA Icons
# Creates solid color gradient icons

Add-Type -AssemblyName System.Drawing

$sizes = @(72, 96, 128, 144, 152, 192, 384, 512)
$publicFolder = "public"

if (!(Test-Path $publicFolder)) {
    New-Item -ItemType Directory -Path $publicFolder | Out-Null
}

Write-Host "Generating PWA icons..." -ForegroundColor Cyan

foreach ($size in $sizes) {
    try {
        $bitmap = New-Object System.Drawing.Bitmap($size, $size)
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        
        # Gradient background
        $rect = New-Object System.Drawing.Rectangle(0, 0, $size, $size)
        $startColor = [System.Drawing.Color]::FromArgb(102, 126, 234)
        $endColor = [System.Drawing.Color]::FromArgb(118, 75, 162)
        $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $startColor, $endColor, 45)
        $graphics.FillRectangle($brush, $rect)
        
        # Draw simple white circle in center
        $centerX = $size / 2
        $centerY = $size / 2
        $radius = [int]($size * 0.3)
        $whiteBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
        $graphics.FillEllipse($whiteBrush, $centerX - $radius, $centerY - $radius, $radius * 2, $radius * 2)
        
        # Save
        $filename = "icon-$size`x$size.png"
        $path = Join-Path $publicFolder $filename
        $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
        
        Write-Host "Created: $filename" -ForegroundColor Green
        
        $graphics.Dispose()
        $bitmap.Dispose()
        $brush.Dispose()
        $whiteBrush.Dispose()
        
    } catch {
        Write-Host "Failed: icon-$size`x$size.png - $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "Done! Icons saved to public folder" -ForegroundColor Green
Write-Host "Next: Remove-Item -Recurse -Force .next" -ForegroundColor Yellow
