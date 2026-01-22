# Generate PWA Icons for Kara App
# Creates placeholder icons with gradient background and emoji

Add-Type -AssemblyName System.Drawing

$sizes = @(72, 96, 128, 144, 152, 192, 384, 512)
$publicFolder = "public"

# Ensure public folder exists
if (!(Test-Path $publicFolder)) {
    New-Item -ItemType Directory -Path $publicFolder
}

Write-Host "🎨 Generating PWA icons..." -ForegroundColor Cyan
Write-Host ""

foreach ($size in $sizes) {
    try {
        # Create bitmap
        $bitmap = New-Object System.Drawing.Bitmap($size, $size)
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        
        # Enable anti-aliasing for smooth graphics
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
        $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
        
        # Create gradient background (purple gradient from manifest)
        $rect = New-Object System.Drawing.Rectangle(0, 0, $size, $size)
        $startColor = [System.Drawing.Color]::FromArgb(102, 126, 234) # #667eea
        $endColor = [System.Drawing.Color]::FromArgb(118, 75, 162)    # #764ba2
        $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $startColor, $endColor, 45)
        $graphics.FillRectangle($brush, $rect)
        
        # Draw microphone emoji
        $fontSize = [math]::Max(24, [int]($size * 0.4))
        $font = New-Object System.Drawing.Font("Segoe UI Emoji", $fontSize, [System.Drawing.FontStyle]::Bold)
        $textBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
        
        # Center the text
        $format = New-Object System.Drawing.StringFormat
        $format.Alignment = [System.Drawing.StringAlignment]::Center
        $format.LineAlignment = [System.Drawing.StringAlignment]::Center
        
        # Draw emoji
        $graphics.DrawString("🎤", $font, $textBrush, $rect, $format)
        
        # Save PNG
        $filename = "icon-$size`x$size.png"
        $path = Join-Path $publicFolder $filename
        $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
        
        Write-Host "✅ Created: $filename ($size x $size)" -ForegroundColor Green
        
        # Cleanup
        $graphics.Dispose()
        $bitmap.Dispose()
        $brush.Dispose()
        $font.Dispose()
        $textBrush.Dispose()
        
    } catch {
        Write-Host "❌ Failed to create icon-$size`x$size.png: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "All icons generated successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "Icons saved to public folder" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next: Clear .next cache and restart dev server" -ForegroundColor Yellow
