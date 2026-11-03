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
export GEMINI_SECRET=identifierq-gemini-api-key
export ACCESS_SECRET=identifierq-pilot-token
# Choose enabled numeric versions using metadata; never assume version 1 exists.
export GEMINI_SECRET_VERSION="${GEMINI_SECRET_VERSION:-}"
export ACCESS_SECRET_VERSION="${ACCESS_SECRET_VERSION:-}"
export GEMINI_MODEL=gemini-3.5-flash-lite
export FRONTEND_ORIGIN=https://quddha16-pixel.github.io
