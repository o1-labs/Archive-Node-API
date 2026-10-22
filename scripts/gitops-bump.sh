#!/usr/bin/env bash
# Moves one network of archive-node-api on hetzner-rivendell-1 to a release, through a pull
# request on o1-labs/gitops-infrastructure (GI). .github/workflows/deploy-gitops.yaml runs it
# for devnet and then mainnet; see docs/versioning.md "Releasing".
#
#   gitops-bump.sh --network devnet|mainnet --version X.Y.Z --digest sha256:<64 hex>
#                  --gi-dir <GI checkout> [--merge] [--strict] [--dry-run]
#
# The pull request changes exactly two lines of
# platform/hetzner-rivendell-1/applications/archive-node-api/image-<net>.yaml:
# <net>.image.tag and <net>.image.digest. Merging it is the deploy (Argo CD syncs GI main).
#   --merge    devnet only: merge the pull request here, through the App's bypass of GI
#              main's review. Mainnet is only ever opened and waits for an approval.
#   --strict   refuse a version lower than what GI main runs (a dispatch); without it that
#              is a warning and skipped-ahead (a tag build re-run after a newer release).
#   --dry-run  edit and commit in the GI checkout, but push, open, merge, close and delete
#              nothing; report the result a real run would give.
#
# Every exit 0 writes exactly one result= line (and pr_url=) to $GITHUB_OUTPUT, and one line
# to $GITHUB_STEP_SUMMARY, when those are set:
#   merged               devnet: its pull request was merged (opened now, or already open)
#   opened               mainnet: a pull request was opened
#   noop                 GI main already runs this version and digest
#   reused               mainnet: an open pull request already holds exactly this change
#   skipped-ahead        GI main runs a newer version
#   rejected             this version's pull request was closed unmerged, or merged and
#                        later undone by hand: a person decided, so nothing is re-opened
#   skipped-higher-open  mainnet: a pull request for a newer version is already open
# Exit 1: refused or failed (::error::), nothing pushed after the failing check. Exit 2: usage.
#
# Environment: GH_TOKEN for gh (the App's installation token in CI); GITOPS_REPO (default
# o1-labs/gitops-infrastructure); GITOPS_BOT_USER_ID skips the users API lookup of the
# commit identity; GITOPS_MERGE_RETRY_DELAY (default 5) seconds between merge attempts.
# Tests: scripts/gitops-bump.test.sh (offline, gh stubbed).
set -euo pipefail

usage() {
  echo "::error::$*" >&2
  echo "usage: gitops-bump.sh --network devnet|mainnet --version X.Y.Z --digest sha256:<64 hex> --gi-dir <path> [--merge] [--strict] [--dry-run]" >&2
  exit 2
}

network='' version='' digest='' gi_dir='' merge=false strict=false dry_run=false
while [[ $# -gt 0 ]]; do
  case $1 in
    --network | --version | --digest | --gi-dir)
      [[ $# -ge 2 ]] || usage "$1 needs a value"
      case $1 in
        --network) network=$2 ;;
        --version) version=$2 ;;
        --digest) digest=$2 ;;
        --gi-dir) gi_dir=$2 ;;
      esac
      shift 2
      ;;
    --merge) merge=true; shift ;;
    --strict) strict=true; shift ;;
    --dry-run) dry_run=true; shift ;;
    *) usage "unknown argument: $1" ;;
  esac
done

[[ $network == devnet || $network == mainnet ]] || usage "--network must be devnet or mainnet, not '$network'"
# X.Y.Z only: no leading v, no pre-release. Only stable tags deploy.
[[ $version =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || usage "not a release version: '$version' (X.Y.Z)"
[[ $digest =~ ^sha256:[0-9a-f]{64}$ ]] || usage "not an image digest: '$digest'"
[[ -n $gi_dir && -e $gi_dir/.git ]] || usage "--gi-dir must be a gitops-infrastructure checkout, not '$gi_dir'"
# Mainnet waits for a platform-engineering approval; nothing here may merge it.
[[ $merge == false || $network == devnet ]] || usage "--merge is devnet only: mainnet is never merged by this script"

repo=${GITOPS_REPO:-o1-labs/gitops-infrastructure}
app=archive-node-api-deploy
path=platform/hetzner-rivendell-1/applications/archive-node-api/image-$network.yaml
branch=auto/archive-node-api-$network-$version
title="chore(archive-node-api): deploy $version to $network"
delay=${GITOPS_MERGE_RETRY_DELAY:-5}
pr_url=''

# finish <result> <message>: the one place an exit 0 happens
finish() {
  echo "$2"
  if [[ -n ${GITHUB_OUTPUT:-} ]]; then
    printf 'result=%s\npr_url=%s\n' "$1" "$pr_url" >>"$GITHUB_OUTPUT"
  fi
  if [[ -n ${GITHUB_STEP_SUMMARY:-} ]]; then
    echo "- **$network** \`$1\`: $2${pr_url:+ $pr_url}" >>"$GITHUB_STEP_SUMMARY"
  fi
  exit 0
}

die() {
  echo "::error::$network: $*"
  if [[ -n ${GITHUB_STEP_SUMMARY:-} ]]; then
    echo "- **$network** failed: $*" >>"$GITHUB_STEP_SUMMARY"
  fi
  exit 1
}

is_semver() { [[ $1 =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; }

# semver_lt A B: A is lower than B, field by field as numbers (2.0.9 < 2.0.10)
semver_lt() {
  local -a a b
  local i
  IFS=. read -r -a a <<<"$1"
  IFS=. read -r -a b <<<"$2"
  for i in 0 1 2; do
    if ((10#${a[i]} != 10#${b[i]})); then
      ((10#${a[i]} < 10#${b[i]}))
      return
    fi
  done
  return 1
}

# Values reach yq only through strenv(), the network name included.
# get <file> <key>: <net>.image.<key>; a missing key is an error, never created
get() { NET=$network yq -e ".[strenv(NET)].image.$2" "$1"; }
# rest <file>: the file without the two keys a bump may change
rest() { NET=$network yq 'del(.[strenv(NET)].image.tag, .[strenv(NET)].image.digest)' "$1"; }

cd "$gi_dir"

# Always from the newest main, so mainnet's branch is cut after devnet's merge.
git fetch --quiet --no-tags origin +refs/heads/main:refs/remotes/origin/main
git checkout --quiet -B "$branch" origin/main
[[ -f $path ]] || die "$path is missing from $repo main"

current_tag=$(get "$path" tag) || die "$path has no $network.image.tag"
current_digest=$(get "$path" digest) || die "$path has no $network.image.digest"
# `yq -e` accepts an empty string. An empty digest is a file seeded before its release
# existed: a person fills it, it is not one more version to compare against.
[[ -n $current_digest ]] ||
  die "image-$network.yaml has no digest; fill it by hand from the release before automated deploys"
repository=$(get "$path" repository) || die "$path has no $network.image.repository"
echo "$network runs $repository:$current_tag@$current_digest"

if [[ $current_tag == "$version" ]]; then
  if [[ $current_digest == "$digest" ]]; then
    finish noop "already at $version@$digest"
  fi
  # A release's image never changes: a second digest for one version means a rebuild or a
  # moved registry tag, not a deploy.
  die "already runs $version as $current_digest, not $digest; one version has one image"
fi

if is_semver "$current_tag" && semver_lt "$version" "$current_tag"; then
  if [[ $strict == true ]]; then
    die "refusing to downgrade from $current_tag to $version; roll back with a hand-written pull request on $path"
  fi
  echo "::warning::$network already runs $current_tag, newer than $version; leaving it"
  finish skipped-ahead "already runs $current_tag, newer than $version"
fi

# branch_holds <ref>: that branch's file is exactly this bump of main's
branch_holds() {
  local file
  file=$(mktemp)
  git show "$1:$path" >"$file" 2>/dev/null &&
    [[ $(get "$file" tag) == "$version" && $(get "$file" digest) == "$digest" ]] &&
    [[ $(rest "$file") == "$(rest "$path")" ]]
  local rc=$?
  rm -f "$file"
  return "$rc"
}

# merge_pr <number> <head sha>: the bypass merges whatever the pull request's head is at
# that moment, and the branch name is predictable, so anyone who can push to GI could
# swap the content between the checks above and the merge. Pin the merge to the commit
# that was checked.
merge_pr() {
  local attempt mergeable view
  view=$(gh pr view "$1" --repo "$repo" --json headRefOid,baseRefName,isCrossRepository) ||
    die "cannot read $pr_url before merging it"
  if [[ $(jq -r '"\(.headRefOid) \(.baseRefName) \(.isCrossRepository)"' <<<"$view") != "$2 main false" ]]; then
    die "$pr_url is not the checked commit $2 into main from $repo itself ($(jq -c . <<<"$view")); not merging"
  fi
  for attempt in 1 2 3 4 5; do
    if gh pr merge "$1" --repo "$repo" --squash --admin --delete-branch --match-head-commit "$2"; then
      return 0
    fi
    # Right after the pull request is opened GitHub may not have computed mergeability yet.
    mergeable=$(gh pr view "$1" --repo "$repo" --json mergeable | jq -r .mergeable) || mergeable=''
    [[ $mergeable == UNKNOWN && $attempt -lt 5 ]] || break
    echo "mergeability of #$1 is not computed yet; retrying in ${delay}s"
    sleep "$delay"
  done
  die "could not merge $pr_url; merge it by hand, or check that $app is still in the bypass list of $repo main"
}

# Only pull requests this App opened, from GI itself, into main, decide anything: anyone
# can open a pull request from a branch with the same name. With --app, gh searches, and
# its --head is then a prefix match (…-2.0.1 also finds …-2.0.10), so the exact branch
# is matched here.
# ours_on <branch or ''>: stdin, a gh pr list array; stdout, the ones that count
ours_on() {
  jq -c --arg b "$1" --arg prefix "auto/archive-node-api-$network-" \
    'map(select((.isCrossRepository | not) and .baseRefName == "main"
      and (if $b == "" then (.headRefName | startswith($prefix)) else .headRefName == $b end)))'
}

# --- a pull request for this exact version already exists
prs=$(gh pr list --repo "$repo" --app "$app" --head "$branch" --state all \
  --json number,state,url,headRefName,baseRefName,isCrossRepository,changedFiles,additions,deletions | ours_on "$branch")
open=$(jq -c '[.[] | select(.state == "OPEN")][0] // empty' <<<"$prs")
if [[ -n $open ]]; then
  number=$(jq -r .number <<<"$open")
  pr_url=$(jq -r .url <<<"$open")
  # Never push to it: GI main does not dismiss stale reviews, so an approval would carry
  # over to content nobody reviewed. The last check compares with main as it is now, not
  # with the branch's merge base: a branch cut from an older main can hold the right image
  # file and still change, or revert, another one.
  if [[ $(jq -r '"\(.changedFiles) \(.additions) \(.deletions)"' <<<"$open") != "1 2 2" ]] ||
    ! git fetch --quiet --no-tags --depth=1 origin "+refs/heads/$branch:refs/remotes/origin/$branch" ||
    ! branch_holds "origin/$branch" ||
    [[ $(git diff --numstat origin/main "origin/$branch") != $'2\t2\t'"$path" ]]; then
    die "$pr_url is open for $version but is not exactly this change; close or fix it by hand"
  fi
  head=$(git rev-parse "origin/$branch")
  if [[ $merge == true ]]; then
    if [[ $dry_run == true ]]; then
      finish merged "dry run: would merge the open $pr_url"
    fi
    merge_pr "$number" "$head"
    finish merged "merged the open $pr_url"
  fi
  finish reused "$pr_url is already open with this change"
fi

previous=$(jq -c '[.[] | select(.state != "OPEN")][0] // empty' <<<"$prs")
if [[ -n $previous ]]; then
  pr_url=$(jq -r .url <<<"$previous")
  # CLOSED: a person rejected it. MERGED while main does not hold it: a person moved the
  # network away by hand since. Either way a re-run must not undo that; to deploy anyway,
  # edit $path by hand.
  echo "::notice::$network: $pr_url for $version is $(jq -r .state <<<"$previous" | tr '[:upper:]' '[:lower:]') and main runs $current_tag; not re-opening"
  finish rejected "$version was decided on in $pr_url; not re-opening"
fi

# --- mainnet: one open deploy at a time, the newest
lower=()
if [[ $network == mainnet ]]; then
  open_prs=$(gh pr list --repo "$repo" --app "$app" --state open --limit 200 \
    --json number,headRefName,url,baseRefName,isCrossRepository | ours_on '')
  while read -r n ref url; do
    v=${ref#auto/archive-node-api-mainnet-}
    is_semver "$v" || continue
    if semver_lt "$version" "$v"; then
      pr_url=$url
      echo "::notice::mainnet: $url already deploys $v, newer than $version; not opening one"
      finish skipped-higher-open "$url deploys $v, newer than $version"
    fi
    if semver_lt "$v" "$version"; then
      lower+=("$n")
    fi
  done < <(jq -r '.[] | "\(.number) \(.headRefName) \(.url)"' <<<"$open_prs")
fi

# --- a branch without a pull request is left over from a failed run
if git ls-remote --exit-code --heads origin "refs/heads/$branch" >/dev/null; then
  echo "deleting stale branch $branch, which has no pull request"
  [[ $dry_run == true ]] || git push --quiet origin --delete "$branch"
fi

# --- the edit
before=$(rest "$path")
NET=$network TAG=$version DIGEST=$digest yq -i \
  '.[strenv(NET)].image.tag = (strenv(TAG) | . style="double") | .[strenv(NET)].image.digest = (strenv(DIGEST) | . style="double")' \
  "$path"
numstat=$(git diff --numstat)
[[ $numstat == $'2\t2\t'"$path" ]] || die "the edit is not a two-line change of $path: ${numstat:-no change}"
[[ $(rest "$path") == "$before" ]] || die "the edit changed $path beyond $network.image.tag and .digest"
[[ $(get "$path" tag) == "$version" && $(get "$path" digest) == "$digest" ]] ||
  die "after the edit, $path does not read $version@$digest"

bot_id=${GITOPS_BOT_USER_ID:-$(gh api "users/${app}[bot]" --jq .id)}
[[ $bot_id =~ ^[0-9]+$ ]] || die "no user id for ${app}[bot]: '$bot_id'"
release=https://github.com/o1-labs/Archive-Node-API/releases/tag/v$version
run=${GITHUB_RUN_ID:+${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY:-o1-labs/Archive-Node-API}/actions/runs/$GITHUB_RUN_ID}
git add -- "$path"
git -c "user.name=${app}[bot]" -c "user.email=$bot_id+${app}[bot]@users.noreply.github.com" \
  commit --quiet --no-gpg-sign -m "$title" \
  -m "$repository:$version@$digest, replacing $current_tag@$current_digest. Release: $release"

if [[ $dry_run == true ]]; then
  git --no-pager show --stat --format='%an <%ae>%n%s' HEAD
  if [[ $merge == true ]]; then
    finish merged "dry run: would open and merge $branch"
  fi
  finish opened "dry run: would open $branch and close ${#lower[@]} older mainnet pull request(s)"
fi

git push --quiet origin "HEAD:refs/heads/$branch"
head=$(git rev-parse HEAD)

body=$(mktemp)
{
  echo "Deploys archive-node-api **$version** to **$network** on hetzner-rivendell-1. Opened by the release of [o1-labs/Archive-Node-API]($release)."
  echo
  echo "Changes the two lines of \`$path\` that pin the image. The chart renders \`repository:tag@digest\`, so the digest is what runs."
  echo
  echo "| | |"
  echo "|---|---|"
  echo "| image | \`$repository:$version@$digest\` |"
  echo "| previous | \`$repository:$current_tag@$current_digest\` |"
  echo "| release | $release |"
  echo "| run | ${run:-not from a workflow run} |"
  if [[ $network == mainnet ]]; then
    devnet_pr=$(gh pr list --repo "$repo" --app "$app" --head "auto/archive-node-api-devnet-$version" --state all \
      --json url,headRefName,baseRefName,isCrossRepository |
      jq -r --arg b "auto/archive-node-api-devnet-$version" \
        '[.[] | select((.isCrossRepository | not) and .baseRefName == "main" and .headRefName == $b)][0].url // empty')
    echo "| devnet | ${devnet_pr:-no devnet pull request for $version found} |"
    echo
    echo "Merging this deploys mainnet. Approve only when all of these hold:"
    echo
    echo "- [ ] devnet has been Synced/Healthy on \`$digest\` for at least 24 hours:"
    echo '  ```sh'
    echo "  argocd app get hetzner-rivendell-1-archive-node-api"
    echo "  kubectl --context kubernetes-admin@o1labs-rivendell-mvp-1.local -n archive-node-api get pods -l app.kubernetes.io/instance=devnet-archive-node-api -o jsonpath='{..imageID}'"
    echo '  ```'
    echo "- [ ] both registries serve \`$version\` as \`$digest\`:"
    echo '  ```sh'
    echo "  docker buildx imagetools inspect ghcr.io/o1-labs/archive-node-api:$version"
    echo "  docker buildx imagetools inspect europe-west3-docker.pkg.dev/o1labs-192920/euro-docker-repo/archive-node-api:$version"
    echo '  ```'
    echo "- [ ] the digest was built by the \`v$version\` tag run of build.yaml:"
    echo '  ```sh'
    echo "  gh attestation verify oci://ghcr.io/o1-labs/archive-node-api@$digest --repo o1-labs/Archive-Node-API --signer-workflow o1-labs/Archive-Node-API/.github/workflows/build.yaml --source-ref refs/tags/v$version"
    echo '  ```'
  else
    echo
    echo "Merged by the same run: the \`$app\` App bypasses main's review for devnet only. Mainnet gets its own pull request, which waits for an approval."
  fi
} >"$body"
pr_url=$(gh pr create --repo "$repo" --base main --head "$branch" --title "$title" --body-file "$body")
rm -f "$body"
number=${pr_url##*/}
echo "opened $pr_url"

if [[ $merge == true ]]; then
  merge_pr "$number" "$head"
  finish merged "merged $pr_url"
fi

for n in "${lower[@]}"; do
  gh pr close "$n" --repo "$repo" --comment "Superseded by #$number." --delete-branch
  echo "closed #$n, superseded by #$number"
done
finish opened "opened $pr_url"
