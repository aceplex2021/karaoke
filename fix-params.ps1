# Fix Next.js 15 params Promise handling in all API routes

$files = @(
    "src\app\api\rooms\[roomId]\route.ts",
    "src\app\api\users\[userId]\history\route.ts",
    "src\app\api\users\[userId]\history\recent\route.ts",
    "src\app\api\users\[userId]\favorites\route.ts",
    "src\app\api\users\[userId]\preferences\route.ts",
    "src\app\api\songs\group\[groupId]\versions\route.ts",
    "src\app\api\songs\[songId]\route.ts",
    "src\app\api\songs\[songId]\group\route.ts",
    "src\app\api\songs\history\[roomId]\[userId]\route.ts",
    "src\app\api\queue\item\[queueItemId]\route.ts",
    "src\app\api\queue\item\[queueItemId]\reorder\route.ts"
)

$replacements = @{
    "{ params }: { params: { roomId: string } }" = "{ params }: { params: Promise<{ roomId: string }> }"
    "{ params }: { params: { userId: string } }" = "{ params }: { params: Promise<{ userId: string }> }"
    "{ params }: { params: { groupId: string } }" = "{ params }: { params: Promise<{ groupId: string }> }"
    "{ params }: { params: { songId: string } }" = "{ params }: { params: Promise<{ songId: string }> }"
    "{ params }: { params: { queueItemId: string } }" = "{ params }: { params: Promise<{ queueItemId: string }> }"
    "const { roomId } = params;" = "const { roomId } = await params;"
    "const { userId } = params;" = "const { userId } = await params;"
    "const { groupId } = params;" = "const { groupId } = await params;"
    "const { songId } = params;" = "const { songId } = await params;"
    "const { queueItemId } = params;" = "const { queueItemId } = await params;"
}

$count = 0
foreach ($file in $files) {
    if (Test-Path $file) {
        $content = Get-Content $file -Raw
        $modified = $false
        
        foreach ($old in $replacements.Keys) {
            if ($content -match [regex]::Escape($old)) {
                $content = $content -replace [regex]::Escape($old), $replacements[$old]
                $modified = $true
            }
        }
        
        if ($modified) {
            Set-Content $file -Value $content -NoNewline
            Write-Host "Fixed: $file" -ForegroundColor Green
            $count++
        }
    }
}

Write-Host ""
Write-Host "Fixed $count files" -ForegroundColor Cyan
