# Ejecutar directamente por el propietario en PowerShell. Nunca desde un log de CI.
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskKeyPath = Join-Path $taskRoot 'backups\private-keys\principal.dpapi.xml'
$taskReceiptPath = Join-Path $taskRoot 'output\backup-operativo-20261011\custodia-confirmada.json'
$taskPlain = $null
$taskPointer = [IntPtr]::Zero
$taskCheckPointer = [IntPtr]::Zero

function Clear-BackupClipboard {
    param([string]$Expected)
    try {
        $taskCurrentClipboard = Get-Clipboard -Raw
        if ($taskCurrentClipboard -and $taskCurrentClipboard.TrimEnd("`r", "`n") -ceq $Expected) {
            Set-Clipboard -Value ''
        }
    } catch {
        Write-Warning 'No se pudo limpiar el portapapeles. Limpiá su contenido manualmente.'
    }
}

Write-Host 'Plan-OTs - custodia de la clave principal'
Write-Host 'Primero prepará una nota segura privada en tu gestor: Plan-OTs / clave de respaldo / principal.'
Write-Host 'La clave se copiará al portapapeles local. Pegala únicamente en esa nota; nunca en el chat.'
Write-Host 'No se crea ni se cambia ninguna clave. No se envía información a internet desde este script.'
if ((Read-Host 'Cuando la nota esté lista, escribí GUARDAR') -cne 'GUARDAR') { return }

try {
    $taskSecure = Import-Clixml -LiteralPath $taskKeyPath
    if ($taskSecure -isnot [Security.SecureString]) { throw 'El archivo local no tiene el formato esperado.' }
    $taskPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($taskSecure)
    $taskPlain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($taskPointer)
    $taskKeyBytes = [Convert]::FromBase64String($taskPlain)
    if ($taskKeyBytes.Length -ne 32) { throw 'La clave no tiene el tamaño esperado.' }
    [Array]::Clear($taskKeyBytes, 0, $taskKeyBytes.Length)
    Set-Clipboard -Value $taskPlain
    Write-Host 'Pegá la clave en la nota segura y guardala. Volvé aquí cuando hayas terminado.'
    if ((Read-Host 'Escribí GUARDADA después de guardar la nota') -cne 'GUARDADA') { return }
    Clear-BackupClipboard -Expected $taskPlain

    Write-Host 'Ahora volvé a abrir la nota del gestor y copiá la clave guardada.'
    $taskCheck = Read-Host 'Pegala aquí para comprobarla (el texto queda oculto)' -AsSecureString
    $taskCheckPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($taskCheck)
    $taskCheckPlain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($taskCheckPointer)
    if ($taskCheckPlain -cne $taskPlain) { throw 'La clave guardada no coincide. No se registró una custodia válida.' }
    $taskPlace = Read-Host 'Nombre del gestor o medio seguro utilizado (sin contraseñas)'
    if ([string]::IsNullOrWhiteSpace($taskPlace)) { throw 'Falta identificar el lugar de custodia.' }
    $taskReceipt = [ordered]@{
        clave_id = 'principal'
        comprobada_en = [DateTime]::UtcNow.ToString('o')
        medio_declarado_por_propietario = $taskPlace
        coincide_con_clave_local = $true
        clave_incluida = $false
        alcance = 'El propietario volvió a abrir su nota y comprobó la clave. No certifica acceso desde otro equipo ni recuperación completa de la aplicación.'
    }
    $taskReceipt | ConvertTo-Json | Set-Content -LiteralPath $taskReceiptPath -Encoding UTF8
    Write-Host 'Comprobación correcta. Se guardó un comprobante sin la clave.'
} finally {
    if ($taskPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($taskPointer) }
    if ($taskCheckPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($taskCheckPointer) }
    if ($taskPlain) { Clear-BackupClipboard -Expected $taskPlain }
    $taskPlain = $null
    $taskCheckPlain = $null
}
