# Turns the vendored SEO skills and agents on or off for Claude Code, so they cost no context
# in the sessions that do no SEO work.
#   on:  copies .claude/seo-agents/seo-*.md into .claude/agents/ of this checkout (git ignores the
#        copies), and removes the SEO skills' "off" from skillOverrides.
#   off: deletes those copies, and sets each .claude/skills/seo* to "off" in skillOverrides.
# The skill switch is in the main checkout's .claude/settings.local.json, which every worktree uses.
# The agents are switched only in the checkout that holds this script.
# Start a new Claude Code session after a switch.
# Usage: pwsh -File scripts\seo-toggle.ps1 on|off
param([Parameter(Mandatory)][ValidateSet('on', 'off')][string]$State)
$ErrorActionPreference = 'Stop'

$repo = (git -C $PSScriptRoot rev-parse --show-toplevel).Trim()
$commonDir = (git -C $repo rev-parse --path-format=absolute --git-common-dir).Trim()
$mainRepo = Split-Path $commonDir -Parent

# 1. Skills: skillOverrides in the main checkout's local settings. A skill with no entry is on.
$settingsPath = Join-Path $mainRepo '.claude\settings.local.json'
$settings = if (Test-Path $settingsPath) { Get-Content $settingsPath -Raw | ConvertFrom-Json } else { [pscustomobject]@{} }
if (-not $settings.PSObject.Properties['skillOverrides']) {
    $settings | Add-Member -NotePropertyName skillOverrides -NotePropertyValue ([pscustomobject]@{})
}
$overrides = $settings.skillOverrides
$skills = Get-ChildItem (Join-Path $repo '.claude\skills') -Directory -Filter 'seo*' | ForEach-Object Name
foreach ($name in $skills) {
    if ($State -eq 'off') {
        $overrides | Add-Member -NotePropertyName $name -NotePropertyValue 'off' -Force
    } elseif ($overrides.PSObject.Properties[$name]) {
        $overrides.PSObject.Properties.Remove($name)
    }
}
New-Item -ItemType Directory -Force (Split-Path $settingsPath) | Out-Null
$settings | ConvertTo-Json -Depth 20 | Set-Content $settingsPath -Encoding utf8NoBOM

# 2. Agents: copies in .claude/agents, hidden from git by the shared info/exclude.
$exclude = Join-Path $commonDir 'info\exclude'
$pattern = '/.claude/agents/seo-*.md'
if (-not ((Test-Path $exclude) -and (Select-String -Path $exclude -SimpleMatch $pattern -Quiet))) {
    New-Item -ItemType Directory -Force (Split-Path $exclude) | Out-Null
    Add-Content $exclude $pattern
}
$agents = Join-Path $repo '.claude\agents'
$source = Join-Path $repo '.claude\seo-agents'
if ($State -eq 'on') {
    New-Item -ItemType Directory -Force $agents | Out-Null
    Copy-Item (Join-Path $source 'seo-*.md') $agents -Force
} else {
    foreach ($f in Get-ChildItem $agents -Filter 'seo-*.md' -ErrorAction SilentlyContinue) {
        # Never delete a file git tracks: only the copies made by "on".
        if (-not (git -C $repo ls-files -- ".claude/agents/$($f.Name)")) { Remove-Item $f.FullName }
    }
}

$agentCount = (Get-ChildItem $agents -Filter 'seo-*.md' -ErrorAction SilentlyContinue | Measure-Object).Count
Write-Output "SEO $State in $repo. Skills switched: $($skills.Count). SEO agents active here: $agentCount. Start a new Claude Code session."
