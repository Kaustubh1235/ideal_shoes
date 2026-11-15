#!/bin/sh
# S3-compatible object store for product photos (public bucket) and invoices (private bucket).
# Replaces MinIO, whose container images are no longer published. Keys come from the
# environment; anonymous visitors may only read the public bucket.
set -eu
: "${S3_ACCESS_KEY:?set S3_ACCESS_KEY}" "${S3_SECRET_KEY:?set S3_SECRET_KEY}"
PUBLIC_BUCKET="${S3_BUCKET:-media}"
cat > /tmp/s3.json <<JSON
{"identities":[
  {"name":"app","credentials":[{"accessKey":"${S3_ACCESS_KEY}","secretKey":"${S3_SECRET_KEY}"}],
   "actions":["Admin","Read","Write","List","Tagging"]},
  {"name":"anonymous","actions":["Read:${PUBLIC_BUCKET}"]}
]}
JSON
exec weed server -dir=/data -ip.bind=0.0.0.0 -s3 -s3.port=8333 -s3.config=/tmp/s3.json \
  -master.volumeSizeLimitMB=1024 -volume.max=0
