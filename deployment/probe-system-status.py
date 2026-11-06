#!/usr/bin/env python3
"""Read command availability and error classes, never keys or raw WireGuard output."""
import subprocess
import shutil
import json
for name in ('wg','sudo','ip'):
    print('Command '+name+': '+str(shutil.which(name) or 'missing'))
for name,args in (
 ('wg-direct',['wg','show','wg-friedberg','latest-handshakes']),
 ('wg-sudo',['sudo','-n','/usr/bin/wg','show','wg-friedberg','latest-handshakes']),
 ('routing-state',['systemctl','show','tariq-telefonie-routing.service','--property=ActiveState','--value']),
):
    try:
        r=subprocess.run(args,capture_output=True,text=True,timeout=5)
        error=r.stderr.lower()
        reason=('password-required' if 'password' in error else 'sudo-not-allowed' if 'not allowed' in error or 'not in the sudoers' in error else 'permission-denied' if 'permission' in error or 'not permitted' in error else 'interface-missing' if 'no such device' in error else 'other-error' if r.returncode else 'ok')
        print(name+': '+json.dumps({'returncode':r.returncode,'reason':reason,'lines':len(r.stdout.splitlines())}))
    except (OSError,subprocess.SubprocessError) as exc:
        print(name+': '+type(exc).__name__)
