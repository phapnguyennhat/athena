#!/bin/sh
# Runs when LocalStack is ready; creates the bucket only if it doesn't exist yet.
awslocal s3api head-bucket --bucket "$S3_BUCKET" 2>/dev/null || awslocal s3 mb "s3://$S3_BUCKET"
