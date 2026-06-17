# serve.ps1 - zero-install static file server for ParleVite (Windows; no Node/Python needed).
# Usage:  powershell -ExecutionPolicy Bypass -File serve.ps1 [port]
# Then open the printed http://localhost:PORT URL in Chrome or Edge.
param([int]$Port = 8000)

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$prefix = "http://localhost:$Port/"

$mime = @{
  ".html" = "text/html; charset=utf-8";
  ".css"  = "text/css; charset=utf-8";
  ".js"   = "text/javascript; charset=utf-8";
  ".json" = "application/json; charset=utf-8";
  ".svg"  = "image/svg+xml";
  ".ico"  = "image/x-icon";
  ".png"  = "image/png";
  ".jpg"  = "image/jpeg";
  ".md"   = "text/markdown; charset=utf-8"
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
try {
  $listener.Start()
} catch {
  Write-Host ("Could not start on " + $prefix + " - " + $_.Exception.Message)
  exit 1
}
Write-Host ("ParleVite serving " + $root + " at " + $prefix + "  (Ctrl+C to stop)")

$rootFull = [System.IO.Path]::GetFullPath($root)

while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
  } catch {
    break
  }
  $rel = [System.Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart("/"))
  if ([string]::IsNullOrEmpty($rel)) { $rel = "index.html" }
  $path = Join-Path $root $rel
  $full = [System.IO.Path]::GetFullPath($path)
  if (-not $full.StartsWith($rootFull)) {
    $ctx.Response.StatusCode = 403
    $ctx.Response.Close()
    continue
  }
  if (Test-Path $full -PathType Leaf) {
    $ext = [System.IO.Path]::GetExtension($full).ToLower()
    $ct = $mime[$ext]
    if (-not $ct) { $ct = "application/octet-stream" }
    $bytes = [System.IO.File]::ReadAllBytes($full)
    $ctx.Response.ContentType = $ct
    $ctx.Response.ContentLength64 = $bytes.Length
    $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  } else {
    $ctx.Response.StatusCode = 404
    $msg = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
    $ctx.Response.OutputStream.Write($msg, 0, $msg.Length)
  }
  $ctx.Response.Close()
}
