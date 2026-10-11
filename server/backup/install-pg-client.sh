#!/usr/bin/env bash
# Runs only on the disposable Ubuntu runner, never on the owner's computer.
# Official PostgreSQL apt packages, signed repository, client only (no server).
set -euo pipefail
if ! test -x /usr/lib/postgresql/17/bin/pg_dump; then
  . /etc/os-release
  test "$ID" = ubuntu
  test "$VERSION_CODENAME" = noble
  sudo install -d /usr/share/postgresql-common/pgdg
  sudo curl --fail --proto '=https' --tlsv1.2 \
    https://www.postgresql.org/media/keys/ACCC4CF8.asc \
    --output /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc
  printf '%s\n' 'Types: deb' 'URIs: https://apt.postgresql.org/pub/repos/apt' \
    'Suites: noble-pgdg' 'Architectures: amd64' 'Components: main' \
    'Signed-By: /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc' \
    | sudo tee /etc/apt/sources.list.d/plan-ots-pgdg.sources >/dev/null
  sudo apt-get update -qq
  sudo apt-get install -y --no-install-recommends postgresql-client-17
fi
/usr/lib/postgresql/17/bin/pg_dump --version | grep -E '^pg_dump \(PostgreSQL\) 17\.'
