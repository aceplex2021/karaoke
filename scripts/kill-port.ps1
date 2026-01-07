# Kill any process using ports 3000 (frontend) or 3001 (backend)
$ports = @(3000, 3001)

foreach ($port in $ports) {
    $connections = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    
    if ($connections) {
        $processIds = $connections | Select-Object -ExpandProperty OwningProcess -Unique
        foreach ($processId in $processIds) {
            if ($processId -gt 0) {
                try {
                    Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
                    Write-Host "Killed process $processId on port $port"
                } catch {
                    # Process might already be gone
                }
            }
        }
    } else {
        Write-Host "Port $port is free"
    }
}

Start-Sleep -Milliseconds 500

