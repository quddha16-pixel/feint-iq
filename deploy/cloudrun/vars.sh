#!/usr/bin/env bash
# Non-secret settings only. Sourcing this file does not call Google Cloud or create resources.
export PROJECT_ID=feint-identifierq
export PROJECT_NUMBER=334840153796
export REGION=us-central1
export SERVICE=identifier-q-api
export AR_REPOSITORY=identifier-q
export BUILD_SOURCE_BUCKET=feint-identifierq-iq-build-source
export RUNTIME_SA=identifier-q-runtime@feint-identifierq.iam.gserviceaccount.com
export BUILD_SA=identifier-q-build@feint-identifierq.iam.gserviceaccount.com
export GEMINI_SECRET=identifier-q-gemini-api-key
export ACCESS_SECRET=identifier-q-pilot-token
export GEMINI_SECRET_VERSION="${GEMINI_SECRET_VERSION:-1}"
export ACCESS_SECRET_VERSION="${ACCESS_SECRET_VERSION:-1}"
export FRONTEND_ORIGIN=https://quddha16-pixel.github.io
