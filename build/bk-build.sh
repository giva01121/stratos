#!/usr/bin/env bash

# Build back-end Jetstream

# Use tmp folder as our GOPATH for the build

DEV=${STRATOS_BACKEND_DEV:-false}
ACTION=${1:-build}

set -euo pipefail

# Script folder
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null && pwd )"
STRATOS="`cd "${DIR}/..";pwd`"

pushd ${STRATOS} > /dev/null

# Make outputs folder
OUTPUTS=$STRATOS/outputs
mkdir -p ${OUTPUTS}

STRATOS_GOBASE=tmp/go/src/github.com/cloudfoundry-incubator/stratos
mkdir -p ${STRATOS_GOBASE}/src

# Remove the temporary source folder if it is already there
if [ -d "${STRATOS_GOBASE}/src/jetstream" ]; then
  rm -rf ${STRATOS_GOBASE}/src/jetstream
fi

# Set go path
export GOPATH=${STRATOS}/tmp/go

# Link in the backend source
pushd ${STRATOS_GOBASE}/src > /dev/null
ln -s ${STRATOS}/src/jetstream jetstream
popd > /dev/null

# Copy dep files
cp Gopkg.* ${STRATOS_GOBASE}

# Check the dependencies - update if needed
pushd ${STRATOS_GOBASE} > /dev/null
set +e
echo "Checking backend dependencies ..."
dep check -skip-lock > /dev/null
DEP_CHECK_RESULT=$?
set -e
if [ ${DEP_CHECK_RESULT} -ne 0 ]; then
  echo "Fetching backend dependencies ..."
  # Just downlaod the dependencies using the lock file
  dep ensure -vendor-only -v
else
  echo "Backend dependencies are up to date (vendor folder okay)"
fi
popd > /dev/null

# Build backend or run tests
pushd ${STRATOS_GOBASE}/src/jetstream > /dev/null

if [ "${ACTION}" == "build" ]; then
  echo "Building backend ..."
  go build
  # Legacy name for now - will rename later
  cp jetstream $OUTPUTS/portal-proxy

  # Legacy - we will remove the need for this shortly
  if [ "$DEV" == "true" ]; then
    echo "Copying files to simplify running backend in dev ..."
  fi

  echo "Build complete ..."
else
  echo "Running backend tests ..."
  go test ./... -v
fi

popd > /dev/null

popd > /dev/null
