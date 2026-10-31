$ErrorActionPreference = "Continue"
function global:__JJ_J($x){ if($null -eq $x){return 'null'}; if($x -is [bool]){return $x.ToString().ToLower()}; if($x -is [string]){return '"'+($x.Replace('\','\\').Replace('"','\"'))+'"'}; if($x -is [array]){return '['+(($x|%{__JJ_J $_}) -join ',')+']'}; return [string]$x }
function global:__JJ_Read($path,$name){ try{ $k=Get-Item -LiteralPath $path -ErrorAction Stop; $kind=$k.GetValueKind($name).ToString(); $v=$k.GetValue($name,$null,'DoNotExpandEnvironmentNames'); return '{"e":true,"t":"'+$kind+'","v":'+(__JJ_J $v)+'}' }catch{ return '{"e":false}' } }
function global:__JJ_Emit($kind,$path,$name,$before,$after){ [Console]::Out.WriteLine('##JJ{"k":"'+$kind+'","p":'+(__JJ_J ([string]$path))+',"n":'+(__JJ_J ([string]$name))+',"b":'+$before+',"a":'+$after+'}') }
$global:__JJ_RealSet = $ExecutionContext.InvokeCommand.GetCommand('Set-ItemProperty', [System.Management.Automation.CommandTypes]::Cmdlet)
$global:__JJ_RealNew = $ExecutionContext.InvokeCommand.GetCommand('New-ItemProperty', [System.Management.Automation.CommandTypes]::Cmdlet)
$global:__JJ_RealRem = $ExecutionContext.InvokeCommand.GetCommand('Remove-ItemProperty', [System.Management.Automation.CommandTypes]::Cmdlet)
function global:Set-ItemProperty {
  [CmdletBinding()] param(
    [Parameter(Position=0, ValueFromPipelineByPropertyName=$true)][Alias('PSPath')][string[]]$Path,
    [Parameter(Position=1)][string]$Name, [Parameter(Position=2)]$Value,
    [string]$Type, [switch]$Force, [string[]]$LiteralPath, [switch]$PassThru)
  process {
    $targets = if ($LiteralPath) { $LiteralPath } else { $Path }
    foreach ($t in $targets) {
      $before = __JJ_Read $t $Name
      $splat = @{ LiteralPath = $t; Name = $Name; Value = $Value }
      if ($Type) { $splat.Type = $Type }; if ($Force) { $splat.Force = $true }
      & $global:__JJ_RealSet @splat
      __JJ_Emit 'reg' $t $Name $before (__JJ_Read $t $Name)
    }
  }
}
function global:New-ItemProperty {
  [CmdletBinding()] param(
    [Parameter(Position=0, ValueFromPipelineByPropertyName=$true)][Alias('PSPath')][string[]]$Path,
    [Parameter(Position=1)][string]$Name, [Alias('Type')][string]$PropertyType, [Parameter()]$Value,
    [switch]$Force, [string[]]$LiteralPath)
  process {
    $targets = if ($LiteralPath) { $LiteralPath } else { $Path }
    foreach ($t in $targets) {
      $before = __JJ_Read $t $Name
      $splat = @{ LiteralPath = $t; Name = $Name; Value = $Value }
      if ($PropertyType) { $splat.PropertyType = $PropertyType }; if ($Force) { $splat.Force = $true }
      & $global:__JJ_RealNew @splat
      __JJ_Emit 'reg' $t $Name $before (__JJ_Read $t $Name)
    }
  }
}
function global:Remove-ItemProperty {
  [CmdletBinding()] param(
    [Parameter(Position=0, ValueFromPipelineByPropertyName=$true)][Alias('PSPath')][string[]]$Path,
    [Parameter(Position=1)][string]$Name, [switch]$Force, [string[]]$LiteralPath)
  process {
    $targets = if ($LiteralPath) { $LiteralPath } else { $Path }
    foreach ($t in $targets) {
      $before = __JJ_Read $t $Name
      $splat = @{ LiteralPath = $t; Name = $Name }; if ($Force) { $splat.Force = $true }
      & $global:__JJ_RealRem @splat
      __JJ_Emit 'reg' $t $Name $before (__JJ_Read $t $Name)
    }
  }
}

$global:__JJ_RealSvc = $ExecutionContext.InvokeCommand.GetCommand('Set-Service', [System.Management.Automation.CommandTypes]::Cmdlet)
function global:__JJ_SvcState($n){ try { $k=Get-ItemProperty -LiteralPath "HKLM:\SYSTEM\CurrentControlSet\Services\$n" -ErrorAction Stop; $m=@('boot','system','auto','demand','disabled'); $v=$m[[int]$k.Start]; if($k.Start -eq 2 -and $k.DelayedAutostart -eq 1){$v='delayed-auto'}; return '{"e":true,"v":"'+$v+'"}' } catch { return '{"e":false}' } }
function global:Set-Service {
  [CmdletBinding()] param(
    [Parameter(Position=0, ValueFromPipelineByPropertyName=$true)][Alias('ServiceName')][string]$Name,
    [string]$StartupType, [string]$Status, [string]$DisplayName, [string]$Description)
  process {
    $b = __JJ_SvcState $Name
    $sp = @{ Name = $Name }
    foreach ($k in 'StartupType','Status','DisplayName','Description') { if ($PSBoundParameters.ContainsKey($k)) { $sp[$k] = $PSBoundParameters[$k] } }
    & $global:__JJ_RealSvc @sp
    if ($PSBoundParameters.ContainsKey('StartupType')) { [Console]::Out.WriteLine('##JJ{"k":"service","p":"","n":' + (__JJ_J $Name) + ',"b":' + $b + ',"a":' + (__JJ_SvcState $Name) + '}') }
  }
}
