param([ValidateSet('protect','unprotect','init')][string]$Mode, [string]$Directory)
$ErrorActionPreference = 'Stop'
try {
    if ($Mode -eq 'init') {
        $acl = [System.IO.Directory]::GetAccessControl($Directory)
        $acl.SetAccessRuleProtection($true, $false)
        $sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
        $rule = [System.Security.AccessControl.FileSystemAccessRule]::new($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
        $acl.SetAccessRule($rule)
        [System.IO.Directory]::SetAccessControl($Directory, $acl)
        [Console]::Out.Write('OK')
        exit 0
    }
    [void][System.Reflection.Assembly]::Load('System.Security, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b03f5f7f11d50a3a')
    $bytes = [Convert]::FromBase64String([Console]::In.ReadToEnd())
    $scope = [System.Security.Cryptography.DataProtectionScope]::CurrentUser
    if ($Mode -eq 'protect') {
        $result = [System.Security.Cryptography.ProtectedData]::Protect($bytes, $null, $scope)
    } else {
        $result = [System.Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, $scope)
    }
    # Private subprocess pipe only; the caller never logs decrypted output.
    [Console]::Out.Write([Convert]::ToBase64String($result))
} catch {
    [Console]::Error.Write('Windows protected storage failed: ' + $Mode + ' / ' + $_.Exception.GetType().FullName)
    exit 1
}
