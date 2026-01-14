# PowerShell script to create a safety checkpoint before making code changes
# Usage: .\scripts\create-checkpoint.ps1 "Issue description"

param(
    [Parameter(Mandatory=$true)]
    [string]$IssueDescription
)

# Validate we're in a git repository
if (-not (Test-Path .git)) {
    Write-Host "❌ Error: Not in a git repository" -ForegroundColor Red
    exit 1
}

# Check for uncommitted changes
$status = git status --porcelain
if ($status) {
    Write-Host "⚠️  Warning: You have uncommitted changes" -ForegroundColor Yellow
    Write-Host "   Consider committing or stashing them first" -ForegroundColor Yellow
    $response = Read-Host "Continue anyway? (y/n)"
    if ($response -ne 'y') {
        exit 0
    }
}

# Generate branch and tag names
$branchName = "fix/$($IssueDescription.ToLower().Replace(' ', '-').Replace('_', '-'))"
$tagName = "checkpoint-$($IssueDescription.ToLower().Replace(' ', '-').Replace('_', '-'))"

# Check if branch already exists
$existingBranch = git branch --list $branchName
if ($existingBranch) {
    Write-Host "⚠️  Warning: Branch '$branchName' already exists" -ForegroundColor Yellow
    $response = Read-Host "Use existing branch? (y/n)"
    if ($response -ne 'y') {
        Write-Host "❌ Aborted" -ForegroundColor Red
        exit 1
    }
    git checkout $branchName
} else {
    # Create new branch
    git checkout -b $branchName
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Error: Failed to create branch" -ForegroundColor Red
        exit 1
    }
}

# Check if tag already exists
$existingTag = git tag --list $tagName
if ($existingTag) {
    Write-Host "⚠️  Warning: Tag '$tagName' already exists" -ForegroundColor Yellow
    $response = Read-Host "Create new tag with timestamp? (y/n)"
    if ($response -eq 'y') {
        $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
        $tagName = "$tagName-$timestamp"
    } else {
        Write-Host "❌ Aborted" -ForegroundColor Red
        exit 1
    }
}

# Create checkpoint tag
git tag -a $tagName -m "Checkpoint before fixing: $IssueDescription"
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Error: Failed to create tag" -ForegroundColor Red
    exit 1
}

# Success message
Write-Host ""
Write-Host "✅ Checkpoint created successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "Branch: $branchName" -ForegroundColor Cyan
Write-Host "Tag:    $tagName" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Make your code changes"
Write-Host "  2. Test the fix"
Write-Host "  3. Run regression tests"
Write-Host "  4. If tests pass: git commit"
Write-Host "  5. If tests fail: git reset --hard $tagName"
Write-Host ""
