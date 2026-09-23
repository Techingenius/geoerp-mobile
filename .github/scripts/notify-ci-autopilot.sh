#!/usr/bin/env bash
#
# GRA-661 - post exactly ONE aggregate CI notification per push.
#
# Why this exists: the CI autopilots used to be driven by a repository
# `check_suite` webhook. GitHub opens a separate check suite per workflow run
# and per external app (Netlify, Railway, ...), so one push delivered 3-8
# `check_suite.completed` deliveries and each one booted a full agent run that
# loaded the whole project brief before deciding it had nothing to do. 1,494 of
# those runs never touched an issue.
#
# This script is the replacement trigger. It is invoked from a terminal CI job
# that only runs once per push, waits for every other check on the commit to
# reach a terminal state, and then POSTs one payload carrying the aggregate the
# agent previously had to reconstruct with `gh pr checks`.
#
# Required env:
#   AUTOPILOT_WEBHOOK_URL  target webhook. EMPTY IS NOT AN ERROR - fork PRs get
#                          no secrets, and a fork PR must not fail CI over a
#                          notification it was never allowed to send.
#   GH_TOKEN               token with checks:read, statuses:read, pull-requests:read
#   REPO                   owner/name
#   HEAD_SHA               commit the checks belong to
# Optional env:
#   PR_NUMBER              resolved from HEAD_BRANCH when empty
#   HEAD_BRANCH, BASE_BRANCH
#   SELF_CHECK_NAME        this job's own check-run name, excluded from the
#                          settle test - including it deadlocks the job on
#                          itself. Defaults to the Actions job name.
#   SETTLE_TIMEOUT_SECONDS  default 600
#   SETTLE_INTERVAL_SECONDS default 15
#
set -euo pipefail

REPO="${REPO:?REPO is required}"
HEAD_SHA="${HEAD_SHA:?HEAD_SHA is required}"
PR_NUMBER="${PR_NUMBER:-}"
HEAD_BRANCH="${HEAD_BRANCH:-}"
BASE_BRANCH="${BASE_BRANCH:-}"
SELF_CHECK_NAME="${SELF_CHECK_NAME:-${GITHUB_JOB:-notify-autopilot}}"
SETTLE_TIMEOUT_SECONDS="${SETTLE_TIMEOUT_SECONDS:-600}"
SETTLE_INTERVAL_SECONDS="${SETTLE_INTERVAL_SECONDS:-15}"

if [ -z "${AUTOPILOT_WEBHOOK_URL:-}" ]; then
  echo "::notice::AUTOPILOT_WEBHOOK_URL is not set (fork PR, or the repo secret is absent). Nothing to notify."
  exit 0
fi

# --- Collect the state of every check on this commit -------------------------
# Both surfaces matter: GitHub Actions and the Netlify/Railway apps publish
# check runs, while some integrations only publish legacy commit statuses. An
# aggregate that reads one and not the other reports "all green" while the
# other surface is still running - the exact false positive the old webhook
# produced.
collect() {
  # A push to a PR branch produces two cohorts of runs with identical job names
  # (one for `push`, one for `pull_request`), so `sort_at` is carried here and
  # used below to keep the newest per name - the same rule branch protection
  # applies when it decides which run counts.
  gh api --paginate "repos/$REPO/commits/$HEAD_SHA/check-runs" \
    --jq '.check_runs[] | {name: .name, kind: "check_run", status: .status, conclusion: .conclusion, app: (.app.slug // "unknown"), url: .html_url, sort_at: (.completed_at // .started_at // "")}' \
    2>/dev/null || true
  # Combined status, not /statuses: the raw list returns every historical
  # update newest-first, so picking an entry out of it reports a stale state.
  # The combined endpoint already collapses each context to its latest value.
  gh api "repos/$REPO/commits/$HEAD_SHA/status" \
    --jq '.statuses[] | {name: .context, kind: "status", status: (if .state == "pending" then "in_progress" else "completed" end), conclusion: (if .state == "pending" then null elif .state == "success" then "success" else "failure" end), app: "commit-status", url: .target_url, sort_at: (.updated_at // "")}' \
    2>/dev/null || true
}

# Drop this job's own check run so it does not wait on itself, then collapse
# each check name to its newest entry.
dedupe() {
  jq -s --arg self "$SELF_CHECK_NAME" '
    map(select(.name != $self))
    | sort_by(.sort_at)
    | group_by(.kind + " " + .name)
    | map(.[-1])
    | sort_by(.name)
  '
}

deadline=$(( $(date +%s) + SETTLE_TIMEOUT_SECONDS ))
settled=false
checks='[]'

while :; do
  checks="$(collect | dedupe)"
  pending="$(printf '%s' "$checks" | jq -c '[.[] | select(.status != "completed")]')"
  pending_count="$(printf '%s' "$pending" | jq 'length')"

  if [ "$pending_count" -eq 0 ]; then
    settled=true
    break
  fi
  if [ "$(date +%s)" -ge "$deadline" ]; then
    echo "::warning::Timed out after ${SETTLE_TIMEOUT_SECONDS}s with ${pending_count} check(s) still running. Notifying anyway with all_checks_settled=false so the autopilot is never left without a trigger."
    break
  fi
  echo "Waiting on ${pending_count} check(s): $(printf '%s' "$pending" | jq -r '[.[].name] | join(", ")')"
  sleep "$SETTLE_INTERVAL_SECONDS"
done

# --- Aggregate ---------------------------------------------------------------
# `skipped` and `neutral` count as success: branch protection treats them that
# way, so an aggregate that called them failures would contradict the merge
# button the agent is deciding about.
conclusion="$(printf '%s' "$checks" | jq -r '
  [.[] | .conclusion] as $c
  | if ($c | map(select(. == "failure" or . == "timed_out" or . == "action_required" or . == "startup_failure" or . == "stale")) | length) > 0 then "failure"
    elif ($c | map(select(. == "cancelled")) | length) > 0 then "cancelled"
    elif ($c | map(select(. == null)) | length) > 0 then "incomplete"
    else "success" end
')"

# --- Resolve the PR ----------------------------------------------------------
if [ -z "$PR_NUMBER" ] && [ -n "$HEAD_BRANCH" ]; then
  PR_NUMBER="$(gh pr list --repo "$REPO" --head "$HEAD_BRANCH" --state open \
    --json number --jq '.[0].number // empty' 2>/dev/null || true)"
fi
if [ -z "$PR_NUMBER" ]; then
  echo "::notice::No open PR for ${HEAD_BRANCH:-$HEAD_SHA}. The autopilot only acts on open PRs, so there is nothing to notify."
  exit 0
fi
if [ -z "$BASE_BRANCH" ]; then
  BASE_BRANCH="$(gh pr view "$PR_NUMBER" --repo "$REPO" --json baseRefName --jq .baseRefName 2>/dev/null || true)"
fi

payload="$(jq -n \
  --arg event "ci_complete" \
  --arg repo "$REPO" \
  --arg sha "$HEAD_SHA" \
  --arg branch "$HEAD_BRANCH" \
  --arg base "$BASE_BRANCH" \
  --arg conclusion "$conclusion" \
  --argjson pr "$PR_NUMBER" \
  --argjson settled "$settled" \
  --arg run_url "${GITHUB_SERVER_URL:-https://github.com}/${REPO}/actions/runs/${GITHUB_RUN_ID:-0}" \
  --argjson checks "$checks" \
  '{event: $event, repo: $repo, pr: $pr, branch: $branch, base: $base, sha: $sha,
    conclusion: $conclusion, all_checks_settled: $settled, notifier_run_url: $run_url,
    checks: $checks}')"

echo "Aggregate for ${REPO}#${PR_NUMBER} @ ${HEAD_SHA:0:7}: ${conclusion} (settled=${settled}, $(printf '%s' "$checks" | jq 'length') checks)"
printf '%s' "$payload" | jq '{event, repo, pr, branch, base, sha, conclusion, all_checks_settled, checks: [.checks[] | {name, conclusion}]}'

if [ "${DRY_RUN:-}" = "true" ]; then
  echo "::notice::DRY_RUN=true - aggregate computed, webhook not sent."
  exit 0
fi

# --- Deliver -----------------------------------------------------------------
# The URL carries the autopilot token, so it is passed through a curl config
# file rather than the command line: that keeps it out of the process table and
# out of any `set -x` trace.
umask 077
conf="$(mktemp)"
trap 'rm -f "$conf"' EXIT
printf 'url = "%s"\n' "$AUTOPILOT_WEBHOOK_URL" > "$conf"

for attempt in 1 2 3; do
  if printf '%s' "$payload" | curl --silent --show-error --fail-with-body \
      --config "$conf" \
      --request POST \
      --header 'content-type: application/json' \
      --data-binary @- \
      --max-time 30; then
    echo
    echo "::notice::Notified the CI autopilot once for ${REPO}#${PR_NUMBER} @ ${HEAD_SHA:0:7} - conclusion=${conclusion}."
    exit 0
  fi
  echo "::warning::Webhook POST attempt ${attempt}/3 failed."
  sleep $(( attempt * 5 ))
done

echo "::error::Could not deliver the CI-complete webhook after 3 attempts. The autopilot will not see this push."
exit 1
