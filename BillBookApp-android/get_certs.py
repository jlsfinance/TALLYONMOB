import subprocess

def get_certs():
    try:
        cmd = ['keytool', '-list', '-v', '-keystore', 'release-key.keystore', '-alias', 'key0', '-storepass', 'password']
        result = subprocess.run(cmd, capture_output=True, text=True, cwd='d:/BILL BOOK APP/GitImport-MOBILEAPP/GitImport-MOBILEAPP/BillBookApp/android/app')
        print(result.stdout)
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    get_certs()
