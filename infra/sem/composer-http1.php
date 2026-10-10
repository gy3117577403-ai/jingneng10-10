<?php
// Build-only opt-in workaround for proxies that truncate multiplexed HTTP/2.
// Composer selects its protocol from this namespaced curl_version() call.
// TLS verification and the Composer lock file are unchanged.
namespace Composer\Util\Http;

function curl_version(): array
{
    $version = \curl_version();
    $version['features'] &= ~CURL_VERSION_HTTP2;
    if (\defined('CURL_VERSION_HTTP3')) {
        $version['features'] &= ~CURL_VERSION_HTTP3;
    }
    return $version;
}
