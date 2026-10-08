#!/usr/bin/env python3
"""Send bounded backup states over a private tunnel or HTTPS; never print secrets/provider bodies."""
import json
import os
import re
import stat
import sys
import urllib.error
import urllib.request
from urllib.parse import urlsplit


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def main():
    try:
        status, run_id = sys.argv[1:]
        if status not in ('running', 'success', 'failure') or not re.fullmatch(
            r'[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}', run_id
        ):
            raise ValueError('payload')
        url = os.environ['BACKUP_REPORT_URL']
        parsed = urlsplit(url)
        if (parsed.username or parsed.password or parsed.query or parsed.fragment
                or parsed.path != '/api/health/backup'
                or not (parsed.scheme == 'https' or
                        (parsed.scheme == 'http' and parsed.hostname in ('127.0.0.1', '::1', 'localhost')))):
            raise ValueError('url')
        path = os.environ['BACKUP_REPORT_SECRET_FILE']
        info = os.lstat(path)
        if not stat.S_ISREG(info.st_mode) or info.st_mode & 0o077 or info.st_uid != os.geteuid():
            raise ValueError('permissions')
        with open(path, encoding='utf-8') as source:
            secret = source.read(257).strip()
        if len(secret) < 32 or len(secret) > 256 or any(c.isspace() for c in secret):
            raise ValueError('secret')
        data = json.dumps({'status': status, 'runId': run_id}).encode()
        request = urllib.request.Request(url, data=data, method='POST', headers={
            'Authorization': 'Bearer ' + secret, 'Content-Type': 'application/json',
        })
        # Disable ambient proxies so private reports cannot escape via proxy configuration.
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
        with opener.open(request, timeout=10) as response:
            body = response.read(1025)
            if response.status != 200 or len(body) > 1024 or json.loads(body).get('ok') is not True:
                raise ValueError('response')
        return 0
    except Exception:
        print('Laporan backup gagal: periksa tunnel, rahasia, izin berkas, dan status aplikasi.', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
