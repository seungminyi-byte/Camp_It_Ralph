param([string]$NodeDirectory, [string]$Label = 'checks')
$ErrorActionPreference = 'Stop'
$env:PYTHONUTF8 = '1'
$env:PYTHONIOENCODING = 'utf-8'
if ($NodeDirectory) { $env:PATH = $NodeDirectory + ';' + $env:PATH }
$repoPath = Split-Path -Parent $PSScriptRoot
Push-Location $repoPath
try {
  $evidencePath = Join-Path $PSScriptRoot ('evidence/' + $Label)
  New-Item -ItemType Directory -Path $evidencePath -Force | Out-Null
  $commands = @(
    @{name='typecheck';program='npm.cmd';arguments=@('--prefix','prototype','run','typecheck')},
    @{name='lint';program='npm.cmd';arguments=@('--prefix','prototype','run','lint')},
    @{name='test';program='node';arguments=@('prototype/node_modules/vitest/vitest.mjs','run','--root','prototype')},
    @{name='data';program='python';arguments=@('data-pack/scripts/validate_out.py')},
    @{name='build';program='npm.cmd';arguments=@('--prefix','prototype','run','build')}
  )
  $results = @()
  foreach ($command in $commands) {
    $logPath = Join-Path $evidencePath ($command.name + '.txt')
    $started = [DateTimeOffset]::UtcNow.ToString('o')
    & $command.program @($command.arguments) 2>&1 | Tee-Object -FilePath $logPath
    $code = $LASTEXITCODE
    $results += [pscustomobject]@{name=$command.name;started=$started;exitCode=$code;log=$logPath}
    $results | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $evidencePath 'results.json') -Encoding utf8
    if ($code -ne 0) { throw ($command.name + ' failed: ' + $code) }
  }
} finally { Pop-Location }
