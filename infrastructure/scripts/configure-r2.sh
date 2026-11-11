#!/usr/bin/env bash
# Switch a deployed backend from local media to Cloudflare R2.
#
# Run as root on the server: sudo bash infrastructure/scripts/configure-r2.sh
#
# It asks for the R2 credentials (the secret is read without echo, so it never
# lands in shell history or chat), checks that both buckets accept a test
# write/read/delete and that the public bucket is served on its custom domain,
# copies existing local media into the buckets, and only then turns
# USE_S3_STORAGE on and restarts the backend. Local files are kept, so setting
# USE_S3_STORAGE=false and restarting rolls back.
set -euo pipefail

APP_DIR=${APP_DIR:-/var/www/SHIV/hexacademy-nepal}
BACKEND=$APP_DIR/backend
ENV_FILE=$BACKEND/.env
SERVICES=(hexacademy-backend hexacademy-celery-worker hexacademy-celery-beat)

[[ $EUID -eq 0 ]] || { echo "Run as root (sudo)." >&2; exit 1; }
[[ -f $ENV_FILE ]] || { echo "No $ENV_FILE" >&2; exit 1; }

read -rp "Cloudflare account ID: " ACCOUNT_ID
read -rp "R2 access key ID: " ACCESS_KEY
read -rsp "R2 secret access key (hidden): " SECRET_KEY; echo
read -rp "Public bucket [hexacademy-public]: " PUBLIC_BUCKET
read -rp "Private bucket [hexacademy-private]: " PRIVATE_BUCKET
read -rp "Public media domain [media.hexacademynepal.com]: " MEDIA_DOMAIN
PUBLIC_BUCKET=${PUBLIC_BUCKET:-hexacademy-public}
PRIVATE_BUCKET=${PRIVATE_BUCKET:-hexacademy-private}
MEDIA_DOMAIN=${MEDIA_DOMAIN:-media.hexacademynepal.com}

# Plain tokens only, so the values are safe in an EnvironmentFile unquoted.
[[ $ACCOUNT_ID =~ ^[0-9a-f]{32}$ ]] || { echo "Account ID should be 32 hex characters." >&2; exit 1; }
[[ $ACCESS_KEY =~ ^[A-Za-z0-9]+$ && $SECRET_KEY =~ ^[A-Za-z0-9]+$ ]] || { echo "Keys should be letters and digits only." >&2; exit 1; }
[[ $PUBLIC_BUCKET =~ ^[a-z0-9-]+$ && $PRIVATE_BUCKET =~ ^[a-z0-9-]+$ ]] || { echo "Bucket names are lowercase letters, digits and dashes." >&2; exit 1; }
[[ $MEDIA_DOMAIN =~ ^[a-z0-9.-]+$ ]] || { echo "Domain looks wrong." >&2; exit 1; }
[[ $PUBLIC_BUCKET != "$PRIVATE_BUCKET" ]] || { echo "Use two different buckets." >&2; exit 1; }

ENDPOINT="https://$ACCOUNT_ID.r2.cloudflarestorage.com"

echo "Checking the buckets and copying existing media..."
cd "$BACKEND"
R2_ENDPOINT=$ENDPOINT R2_KEY=$ACCESS_KEY R2_SECRET=$SECRET_KEY R2_PUBLIC=$PUBLIC_BUCKET \
R2_PRIVATE=$PRIVATE_BUCKET R2_DOMAIN=$MEDIA_DOMAIN \
sudo -E -u hexacademy .venv/bin/python - <<'PY'
import mimetypes, os, secrets, sys, urllib.request
from pathlib import Path

import boto3
from botocore.exceptions import BotoCoreError, ClientError

s3 = boto3.client(
    "s3", endpoint_url=os.environ["R2_ENDPOINT"], region_name="auto",
    aws_access_key_id=os.environ["R2_KEY"], aws_secret_access_key=os.environ["R2_SECRET"],
)
public, private, domain = os.environ["R2_PUBLIC"], os.environ["R2_PRIVATE"], os.environ["R2_DOMAIN"]

def fail(msg):
    print(f"FAILED: {msg}", file=sys.stderr)
    sys.exit(1)

for bucket in (public, private):
    key = f"healthcheck/{secrets.token_hex(8)}.txt"
    body = b"hexacademy r2 check"
    try:
        s3.put_object(Bucket=bucket, Key=key, Body=body, ContentType="text/plain")
        got = s3.get_object(Bucket=bucket, Key=key)["Body"].read()
        if got != body:
            fail(f"{bucket}: read back different bytes")
        if bucket == public:
            req = urllib.request.Request(f"https://{domain}/{key}", headers={"User-Agent": "hexacademy-r2-check"})
            try:
                with urllib.request.urlopen(req, timeout=20) as res:
                    if res.read() != body:
                        fail(f"https://{domain} served different content")
            except Exception as exc:
                fail(f"https://{domain}/ did not serve the public bucket ({exc}). Connect the custom domain first.")
    except ClientError as exc:
        fail(f"{bucket}: {exc.response['Error'].get('Code')} - check the bucket name and token permissions")
    except BotoCoreError as exc:
        fail(f"{bucket}: {exc} - check the account ID")
    finally:
        try:
            s3.delete_object(Bucket=bucket, Key=key)
        except (BotoCoreError, ClientError):
            pass
    print(f"ok  {bucket}")

def copy_tree(root, bucket):
    copied = skipped = 0
    for path in sorted(p for p in Path(root).rglob("*") if p.is_file()):
        key = path.relative_to(root).as_posix()
        try:
            s3.head_object(Bucket=bucket, Key=key)
            skipped += 1
            continue
        except ClientError:
            pass
        ctype = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        s3.upload_file(str(path), bucket, key, ExtraArgs={"ContentType": ctype})
        copied += 1
    print(f"{root}: copied {copied}, already there {skipped}")

copy_tree("media", public)
copy_tree("private_media", private)
PY

echo "Updating $ENV_FILE (backup kept next to it)..."
cp -p "$ENV_FILE" "$ENV_FILE.bak-$(date +%Y%m%d%H%M%S)"
sed -i -E '/^(USE_S3_STORAGE|S3_ENDPOINT_URL|S3_ACCESS_KEY_ID|S3_SECRET_ACCESS_KEY|S3_REGION|S3_PUBLIC_BUCKET|S3_PUBLIC_CUSTOM_DOMAIN|S3_PRIVATE_BUCKET)=/d' "$ENV_FILE"
cat >> "$ENV_FILE" <<EOF
USE_S3_STORAGE=true
S3_ENDPOINT_URL=$ENDPOINT
S3_ACCESS_KEY_ID=$ACCESS_KEY
S3_SECRET_ACCESS_KEY=$SECRET_KEY
S3_REGION=auto
S3_PUBLIC_BUCKET=$PUBLIC_BUCKET
S3_PUBLIC_CUSTOM_DOMAIN=$MEDIA_DOMAIN
S3_PRIVATE_BUCKET=$PRIVATE_BUCKET
EOF
chmod 600 "$ENV_FILE" "$ENV_FILE".bak-*

systemctl restart "${SERVICES[@]}"
sleep 4
systemctl is-active "${SERVICES[@]}"
echo "Done. Uploads now go to R2. To roll back: set USE_S3_STORAGE=false in $ENV_FILE and restart ${SERVICES[*]}."
