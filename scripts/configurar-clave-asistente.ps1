# Ejecutar por el propietario. Nunca pegar claves en el chat ni ejecutar en CI.
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskKeyDir = Join-Path $taskRoot 'backups\private-keys'
$taskKeyFile = Join-Path $taskKeyDir 'asistente.dpapi.xml'
$taskReceiptDir = Join-Path $taskRoot 'output\mi-asistente-mockup'
New-Item -ItemType Directory -Path $taskKeyDir,$taskReceiptDir -Force | Out-Null
function Clear-AssistantClipboard {
    param([string]$Expected)
    try { if ((Get-Clipboard -Raw) -ceq $Expected) { Set-Clipboard -Value ' ' } }
    catch { Write-Warning 'No se pudo limpiar el portapapeles. Copia un texto cualquiera para reemplazar la clave.' }
}
$taskPlain = $null
$taskPointer = [IntPtr]::Zero
$taskCheckPointer = [IntPtr]::Zero
try {
    if (Test-Path -LiteralPath $taskKeyFile) { $taskSecure = Import-Clixml -LiteralPath $taskKeyFile }
    else {
        $taskBytes = New-Object byte[] 32
        $taskRandom = [Security.Cryptography.RandomNumberGenerator]::Create()
        try { $taskRandom.GetBytes($taskBytes) } finally { $taskRandom.Dispose() }
        $taskSecure = ConvertTo-SecureString ([Convert]::ToBase64String($taskBytes)) -AsPlainText -Force
        [Array]::Clear($taskBytes,0,$taskBytes.Length)
        $taskSecure | Export-Clixml -LiteralPath $taskKeyFile
    }
    if ($taskSecure -isnot [Security.SecureString]) { throw 'Formato local invalido.' }
    $taskPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($taskSecure)
    $taskPlain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($taskPointer)
    if ([Convert]::FromBase64String($taskPlain).Length -ne 32) { throw 'Clave local invalida.' }
    Write-Host 'Crea una nota privada en Bitwarden llamada: Plan-OTs / clave de cifrado / asistente'
    Write-Host 'Esta es una clave distinta de la del respaldo. No se muestra ni se envia desde este script.'
    if ((Read-Host 'Cuando la nota este abierta, escribe GUARDAR') -cne 'GUARDAR') { return }
    Set-Clipboard -Value $taskPlain
    Write-Host 'Pega en Notas y guarda en Bitwarden. Nunca en el chat.'
    if ((Read-Host 'Cuando este guardada, escribe GUARDADA') -cne 'GUARDADA') { return }
    Clear-AssistantClipboard -Expected $taskPlain
    Write-Host 'Vuelve a abrir la nota de Bitwarden y copia su contenido.'
    $taskCheck = Read-Host 'Pegalo para verificar (queda oculto)' -AsSecureString
    $taskCheckPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($taskCheck)
    if ([Runtime.InteropServices.Marshal]::PtrToStringBSTR($taskCheckPointer) -cne $taskPlain) { throw 'La nota no coincide. No instales una clave distinta.' }
    $taskReceipt = [ordered]@{clave_id='asistente';comprobada_en=[DateTime]::UtcNow.ToString('o');custodia='Bitwarden declarada y comparada por propietario';clave_incluida=$false;instalacion_supabase_declarada=$false}
    $taskReceipt | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskReceiptDir 'custodia-asistente.json') -Encoding UTF8
    Clear-AssistantClipboard -Expected $taskPlain
    Write-Host 'En Supabase > Edge Functions > Secrets, agrega ASSISTANT_MASTER_KEY.'
    if ((Read-Host 'Cuando estes en el campo Value, escribe SERVIDOR') -cne 'SERVIDOR') { return }
    Set-Clipboard -Value $taskPlain
    Write-Host 'Pega la clave en Value, guarda y agrega ASSISTANT_ENABLED con valor true.'
    if ((Read-Host 'Cuando ambos secretos esten guardados, escribe INSTALADA') -cne 'INSTALADA') { return }
    $taskReceipt.instalacion_supabase_declarada = $true
    $taskReceipt | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskReceiptDir 'custodia-asistente.json') -Encoding UTF8
    Write-Host 'Custodia comprobada. La aplicacion debe verificar el servicio; no se hizo ninguna consulta paga.'
} finally {
    if ($taskPlain) { Clear-AssistantClipboard -Expected $taskPlain }
    if ($taskPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($taskPointer) }
    if ($taskCheckPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($taskCheckPointer) }
    $taskPlain = $null
}
