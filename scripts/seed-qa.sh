#!/usr/bin/env bash
# ============================================================================
# seed-qa.sh — Mobile QA fixtures in the GeoERP database. Idempotent.
#
#   ./scripts/seed-qa.sh                  # seed the local geoerp stack
#   ./scripts/seed-qa.sh --teardown       # remove the whole QA dataset
#   ./scripts/seed-qa.sh --help
#
# The mobile app has no database of its own: it reads the same Supabase
# project as the web admin (Techingenius/geoerp). Until now every QA pass on
# this app started by building its data by hand — an org, a field user, a
# project with segments, a handful of services in different statuses, a crew
# with a roster — which is slow, never twice the same, and impossible to
# reproduce when a tester reports a bug. This script writes that set, and
# writes it the same way every time.
#
# IDEMPOTENT. Every row has a hard-coded id and every write is an upsert on
# that id, so no run can duplicate a fixture. The verification block at the end
# asserts the row counts through RLS, so a run that left the dataset in any
# other shape fails instead of reporting success.
#
# THE QA PROJECT IS DISPOSABLE. A real QA session writes into it — creating a
# service, reporting production, attaching photos — and those rows are not
# fixtures, so the counts would never match again and every later run would
# fail. That would put us back to deleting rows by hand, which is the thing
# this script exists to remove. So each run first prunes the QA organization
# back to the fixture set: anything in it that is not one of the ids below is
# deleted, and it says how many rows it dropped. Nothing outside the QA
# organization is ever touched.
#
# All QA ids start with 9. Demo ids from geoerp's own supabase/seed.sql start
# with a/b/c/d/e/f, so a glance at an id says which dataset a row came from:
#
#   90000000-…  organization        95000000-…  services
#   91000000-…  users               96000000-…  pre-existing damages
#   92000000-…  client              97000000-…  crew
#   93000000-…  project
#   94000000-…  line segments
#
# QA lives in its own organization, so RLS (`current_user_org()`) keeps the
# demo dataset out of the QA user's view and the counts stay deterministic.
#
# TARGET. Defaults to the local stack at http://127.0.0.1:54321 and refuses
# geoerp production outright. geoerp has no staging project today — the mobile
# QA environment is GRA-973 — so a local stack is the only safe target. When
# one exists, point SUPABASE_URL at it and set SEED_QA_ALLOW_REMOTE=1.
#
# ENVIRONMENT (all optional against a running local stack)
#   SUPABASE_URL                default http://127.0.0.1:54321
#   SUPABASE_SERVICE_ROLE_KEY   from `supabase status` in $GEOERP_DIR if unset
#   SUPABASE_ANON_KEY           idem — used to verify sign-in the way the app does
#   GEOERP_DIR                  default ../geoerp (same convention as sync-types.sh)
#   QA_PASSWORD                 default QaMovil123! — required for a remote target,
#                               because that default is published right here
#   SEED_QA_ALLOW_REMOTE        1 to allow a non-localhost target
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MOBILE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

PRODUCTION_REF="vwyfkqjhawrycskuqbpw"       # GeoERP production — never a target
GEOERP_DIR="${GEOERP_DIR:-$MOBILE_ROOT/../geoerp}"
QA_PASSWORD_SET="${QA_PASSWORD:-}"            # empty means "taking the default"
QA_PASSWORD="${QA_PASSWORD:-QaMovil123!}"

TEARDOWN=0
case "${1:-}" in
  --help|-h)   sed -n '2,/^# ===/p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
  --teardown)  TEARDOWN=1 ;;
  "")          ;;
  *)           echo "ERROR: unknown argument '$1'. Try --help." >&2; exit 1 ;;
esac

need() { command -v "$1" >/dev/null || { echo "ERROR: '$1' not found" >&2; exit 1; }; }
need curl; need python3

jget() { python3 -c "import sys,json;d=json.load(sys.stdin);$1"; }

# A quote or a backslash in QA_PASSWORD would otherwise break every body it
# goes into, so encode it once as a JSON string (quotes included).
json_str() { printf '%s' "$1" | python3 -c 'import sys,json;print(json.dumps(sys.stdin.read()))'; }

QA_PASSWORD_JSON="$(json_str "$QA_PASSWORD")"

# ── Resolve the target and its keys ─────────────────────────────────────────
API_URL="${SUPABASE_URL:-}"
SERVICE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-}"
ANON_KEY="${SUPABASE_ANON_KEY:-}"

if [[ -z "$API_URL" || -z "$SERVICE_KEY" || -z "$ANON_KEY" ]]; then
  if [[ ! -f "$GEOERP_DIR/supabase/config.toml" ]]; then
    echo "ERROR: no keys in the environment and no Supabase project at $GEOERP_DIR." >&2
    echo "       Clone Techingenius/geoerp next to this repo, or set SUPABASE_URL," >&2
    echo "       SUPABASE_SERVICE_ROLE_KEY and SUPABASE_ANON_KEY yourself." >&2
    exit 1
  fi
  need supabase
  echo "Reading the local stack's keys from \`supabase status\` in $GEOERP_DIR..."
  # `supabase status` prints service notices around the JSON, so take the object.
  STATUS_JSON="$(cd "$GEOERP_DIR" && supabase status -o json 2>/dev/null \
    | python3 -c 'import sys;s=sys.stdin.read();print(s[s.index("{"):s.rindex("}")+1])')" || {
      echo "ERROR: could not read \`supabase status\`. Is the stack running (supabase start)?" >&2
      exit 1; }
  API_URL="${API_URL:-$(printf '%s' "$STATUS_JSON" | jget "print(d.get('API_URL',''))")}"
  SERVICE_KEY="${SERVICE_KEY:-$(printf '%s' "$STATUS_JSON" | jget "print(d.get('SERVICE_ROLE_KEY',''))")}"
  ANON_KEY="${ANON_KEY:-$(printf '%s' "$STATUS_JSON" | jget "print(d.get('ANON_KEY',''))")}"
fi

API_URL="${API_URL%/}"
[[ -n "$API_URL" && -n "$SERVICE_KEY" && -n "$ANON_KEY" ]] || {
  echo "ERROR: missing API URL, service_role key or anon key." >&2; exit 1; }

if [[ "$API_URL" == *"$PRODUCTION_REF"* ]]; then
  echo "REFUSING: $API_URL is GeoERP production. QA data does not go there." >&2
  echo "          A real mobile QA environment is GRA-973." >&2
  exit 1
fi
# Compare the parsed host, not a substring of the URL: `localhost.example.com`
# and `https://supabase.co/?127.0.0.1` both contain a local-looking needle.
API_HOST="$(printf '%s' "$API_URL" | python3 -c '
import sys
from urllib.parse import urlsplit
print((urlsplit(sys.stdin.read().strip()).hostname or "").lower())')"
case "$API_HOST" in
  127.0.0.1|localhost|::1|0.0.0.0) IS_LOCAL=1 ;;
  *)                               IS_LOCAL=0 ;;
esac
if [[ "$IS_LOCAL" == 0 && "${SEED_QA_ALLOW_REMOTE:-0}" != "1" ]]; then
  echo "REFUSING: ${API_HOST:-$API_URL} is not a local stack. Set SEED_QA_ALLOW_REMOTE=1" >&2
  echo "          if you really mean to seed a shared database." >&2
  exit 1
fi
# The default password is published in this file, so it is fine for a stack only
# you can reach and not for one anybody can.
if [[ "$IS_LOCAL" == 0 && -z "${QA_PASSWORD_SET:-}" ]]; then
  echo "REFUSING: a shared target needs an explicit QA_PASSWORD. The default is" >&2
  echo "          public in this script, and these accounts are created confirmed." >&2
  exit 1
fi

echo "Target: $API_URL"

# ── HTTP helpers ────────────────────────────────────────────────────────────
# Every call fails loudly: a half-seeded database that reports success is worse
# than no seed at all, because QA then tests against it.
req() {  # method path [body] → body on stdout, using the service_role key
  local method="$1" path="$2" body="${3:-}" raw code
  raw="$(curl -sS -X "$method" "${API_URL}${path}" \
    -H "apikey: ${SERVICE_KEY}" -H "Authorization: Bearer ${SERVICE_KEY}" \
    -H "Content-Type: application/json" \
    -H "Prefer: resolution=merge-duplicates,return=representation" \
    ${body:+-d "$body"} -w $'\n%{http_code}')"
  code="${raw##*$'\n'}"
  raw="${raw%$'\n'*}"
  if [[ "$code" != 2* ]]; then
    echo "ERROR: $method $path → HTTP $code" >&2
    echo "       $raw" >&2
    exit 1
  fi
  printf '%s' "$raw"
}

# PostgREST rejects a bulk insert whose objects do not all carry the same keys
# (PGRST102), so every array below spells out every column, null included.
upsert() {  # table json  (single object or array of objects)
  local out n
  out="$(req POST "/rest/v1/$1?on_conflict=id" "$2")"
  n="$(printf '%s' "$out" | jget "print(len(d))")"
  printf '  %-22s %s row(s)\n' "$1" "$n"
}

# Same fail-loud contract as req(): a password rotation that quietly 4xx'd
# would leave the account on an unknown credential and only surface as a
# puzzling sign-in failure later. `allow` lists codes the caller handles.
auth_admin() {  # method path [body] [allow-code]
  local method="$1" path="$2" body="${3:-}" allow="${4:-}" raw code
  raw="$(curl -sS -X "$method" "${API_URL}/auth/v1${path}" \
    -H "apikey: ${SERVICE_KEY}" -H "Authorization: Bearer ${SERVICE_KEY}" \
    -H "Content-Type: application/json" ${body:+-d "$body"} -w $'\n%{http_code}')"
  code="${raw##*$'\n'}"
  raw="${raw%$'\n'*}"
  if [[ "$code" != 2* && "$code" != "$allow" ]]; then
    echo "ERROR: $method /auth/v1$path → HTTP $code" >&2
    echo "       $raw" >&2
    exit 1
  fi
  printf '%s' "$raw"
}

# The fixture id is the normal case, so ask for it directly; the email search
# only covers an account that predates the fixed ids.
find_user() {  # want-id email → id or empty
  local by_id
  by_id="$(auth_admin GET "/admin/users/$1" "" 404 | jget "print(d.get('id','') if d.get('email')=='$2' else '')")"
  if [[ -n "$by_id" ]]; then printf '%s' "$by_id"; return; fi
  auth_admin GET "/admin/users?filter=$2&per_page=100" | jget "
m=[u['id'] for u in d.get('users',[]) if u.get('email')=='$2']
print(m[0] if m else '')"
}

# ── Fixture ids ─────────────────────────────────────────────────────────────
QA_ORG="90000000-0000-0000-0000-000000000001"
QA_OPERATOR="91000000-0000-0000-0000-000000000001"
QA_TRINCHERO="91000000-0000-0000-0000-000000000002"
QA_CLIENT="92000000-0000-0000-0000-000000000001"
QA_PROJECT="93000000-0000-0000-0000-000000000001"
QA_SEGMENT_1="94000000-0000-0000-0000-000000000001"
QA_SEGMENT_2="94000000-0000-0000-0000-000000000002"
QA_CREW="97000000-0000-0000-0000-000000000001"

QA_OPERATOR_EMAIL="qa-operador@geoerp.local"
QA_TRINCHERO_EMAIL="qa-trinchero@geoerp.local"

FIXTURE_SERVICES="95000000-0000-0000-0000-000000000001,95000000-0000-0000-0000-000000000002,95000000-0000-0000-0000-000000000003,95000000-0000-0000-0000-000000000004,95000000-0000-0000-0000-000000000005,95000000-0000-0000-0000-000000000006"
FIXTURE_SEGMENTS="${QA_SEGMENT_1},${QA_SEGMENT_2}"
FIXTURE_DAMAGES="96000000-0000-0000-0000-000000000001"

# ── 0. Prune the QA organization back to the fixture set ────────────────────
# A QA session writes into this project: a created service, a reported
# production entry, a photo. None of that is a fixture, so leaving it in place
# would break the counts for good and send us back to deleting rows by hand.
# Everything below is scoped to the QA organization's own projects — read from
# the database, not assumed — so no query can reach the demo dataset even if a
# fixture id were wrong.
#
# --teardown runs the same walk with the keep-filters empty, and then removes
# the crew, projects, client, users and the organization itself.
if [[ "$TEARDOWN" == 1 ]]; then
  KEEP_SERVICES=""; KEEP_SEGMENTS=""; KEEP_DAMAGES=""; KEEP_PROJECTS=""
  echo "Teardown — removing the QA dataset from $API_URL..."
else
  KEEP_SERVICES="&id=not.in.(${FIXTURE_SERVICES})"
  KEEP_SEGMENTS="&id=not.in.(${FIXTURE_SEGMENTS})"
  KEEP_DAMAGES="&id=not.in.(${FIXTURE_DAMAGES})"
  KEEP_PROJECTS="&id=not.in.(${QA_PROJECT})"
  echo "Pruning the QA organization back to the fixture set..."
fi

PRUNED=0
prune() {  # label path
  local out n
  out="$(req DELETE "$2")"
  n="$(printf '%s' "$out" | jget "print(len(d))")"
  if [[ "$n" != "0" ]]; then
    printf '  %-22s %s row(s) deleted\n' "$1" "$n"
    PRUNED=$((PRUNED + n))
  fi
}

id_list() {  # path with select=id → comma-separated ids, empty if none
  local out
  out="$(req GET "$1")"
  printf '%s' "$out" | jget "print(','.join(r['id'] for r in d))"
}

QA_PROJECT_IDS="$(id_list "/rest/v1/projects?select=id&organization_id=eq.${QA_ORG}")"
if [[ -n "$QA_PROJECT_IDS" ]]; then
  # service_photos and damage_photos cascade when their parent goes, but a
  # tester's photos hang off rows we keep, so they are deleted on their own.
  QA_SERVICE_IDS="$(id_list "/rest/v1/services?select=id&project_id=in.(${QA_PROJECT_IDS})")"
  [[ -z "$QA_SERVICE_IDS" ]] || prune service_photos "/rest/v1/service_photos?service_id=in.(${QA_SERVICE_IDS})"
  # Deleting the entries cascades crew_members and production_entry_history,
  # and it has to happen before the segments they point at.
  prune production_entries "/rest/v1/production_entries?project_id=in.(${QA_PROJECT_IDS})"
  QA_DAMAGE_IDS="$(id_list "/rest/v1/pre_existing_damages?select=id&project_id=in.(${QA_PROJECT_IDS})")"
  [[ -z "$QA_DAMAGE_IDS" ]] || prune damage_photos "/rest/v1/damage_photos?damage_id=in.(${QA_DAMAGE_IDS})"
  prune pre_existing_damages "/rest/v1/pre_existing_damages?project_id=in.(${QA_PROJECT_IDS})${KEEP_DAMAGES}"
  prune services "/rest/v1/services?project_id=in.(${QA_PROJECT_IDS})${KEEP_SERVICES}"
  prune line_segments "/rest/v1/line_segments?project_id=in.(${QA_PROJECT_IDS})${KEEP_SEGMENTS}"
  # Same reason as the photos above, for the segments that survive: these are
  # written from the web admin today and from mobile once GRA-829 lands.
  QA_SEGMENT_IDS="$(id_list "/rest/v1/line_segments?select=id&project_id=in.(${QA_PROJECT_IDS})")"
  if [[ -n "$QA_SEGMENT_IDS" ]]; then
    prune segment_photos "/rest/v1/segment_photos?segment_id=in.(${QA_SEGMENT_IDS})"
    prune segment_activities "/rest/v1/line_segment_activities?line_segment_id=in.(${QA_SEGMENT_IDS})"
  fi
  prune projects "/rest/v1/projects?organization_id=eq.${QA_ORG}${KEEP_PROJECTS}"
fi

QA_CREW_IDS="$(id_list "/rest/v1/crews?select=id&organization_id=eq.${QA_ORG}")"
if [[ -n "$QA_CREW_IDS" ]]; then
  if [[ "$TEARDOWN" == 1 ]]; then
    prune crews "/rest/v1/crews?organization_id=eq.${QA_ORG}"
  else
    prune crews "/rest/v1/crews?organization_id=eq.${QA_ORG}&id=not.in.(${QA_CREW})"
    prune crew_default_members "/rest/v1/crew_default_members?crew_id=eq.${QA_CREW}&user_id=not.in.(${QA_OPERATOR},${QA_TRINCHERO})"
  fi
fi

if [[ "$TEARDOWN" == 1 ]]; then
  prune clients "/rest/v1/clients?organization_id=eq.${QA_ORG}"
  # user_profiles and user_roles cascade from auth.users.
  for email in "$QA_OPERATOR_EMAIL" "$QA_TRINCHERO_EMAIL"; do
    case "$email" in
      "$QA_OPERATOR_EMAIL")  uid="$(find_user "$QA_OPERATOR" "$email")" ;;
      *)                     uid="$(find_user "$QA_TRINCHERO" "$email")" ;;
    esac
    if [[ -n "$uid" ]]; then
      auth_admin DELETE "/admin/users/${uid}" >/dev/null
      printf '  %-22s %s\n' "auth user deleted" "$email"
    fi
  done
  prune organizations "/rest/v1/organizations?id=eq.${QA_ORG}"
  echo "Teardown done. Run the script with no arguments to build the dataset again."
  exit 0
fi

if [[ "$PRUNED" == "0" ]]; then
  echo "  nothing to prune"
else
  echo "  ${PRUNED} non-fixture row(s) removed"
fi

# ── 1. Organization ─────────────────────────────────────────────────────────
# Inserting an organization fires the triggers that create its four default
# roles (admin / supervisor / operator / trinchero) and its task types.
echo "Organization..."
upsert organizations "{\"id\":\"${QA_ORG}\",\"name\":\"qa-GeoERP Movil\",\"slug\":\"qa-geoerp-movil\"}"

# ── 2. QA users ─────────────────────────────────────────────────────────────
# handle_new_user() builds the user_profiles row from user_metadata, so the
# organization has to be in place first. The profile is upserted afterwards
# anyway, which is what repairs a user left over from an earlier run.
seed_user() {  # id email full_name role_name → echoes the id actually in use
  local want_id="$1" email="$2" full_name="$3" role="$4" user_id role_id
  local meta="{\"full_name\":\"${full_name}\",\"organization_id\":\"${QA_ORG}\"}"

  user_id="$(find_user "$want_id" "$email")"

  if [[ -z "$user_id" ]]; then
    user_id="$(auth_admin POST /admin/users \
      "{\"id\":\"${want_id}\",\"email\":\"${email}\",\"password\":${QA_PASSWORD_JSON},\"email_confirm\":true,\"user_metadata\":${meta}}" \
      | jget "
if not d.get('id'): sys.exit('create failed: '+json.dumps(d))
print(d['id'])")"
  else
    auth_admin PUT "/admin/users/${user_id}" \
      "{\"password\":${QA_PASSWORD_JSON},\"email_confirm\":true,\"user_metadata\":${meta}}" >/dev/null
  fi

  req POST "/rest/v1/user_profiles?on_conflict=id" \
    "{\"id\":\"${user_id}\",\"organization_id\":\"${QA_ORG}\",\"full_name\":\"${full_name}\",\"is_active\":true}" >/dev/null

  local roles_json
  roles_json="$(req GET "/rest/v1/roles?select=id&organization_id=eq.${QA_ORG}&name=eq.${role}")"
  role_id="$(printf '%s' "$roles_json" | jget "
if not d: sys.exit('role ${role} not found in the QA org')
print(d[0]['id'])")"
  # Drop any role this user picked up in an earlier run before granting this one,
  # so the grant is a state, not an accumulation.
  req DELETE "/rest/v1/user_roles?user_id=eq.${user_id}&role_id=neq.${role_id}" >/dev/null
  req POST "/rest/v1/user_roles?on_conflict=user_id,role_id" \
    "{\"user_id\":\"${user_id}\",\"role_id\":\"${role_id}\"}" >/dev/null

  printf '%s' "$user_id"
}

echo "Users..."
QA_OPERATOR="$(seed_user "$QA_OPERATOR" "$QA_OPERATOR_EMAIL" "qa-Operador Movil" operator)"
printf '  %-22s %s (operator)\n' "$QA_OPERATOR_EMAIL" "$QA_OPERATOR"
QA_TRINCHERO="$(seed_user "$QA_TRINCHERO" "$QA_TRINCHERO_EMAIL" "qa-Trinchero Movil" trinchero)"
printf '  %-22s %s (trinchero)\n' "$QA_TRINCHERO_EMAIL" "$QA_TRINCHERO"

# ── 3. Client and project ───────────────────────────────────────────────────
echo "Client and project..."
upsert clients "{\"id\":\"${QA_CLIENT}\",\"organization_id\":\"${QA_ORG}\",\"name\":\"qa-Cliente Movil\",\"short_name\":\"qa-CM\",\"status\":\"active\",\"created_by\":\"${QA_OPERATOR}\"}"
upsert projects "{\"id\":\"${QA_PROJECT}\",\"organization_id\":\"${QA_ORG}\",\"client_id\":\"${QA_CLIENT}\",\"name\":\"qa-Proyecto Movil\",\"description\":\"Datos fijos para QA de la app de campo. Generado por scripts/seed-qa.sh.\",\"status\":\"active\",\"start_date\":\"2026-01-06\",\"target_end_date\":\"2026-12-31\",\"created_by\":\"${QA_OPERATOR}\"}"

# ── 4. Line segments ────────────────────────────────────────────────────────
# Caracas, a few blocks east of the demo dataset, so the two never overlap on
# the map while both stay inside the same city view.
echo "Line segments..."
SEGMENTS_JSON=$(cat <<JSON
[
  {"id":"${QA_SEGMENT_1}","project_id":"${QA_PROJECT}","name":"qa-Tramo 1","description":"Tramo con servicios en los tres estados","geometry":"SRID=4326;LINESTRING(-66.88 10.5,-66.8785 10.5005,-66.877 10.501)","created_by":"${QA_OPERATOR}"},
  {"id":"${QA_SEGMENT_2}","project_id":"${QA_PROJECT}","name":"qa-Tramo 2","description":"Tramo sin servicios abiertos","geometry":"SRID=4326;LINESTRING(-66.877 10.501,-66.8755 10.5015,-66.874 10.502)","created_by":"${QA_OPERATOR}"}
]
JSON
)
upsert line_segments "$SEGMENTS_JSON"

# ── 5. Services ─────────────────────────────────────────────────────────────
# One of every status the app can render, and four of the six service types,
# so the map legend and the status filters all have something to show.
echo "Services..."
# Every nullable column the app or the web admin can write is spelled out,
# null included: merge-duplicates only overwrites the keys it is given, so a
# column left out would keep whatever a tester put there.
SERVICES_JSON=$(cat <<JSON
[
  {"id":"95000000-0000-0000-0000-000000000001","project_id":"${QA_PROJECT}","line_segment_id":"${QA_SEGMENT_1}","service_type":"gas","status":"to_open","notes":"qa-Servicio pendiente de abrir","depth_feet":4,"drill_depth_feet":null,"geometry":"SRID=4326;POINT(-66.8798 10.5001)","service_line":null,"created_by":"${QA_OPERATOR}","opened_by":null,"marked_by":null},
  {"id":"95000000-0000-0000-0000-000000000002","project_id":"${QA_PROJECT}","line_segment_id":"${QA_SEGMENT_1}","service_type":"power","status":"to_open","notes":"qa-Servicio pendiente de abrir","depth_feet":3,"drill_depth_feet":null,"geometry":"SRID=4326;POINT(-66.8792 10.5003)","service_line":null,"created_by":"${QA_OPERATOR}","opened_by":null,"marked_by":null},
  {"id":"95000000-0000-0000-0000-000000000003","project_id":"${QA_PROJECT}","line_segment_id":"${QA_SEGMENT_1}","service_type":"water","status":"to_open","notes":"qa-Servicio pendiente de abrir","depth_feet":null,"drill_depth_feet":null,"geometry":"SRID=4326;POINT(-66.8786 10.5005)","service_line":null,"created_by":"${QA_OPERATOR}","opened_by":null,"marked_by":null},
  {"id":"95000000-0000-0000-0000-000000000004","project_id":"${QA_PROJECT}","line_segment_id":"${QA_SEGMENT_1}","service_type":"telecom","status":"found","notes":"qa-Servicio ubicado con foto","depth_feet":5,"drill_depth_feet":null,"geometry":"SRID=4326;POINT(-66.878 10.5007)","service_line":null,"created_by":"${QA_OPERATOR}","opened_by":"${QA_TRINCHERO}","marked_by":null},
  {"id":"95000000-0000-0000-0000-000000000005","project_id":"${QA_PROJECT}","line_segment_id":"${QA_SEGMENT_2}","service_type":"gas","status":"found","notes":"qa-Servicio ubicado con foto","depth_feet":6,"drill_depth_feet":null,"geometry":"SRID=4326;POINT(-66.8762 10.5012)","service_line":null,"created_by":"${QA_OPERATOR}","opened_by":"${QA_TRINCHERO}","marked_by":null},
  {"id":"95000000-0000-0000-0000-000000000006","project_id":"${QA_PROJECT}","line_segment_id":"${QA_SEGMENT_2}","service_type":"sewer","status":"not_found","notes":"qa-Servicio no encontrado en sitio","depth_feet":null,"drill_depth_feet":null,"geometry":"SRID=4326;POINT(-66.8748 10.5017)","service_line":null,"created_by":"${QA_OPERATOR}","opened_by":"${QA_TRINCHERO}","marked_by":null}
]
JSON
)
upsert services "$SERVICES_JSON"

# ── 6. Pre-existing damage ──────────────────────────────────────────────────
echo "Pre-existing damages..."
DAMAGES_JSON=$(cat <<JSON
[
  {"id":"96000000-0000-0000-0000-000000000001","project_id":"${QA_PROJECT}","segment_id":"${QA_SEGMENT_1}","damage_type":"broken_sidewalk","severity":"medium","status":"reported","description":"qa-Acera partida antes de iniciar el tramo","geometry":"SRID=4326;POINT(-66.8794 10.5002)","reported_by":"${QA_TRINCHERO}"}
]
JSON
)
upsert pre_existing_damages "$DAMAGES_JSON"

# ── 7. Crew and its standing roster ─────────────────────────────────────────
# The production form pre-fills who worked from crew_default_members; without a
# roster that screen cannot be exercised at all.
echo "Crew..."
upsert crews "{\"id\":\"${QA_CREW}\",\"organization_id\":\"${QA_ORG}\",\"name\":\"qa-Cuadrilla Movil\",\"lead_user_id\":\"${QA_OPERATOR}\",\"is_active\":true,\"created_by\":\"${QA_OPERATOR}\"}"
MEMBERS_JSON=$(cat <<JSON
[
  {"id":"97100000-0000-0000-0000-000000000001","crew_id":"${QA_CREW}","user_id":"${QA_OPERATOR}"},
  {"id":"97100000-0000-0000-0000-000000000002","crew_id":"${QA_CREW}","user_id":"${QA_TRINCHERO}"}
]
JSON
)
upsert crew_default_members "$MEMBERS_JSON"

# ── 8. Verify as the app does ───────────────────────────────────────────────
# Signing in with the anon key and counting through RLS is what makes this a
# seed and not just a set of inserts: it proves the field user can actually
# reach the rows, and it is the check that catches a duplicate. The counts are
# fixed, so a second run that doubled anything exits non-zero right here.
echo "Verifying as ${QA_OPERATOR_EMAIL} (anon key, same path as the app)..."
LOGIN="$(curl -sS -X POST "${API_URL}/auth/v1/token?grant_type=password" \
  -H "apikey: ${ANON_KEY}" -H "Content-Type: application/json" \
  -d "{\"email\":\"${QA_OPERATOR_EMAIL}\",\"password\":${QA_PASSWORD_JSON}}")"
TOKEN="$(printf '%s' "$LOGIN" | jget "print(d.get('access_token',''))")"
[[ -n "$TOKEN" ]] || { echo "ERROR: sign-in failed: ${LOGIN}" >&2; exit 1; }

as_user() {  # path → row count
  curl -sS "${API_URL}/rest/v1$1" \
    -H "apikey: ${ANON_KEY}" -H "Authorization: Bearer ${TOKEN}" \
    | jget "print(len(d) if isinstance(d, list) else 'not-a-list: '+json.dumps(d))"
}

FAILED=0
expect() {  # label expected actual
  if [[ "$2" == "$3" ]]; then
    printf '  %-26s %s\n' "$1" "$3"
  else
    printf '  %-26s %s  EXPECTED %s\n' "$1" "$3" "$2"
    FAILED=1
  fi
}
expect "projects"             1 "$(as_user "/projects?select=id")"
expect "line_segments"        2 "$(as_user "/line_segments?select=id&project_id=eq.${QA_PROJECT}")"
expect "services"             6 "$(as_user "/services?select=id&project_id=eq.${QA_PROJECT}")"
expect "services to_open"     3 "$(as_user "/services?select=id&project_id=eq.${QA_PROJECT}&status=eq.to_open")"
expect "pre_existing_damages" 1 "$(as_user "/pre_existing_damages?select=id&project_id=eq.${QA_PROJECT}")"
expect "crews (active)"       1 "$(as_user "/crews?select=id&is_active=eq.true")"
expect "crew_default_members" 2 "$(as_user "/crew_default_members?select=user_id&crew_id=eq.${QA_CREW}")"

if [[ "$FAILED" != "0" ]]; then
  echo "FAILED: the QA dataset is not what it should be. Do not test against it." >&2
  exit 1
fi

cat <<EOF

QA dataset ready on ${API_URL}

  Project       qa-Proyecto Movil (${QA_PROJECT})
  Sign in       ${QA_OPERATOR_EMAIL} / ${QA_PASSWORD}   (operator)
                ${QA_TRINCHERO_EMAIL} / ${QA_PASSWORD}  (trinchero)

Point the app at this stack — a device or emulator needs the host's LAN
address here, not 127.0.0.1:

  EXPO_PUBLIC_SUPABASE_URL=${API_URL}
  EXPO_PUBLIC_SUPABASE_ANON_KEY=${ANON_KEY}

Then restart Expo with a cleared cache: npx expo start --clear
EOF
