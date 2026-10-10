/**
 * URL validation utilities with SSRF protection.
 */

const BLOCKED_HOSTNAMES = new Set(['localhost', 'localhost.localdomain']);

export function isPublicIpAddress(address: string): boolean {
  if (address.includes(':')) {
    const normalized = address.toLowerCase();
    const mappedIpv4 = normalized.match(/(?:^|:)ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];

    if (mappedIpv4) {
      return isPublicIpAddress(mappedIpv4);
    }

    const firstSegment = Number.parseInt(normalized.split(':')[0] || '0', 16);

    return (
      firstSegment >= 0x2000 &&
      firstSegment <= 0x3fff &&
      !normalized.startsWith('2001:db8:') &&
      !normalized.startsWith('2001:0:') &&
      !normalized.startsWith('2002:') &&
      !normalized.startsWith('3fff:')
    );
  }

  const octets = address.split('.').map(Number);

  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return false;
  }

  const [first, second] = octets;

  return !(
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0 && (octets[2] === 0 || octets[2] === 2)) ||
    (first === 192 && second === 88 && octets[2] === 99) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19 || (second === 51 && octets[2] === 100))) ||
    (first === 203 && second === 0 && octets[2] === 113) ||
    first >= 224
  );
}

export function isValidUrl(input: string): boolean {
  try {
    const url = new URL(input);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function isAllowedUrl(input: string): boolean {
  if (!isValidUrl(input)) {
    return false;
  }

  const url = new URL(input);
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');

  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    return isPublicIpAddress(hostname.slice(1, -1));
  }

  if (
    BLOCKED_HOSTNAMES.has(hostname) ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    return false;
  }

  if (/^\d+(?:\.\d+){3}$/.test(hostname)) {
    return isPublicIpAddress(hostname);
  }

  return true;
}
