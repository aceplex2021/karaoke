# Generate 180x180 icon for iOS
Add-Type -AssemblyName System.Drawing

$size = 180
$outputPath = "public/icon-180x180.png"

# Create bitmap
$bmp = New-Object System.Drawing.Bitmap($size, $size)
$graphics = [System.Drawing.Graphics]::FromImage($bmp)
$graphics.Clear([System.Drawing.Color]::FromArgb(102, 126, 234))  # #667eea

# Draw "K" for Kara
$font = New-Object System.Drawing.Font("Arial", 120, [System.Drawing.FontStyle]::Bold)
$brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
$graphics.DrawString("K", $font, $brush, 35, 20)

# Save
$bmp.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$bmp.Dispose()

Write-Host "✅ Created $outputPath ($size x $size)"
