# Authenticode met Azure Artifact Signing (voorheen Trusted Signing). Twee standen:
#
#   pwsh scripts/release/windows-ondertekenen.ps1 -Voorbereiden -Variant system|user
#       Controleert of alle geheimen er zijn, haalt de signeerclient van Microsoft
#       (NuGet, vaste versie, SHA512 gecontroleerd), zoekt signtool.exe en schrijft
#       een Tauri-config-override met bundle.windows.signCommand. Zet CALC_SIGN_CONFIG
#       in GITHUB_ENV. De override staat bewust niet in tauri.conf.json: CI op een
#       pull request, tauri dev en lokale builds hebben geen geheimen.
#
#   pwsh scripts/release/windows-ondertekenen.ps1 <bestand>
#       Tekent een bestand. Tauri roept dit via signCommand aan voor het programma,
#       de NSIS-uninstaller en de installer. Tijdstempel: RFC 3161, SHA256.
#
# Omgeving: AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET (EnvironmentCredential
# van de client), AZURE_ENDPOINT, AZURE_TRUSTED_SIGNING_ACCOUNT_NAME en
# AZURE_CERTIFICATE_PROFILE_NAME.
[CmdletBinding()]
param(
  [switch]$Voorbereiden,
  [ValidateSet('system', 'user')][string]$Variant = 'system',
  [Parameter(Position = 0)][string]$Bestand
)
$ErrorActionPreference = 'Stop'

$ClientVersie = '1.0.146'
# SHA512 (base64) uit de NuGet-catalogus van microsoft.artifactsigning.client 1.0.146.
$ClientSha512 = '/G0hG/VDIS6psW23b5t1V/ORIgn0PVAOtGj9w+hkPmAuI4pempfwlW50E2GtHscnz9+5Qz3hbC4mcb7ej2Yn1A=='
$TijdstempelUrl = 'http://timestamp.acs.microsoft.com'

function Eis-Omgeving($naam) {
  $waarde = [Environment]::GetEnvironmentVariable($naam)
  if ([string]::IsNullOrWhiteSpace($waarde)) { throw "geheim of omgevingsvariabele $naam ontbreekt" }
  return $waarde
}

if ($Voorbereiden) {
  # Eerst alles, zodat een ontbrekend geheim niet pas na een hele build opvalt.
  # Alleen namen in de melding, nooit waarden.
  foreach ($naam in 'AZURE_TENANT_ID', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET', 'AZURE_ENDPOINT',
    'AZURE_TRUSTED_SIGNING_ACCOUNT_NAME', 'AZURE_CERTIFICATE_PROFILE_NAME') {
    Eis-Omgeving $naam | Out-Null
  }

  $tijdelijk = Eis-Omgeving 'RUNNER_TEMP'
  $wortel = Join-Path $tijdelijk 'artifact-signing'
  New-Item -ItemType Directory -Force -Path $wortel | Out-Null

  $pakket = Join-Path $wortel "client.$ClientVersie.nupkg"
  Invoke-WebRequest -UseBasicParsing -OutFile $pakket `
    -Uri "https://api.nuget.org/v3-flatcontainer/microsoft.artifactsigning.client/$ClientVersie/microsoft.artifactsigning.client.$ClientVersie.nupkg"
  $sha = [Convert]::ToBase64String([Security.Cryptography.SHA512]::Create().ComputeHash([IO.File]::ReadAllBytes($pakket)))
  if ($sha -ne $ClientSha512) { throw "SHA512 van de signeerclient klopt niet: $sha" }
  $lib = Join-Path $wortel 'lib'
  Expand-Archive -Path $pakket -DestinationPath $lib -Force
  $dlib = Join-Path $lib 'bin/x64/Azure.CodeSigning.Dlib.dll'
  if (-not (Test-Path $dlib)) { throw 'Azure.CodeSigning.Dlib.dll ontbreekt in het pakket' }

  $signtool = Get-ChildItem 'C:\Program Files (x86)\Windows Kits\10\bin\*\x64\signtool.exe' |
    Where-Object { $_.Directory.Parent.Name -match '^\d+\.\d+\.\d+\.\d+$' } |
    Sort-Object { [version]($_.Directory.Parent.Name) } -Descending | Select-Object -First 1
  if ($null -eq $signtool) { throw 'signtool.exe (x64) niet gevonden' }

  # Alleen EnvironmentCredential: geen stille terugval op een andere login.
  $metadata = [ordered]@{
    Endpoint               = Eis-Omgeving 'AZURE_ENDPOINT'
    CodeSigningAccountName = Eis-Omgeving 'AZURE_TRUSTED_SIGNING_ACCOUNT_NAME'
    CertificateProfileName = Eis-Omgeving 'AZURE_CERTIFICATE_PROFILE_NAME'
    ExcludeCredentials     = @(
      'ManagedIdentityCredential', 'WorkloadIdentityCredential', 'SharedTokenCacheCredential',
      'VisualStudioCredential', 'VisualStudioCodeCredential', 'AzureCliCredential',
      'AzurePowerShellCredential', 'AzureDeveloperCliCredential', 'InteractiveBrowserCredential')
  }
  $metadataPad = Join-Path $wortel 'metadata.json'
  $metadata | ConvertTo-Json | Set-Content -Path $metadataPad -Encoding utf8

  $dit = (Resolve-Path $PSCommandPath).Path
  $windows = @{
    signCommand = @{
      cmd  = 'pwsh'
      args = @('-NoProfile', '-NonInteractive', '-File', $dit, '%1')
    }
  }
  if ($Variant -eq 'user') { $windows.nsis = @{ installMode = 'currentUser' } }
  $configPad = Join-Path $tijdelijk 'tauri.windows-sign.conf.json'
  @{ bundle = @{ windows = $windows } } | ConvertTo-Json -Depth 6 | Set-Content -Path $configPad -Encoding utf8

  Add-Content -Path (Eis-Omgeving 'GITHUB_ENV') -Encoding utf8 -Value @(
    "CALC_SIGN_DLIB=$dlib",
    "CALC_SIGN_METADATA=$metadataPad",
    "CALC_SIGNTOOL=$($signtool.FullName)",
    "CALC_SIGN_CONFIG=$configPad")
  Write-Host "signeerclient ${ClientVersie}: $dlib"
  Write-Host "signtool: $($signtool.FullName)"
  Write-Host "installatievariant: $Variant"
  exit 0
}

if ([string]::IsNullOrWhiteSpace($Bestand)) { throw 'gebruik: windows-ondertekenen.ps1 -Voorbereiden -Variant system|user | windows-ondertekenen.ps1 <bestand>' }
if (-not (Test-Path -LiteralPath $Bestand)) { throw "bestand bestaat niet: $Bestand" }
$signtoolPad = Eis-Omgeving 'CALC_SIGNTOOL'
$dlibPad = Eis-Omgeving 'CALC_SIGN_DLIB'
$metadataBestand = Eis-Omgeving 'CALC_SIGN_METADATA'

# De tijdstempeldienst faalt af en toe kort; drie pogingen.
for ($poging = 1; $poging -le 3; $poging++) {
  & $signtoolPad sign /v /fd SHA256 /tr $TijdstempelUrl /td SHA256 /dlib $dlibPad /dmdf $metadataBestand $Bestand
  if ($LASTEXITCODE -eq 0) {
    Write-Host "getekend: $Bestand"
    exit 0
  }
  Write-Warning "signtool exit $LASTEXITCODE (poging $poging van 3): $Bestand"
  Start-Sleep -Seconds (5 * $poging)
}
throw "tekenen mislukt na 3 pogingen: $Bestand"
