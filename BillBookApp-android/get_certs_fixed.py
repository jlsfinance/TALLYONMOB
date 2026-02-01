import subprocess
import os

cwd = r'd:\BILL BOOK APP\GitImport-MOBILEAPP\GitImport-MOBILEAPP\BillBookApp\android\app'
cmd = ['keytool', '-list', '-v', '-keystore', 'release-key.keystore', '-alias', 'key0', '-storepass', 'password']

try:
    result = subprocess.run(cmd, capture_output=True, check=True, cwd=cwd)
    output = result.stdout.decode('utf-8', errors='ignore')
    for line in output.splitlines():
        if 'SHA1:' in line or 'SHA256:' in line:
            print(line.strip())
except Exception as e:
    print(f"Error: {e}")
