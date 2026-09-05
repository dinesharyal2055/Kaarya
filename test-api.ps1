# Full end-to-end API test script

$base = "http://localhost:5000/api"

function test {
    param($name, $script)
    Write-Host ""
    Write-Host "=== $name ===" -ForegroundColor Cyan
    try {
        $result = & $script
        $result | ConvertTo-Json -Depth 3
        Write-Host "[PASS]" -ForegroundColor Green
        return $true
    } catch {
        Write-Host "[FAIL] $_" -ForegroundColor Red
        return $false
    }
}

# 1. Health check
test "Health check" { Invoke-RestMethod -Uri "$base/health" -Method GET }

# 2. Register as seeker
test "Register seeker" {
    Invoke-RestMethod -Uri "$base/auth/register" -Method POST `
        -Body (@{phone="9809999001";password="test123";name="Flow Seeker";role="seeker"} | ConvertTo-Json) `
        -ContentType "application/json"
}

# 3. Register as provider
test "Register provider" {
    Invoke-RestMethod -Uri "$base/auth/register" -Method POST `
        -Body (@{phone="9809999002";password="test123";name="Flow Provider";role="provider"} | ConvertTo-Json) `
        -ContentType "application/json"
}

# 4. Login as provider
$loginResult = test "Login as provider" {
    Invoke-RestMethod -Uri "$base/auth/login" -Method POST `
        -Body (@{phone="9809999002";password="test123"} | ConvertTo-Json) `
        -ContentType "application/json"
}
$token = $loginResult.token
Write-Host "Token: $token" -ForegroundColor Yellow

# 5. Browse jobs
test "List all jobs" { Invoke-RestMethod -Uri "$base/jobs" -Method GET }

# 6. Filter by category
test "Filter by plumbing" {
    Invoke-RestMethod -Uri "$base/jobs?category=plumbing" -Method GET
}

# 7. Submit offer on job #1
if ($token) {
    test "Submit offer" {
        Invoke-RestMethod -Uri "$base/offers" -Method POST `
            -Body (@{jobId=1;price=1000;message="I can fix it today"} | ConvertTo-Json) `
            -ContentType "application/json" `
            -Headers @{Authorization="Bearer $token"}
    }
}

Write-Host ""
Write-Host "=== All tests complete ===" -ForegroundColor Green
