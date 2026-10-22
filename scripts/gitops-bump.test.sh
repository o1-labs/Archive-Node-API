#!/usr/bin/env bash
# Offline tests for scripts/gitops-bump.sh. Each case gets a temp dir holding a bare "origin"
# with gitops-infrastructure's file layout, a clone of it as the GI checkout, and a gh stub
# on PATH that records its calls, keeps pull request state in a JSON file and merges into
# the bare origin itself. Nothing reaches GitHub. A post-receive hook on the origin logs
# every push the script makes; the stub's merges and closes bypass it.
#
#   bash scripts/gitops-bump.test.sh
#
# Needs git, jq and mikefarah yq v4 (all on the GitHub runner image). The unit-tests
# workflow runs it as the gitops-bump-script job. Exit 1 on any FAIL.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
bump=$here/gitops-bump.sh
tmp=$(mktemp -d)
trap 'rm -rf "$tmp" || true' EXIT

# The developer's or the runner's git config must not leak in (signing, hooks, branch names),
# and neither may the calling step's GitHub outputs.
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1
unset GITHUB_OUTPUT GITHUB_STEP_SUMMARY GITHUB_RUN_ID GH_TOKEN GITOPS_BOT_USER_ID GITOPS_REPO

for tool in git jq yq; do
  command -v "$tool" >/dev/null || { echo "FAIL  $tool is not installed"; exit 1; }
done
real_yq=$(command -v yq)

P=platform/hetzner-rivendell-1/applications/archive-node-api
PRS=https://github.com/o1-labs/gitops-infrastructure/pull
tab=$'\t'
hex() { printf 'sha256:%s' "$(printf "$1%.0s" {1..64})"; }
d0=$(hex 0) d1=$(hex 1) d2=$(hex 2)

# --- the gh stub: state lives in $STUB_W (prs.json, gh.log, merge-unknown)
mkdir -p "$tmp/bin" "$tmp/shim"
cat >"$tmp/bin/gh" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
W=$STUB_W
db=$W/prs.json
origin=$W/origin.git
printf '%s\n' "$*" >>"$W/gh.log"
og() { git --git-dir="$origin" "$@"; }

sub="$1 ${2:-}"
shift 2 || shift $#
declare -A f=()
pos=()
while [[ $# -gt 0 ]]; do
  case $1 in
    --squash | --admin | --delete-branch) f[$1]=1; shift ;;
    --*) f[$1]=$2; shift 2 ;;
    *) pos+=("$1"); shift ;;
  esac
done

set_state() { jq --argjson n "$1" --arg s "$2" 'map(if .number == $n then .state = $s else . end)' "$db" >"$db.new" && mv "$db.new" "$db"; }
head_of() { jq -r --argjson n "$1" '.[] | select(.number == $n) | .headRefName' "$db"; }
pr_of() { jq -c --argjson n "$1" '.[] | select(.number == $n)' "$db"; }
sha_of() { og rev-parse -q --verify "refs/heads/$1" || true; }

# move-head holds "view" or "merge": at that call, someone else pushes to the pull
# request's branch (once), as a GI writer could between the script's checks and its merge
move_head() {
  local h clone
  [[ $(cat "$W/move-head" 2>/dev/null) == "$1" ]] || return 0
  rm -f "$W/move-head"
  h=$(head_of "$2")
  clone=$(mktemp -d)
  git clone --quiet --branch "$h" "$origin" "$clone"
  echo "pushed by someone else" >"$clone/other.txt"
  git -C "$clone" add -A
  git -C "$clone" -c user.name=other -c user.email=other@example.com commit --quiet --no-gpg-sign -m "other"
  og fetch --quiet "$clone" "+refs/heads/$h:refs/heads/$h"
  rm -rf "$clone"
}

# diff stats of each open pull request's branch against main, as GitHub reports them
enrich() {
  local out='[]' pr h ns
  while IFS= read -r pr; do
    h=$(jq -r .headRefName <<<"$pr")
    ns=''
    if [[ $(jq -r .state <<<"$pr") == OPEN ]] && og rev-parse -q --verify "refs/heads/$h" >/dev/null; then
      ns=$(og diff --numstat "main...refs/heads/$h")
    fi
    pr=$(jq -c --arg ns "$ns" '. + ($ns | split("\n") | map(select(. != "") | split("\t"))
      | {changedFiles: length, additions: (map(.[0] | tonumber) | add // 0), deletions: (map(.[1] | tonumber) | add // 0)})' <<<"$pr")
    out=$(jq -c --argjson pr "$pr" '. + [$pr]' <<<"$out")
  done < <(jq -c '.[]')
  echo "$out"
}

case $sub in
  "api users/archive-node-api-deploy[bot]") echo 4242 ;;
  "pr list")
    # Like gh: --app filters on the author and turns the query into a search, where
    # --head matches as a prefix (…-2.0.1 also finds …-2.0.10). Without --app, exact.
    state=${f[--state]:-open}
    jq -c --arg h "${f[--head]:-}" --arg s "$state" --arg app "${f[--app]:-}" \
      'map(select(($app == "" or .author == $app)
        and ($h == "" or (if $app == "" then .headRefName == $h else (.headRefName | startswith($h)) end))
        and ($s == "all" or .state == ($s | ascii_upcase))))' "$db" | enrich
    ;;
  "pr create")
    n=$(($(jq 'map(.number) | max // 99' "$db") + 1))
    url=https://github.com/${f[--repo]}/pull/$n
    cp "${f[--body-file]}" "$W/body-$n.md"
    jq --argjson n "$n" --arg u "$url" --arg h "${f[--head]}" --arg t "${f[--title]}" \
      '. + [{number: $n, state: "OPEN", url: $u, headRefName: $h, title: $t,
        author: "archive-node-api-deploy", baseRefName: "main", isCrossRepository: false}]' "$db" >"$db.new" && mv "$db.new" "$db"
    echo "$url"
    ;;
  "pr merge")
    n=${pos[0]}
    move_head merge "$n"
    if [[ -n ${f[--match-head-commit]:-} && ${f[--match-head-commit]} != "$(sha_of "$(head_of "$n")")" ]]; then
      echo "GraphQL: Head branch was modified. Review and try the merge again. (mergePullRequest)" >&2
      exit 1
    fi
    # merge-unknown holds how many merges fail first; pr view then reports UNKNOWN
    left=$(cat "$W/merge-unknown" 2>/dev/null || echo 0)
    if ((left > 0)); then
      echo $((left - 1)) >"$W/merge-unknown"
      : >"$W/merge-failed"
      echo "GraphQL: Pull Request is not mergeable (mergePullRequest)" >&2
      exit 1
    fi
    rm -f "$W/merge-failed"
    h=$(head_of "$n")
    clone=$(mktemp -d)
    git clone --quiet "$origin" "$clone"
    git -C "$clone" merge --quiet --squash "origin/$h" >/dev/null 2>&1
    git -C "$clone" -c user.name=GitHub -c user.email=noreply@github.com commit --quiet --no-gpg-sign -m "squash #$n"
    og fetch --quiet --update-head-ok "$clone" +refs/heads/main:refs/heads/main
    og update-ref -d "refs/heads/$h"
    rm -rf "$clone"
    set_state "$n" MERGED
    ;;
  "pr view")
    n=${pos[0]}
    move_head view "$n"
    mergeable=MERGEABLE
    if [[ -e $W/merge-failed ]]; then mergeable=UNKNOWN; fi
    pr_of "$n" | jq -c --arg oid "$(sha_of "$(head_of "$n")")" --arg m "$mergeable" \
      '{headRefOid: $oid, baseRefName, isCrossRepository, mergeable: $m}'
    ;;
  "pr close")
    n=${pos[0]}
    h=$(head_of "$n")
    if [[ -n ${f[--delete-branch]:-} ]] && og rev-parse -q --verify "refs/heads/$h" >/dev/null; then
      og update-ref -d "refs/heads/$h"
    fi
    set_state "$n" CLOSED
    ;;
  *)
    echo "gh stub: unhandled: $sub" >&2
    exit 64
    ;;
esac
STUB
chmod +x "$tmp/bin/gh"

# The yq shim for (m): after the script's in-place edit it also rewrites repository and
# puts the old digest back, so the diff is still two lines, but not the two the bump means.
cat >"$tmp/shim/yq" <<'SHIM'
#!/usr/bin/env bash
set -euo pipefail
if [[ $1 == -i ]]; then
  file=${!#}
  old=$("$REAL_YQ" '.devnet.image.digest' "$file")
  "$REAL_YQ" "$@"
  OLD=$old "$REAL_YQ" -i '.devnet.image.digest = (strenv(OLD) | . style="double") | .devnet.image.repository = "ghcr.io/evil/archive-node-api"' "$file"
else
  exec "$REAL_YQ" "$@"
fi
SHIM
chmod +x "$tmp/shim/yq"

# image_file <net> <tag> <digest>: shaped like GI's, header comments included
image_file() {
  cat <<EOF
# The archive-node-api image $1 runs on hetzner-rivendell-1. PLAIN YAML, no Go templating:
# the release of o1-labs/Archive-Node-API rewrites $1.image.tag and $1.image.digest with
# \`yq -i\` and opens the pull request that deploys it. Keep it flat and untemplated so that
# rewrite stays a two-line diff. Hand edits are fine.
#
# Deep-merges into the helmfile's $1 values (helmfile.yaml.gotmpl).
$1:
  image:
    repository: ghcr.io/o1-labs/archive-node-api
    # Plain semver, no \`v\`. Quoted so a tag such as \`1.10\` stays a string.
    tag: "$2"
    # The index digest of that tag in GHCR and GAR. Rendered as repository:tag@digest.
    digest: "$3"
EOF
}

# fresh: a new origin seeded at 2.0.0@d0 for both networks, a GI clone, empty stub state
fresh() {
  W=$tmp/case-$((++case_no))
  mkdir -p "$W"
  git init --quiet --bare -b main "$W/origin.git"
  git clone --quiet "$W/origin.git" "$W/seed" 2>/dev/null
  git -C "$W/seed" symbolic-ref HEAD refs/heads/main
  mkdir -p "$W/seed/$P"
  image_file devnet 2.0.0 "$d0" >"$W/seed/$P/image-devnet.yaml"
  image_file mainnet 2.0.0 "$d0" >"$W/seed/$P/image-mainnet.yaml"
  echo "# archive-node-api" >"$W/seed/$P/README.md"
  seed_commit "seed"
  git -C "$W/seed" push --quiet origin HEAD:refs/heads/main 2>/dev/null
  printf '#!/usr/bin/env bash\ncat >>%q\n' "$W/push.log" >"$W/origin.git/hooks/post-receive"
  chmod +x "$W/origin.git/hooks/post-receive"
  git clone --quiet "$W/origin.git" "$W/gi"
  echo '[]' >"$W/prs.json"
  : >"$W/gh.log"
  : >"$W/push.log"
}
case_no=0

seed_commit() {
  git -C "$W/seed" add -A
  git -C "$W/seed" -c user.name=human -c user.email=human@example.com commit --quiet --no-gpg-sign -m "$1"
}

# seed_branch <branch> <net> <tag> <digest>: a branch in origin that bumps <net> (no log)
seed_branch() {
  git -C "$W/seed" fetch --quiet origin
  git -C "$W/seed" checkout --quiet -B "$1" origin/main
  image_file "$2" "$3" "$4" >"$W/seed/$P/image-$2.yaml"
  seed_commit "bump $2"
  git -C "$W/seed" push --quiet origin "HEAD:refs/heads/$1" 2>/dev/null
  git -C "$W/seed" checkout --quiet main
  : >"$W/push.log"
}

# add_pr <number> <state> <branch> [author] [base] [cross-repository]
add_pr() {
  jq --argjson n "$1" --arg s "$2" --arg h "$3" --arg u "$PRS/$1" \
    --arg a "${4:-archive-node-api-deploy}" --arg b "${5:-main}" --argjson x "${6:-false}" \
    '. + [{number: $n, state: $s, url: $u, headRefName: $h, title: "x", author: $a, baseRefName: $b, isCrossRepository: $x}]' \
    "$W/prs.json" >"$W/prs.new" && mv "$W/prs.new" "$W/prs.json"
}

# run <args...>: the script against this case's GI checkout; rc, out, output, summary in $W
run() {
  : >"$W/output"
  : >"$W/summary"
  rc=0
  PATH="${extra_path:+$extra_path:}$tmp/bin:$PATH" STUB_W=$W REAL_YQ=$real_yq \
    GITHUB_OUTPUT=$W/output GITHUB_STEP_SUMMARY=$W/summary GITOPS_MERGE_RETRY_DELAY=0 \
    bash "$bump" --gi-dir "$W/gi" "$@" >"$W/out" 2>&1 || rc=$?
}
extra_path=''

# --- conditions, each true or false; `want` collects the false ones for `check`
og() { git --git-dir="$W/origin.git" "$@"; }
origin_file() { og show "main:$P/image-$1.yaml"; }
origin_value() { origin_file "$1" | yq ".$1.image.$2"; }
eq() { [[ $1 == "$2" ]]; }
rc_is() { [[ $rc -eq $1 ]]; }
# result <value>: exactly one result= line, with that value
result() { [[ $(grep -c '^result=' "$W/output") -eq 1 && $(sed -n 's/^result=//p' "$W/output") == "$1" ]]; }
no_result() { ! grep -q '^result=' "$W/output"; }
no_push() { [[ ! -s $W/push.log ]]; }
no_gh_at_all() { [[ ! -s $W/gh.log ]]; }
gh_count() { grep -c -- "$1" "$W/gh.log" || true; }
no_gh() { [[ $(gh_count "$1") -eq 0 ]]; }
gh_has() { grep -q -- "$1" "$W/gh.log"; }
out_has() { grep -qF -- "$1" "$W/out"; }
refs() { og for-each-ref --format='%(refname) %(objectname)'; }
pr_state() { jq -r --argjson n "$1" '.[] | select(.number == $n) | .state' "$W/prs.json"; }
comments() { grep -c '^ *#' || true; }

fails=0
why=()
want() { "$@" || why+=("$*"); }
# check <name>: PASS if every `want` since the last check held
check() {
  if [[ ${#why[@]} -eq 0 ]]; then
    echo "PASS  $1"
  else
    echo "FAIL  $1"
    fails=$((fails + 1))
    printf '      not true: %s\n' "${why[@]}"
    echo "      rc=$rc; script output:"
    sed 's/^/      | /' "$W/out"
    echo "      gh calls:"
    sed 's/^/      | /' "$W/gh.log"
  fi
  why=()
}

# --- (a) a devnet bump: two lines, comments survive, bot identity
fresh
run --network devnet --version 2.0.1 --digest "$d1" --merge
want rc_is 0
want eq "$(og diff --numstat main~1 main)" "2${tab}2${tab}$P/image-devnet.yaml"
want eq "$(origin_value devnet tag)" 2.0.1
want eq "$(origin_value devnet digest)" "$d1"
want eq "$(origin_file devnet | grep '^    tag:')" '    tag: "2.0.1"'
check "(a) a devnet bump changes exactly 2 lines of image-devnet.yaml"
want eq "$(origin_file devnet | comments)" "$(image_file devnet 2.0.0 "$d0" | comments)"
want eq "$(origin_file devnet | head -n 6)" "$(image_file devnet 2.0.0 "$d0" | head -n 6)"
check "(a) every comment survives the bump"
want eq "$(git -C "$W/gi" log -1 --format='%an <%ae>' auto/archive-node-api-devnet-2.0.1)" \
  'archive-node-api-deploy[bot] <4242+archive-node-api-deploy[bot]@users.noreply.github.com>'
check "(a) the commit is archive-node-api-deploy[bot] with its user id"

# --- (b) same tag and digest: no-op
fresh
run --network devnet --version 2.0.0 --digest "$d0" --merge
want rc_is 0
want result noop
want no_push
want no_gh_at_all
check "(b)/(o) same tag and digest: result=noop, nothing pushed, no gh call"

# --- (c) downgrade
fresh
run --network devnet --version 1.9.0 --digest "$d1" --merge
want rc_is 0
want result skipped-ahead
want out_has "::warning::"
want no_push
want no_gh "pr "
check "(c)/(o) downgrade on a tag run: ::warning:: and result=skipped-ahead"
run --network devnet --version 1.9.0 --digest "$d1" --merge --strict
want rc_is 1
want out_has "refusing to downgrade"
want no_result
want no_push
check "(c) downgrade with --strict fails"

# --- (d) only X.Y.Z deploys
fresh
for bad in 2.0.1-rc.1 v2.0.1 2.0 2.0.1.1 2.0.x ''; do
  run --network devnet --version "$bad" --digest "$d1" --merge
  want rc_is 2
  want no_result
  want no_push
  want no_gh_at_all
  check "(d) version '$bad' is rejected before any call"
done
run --network devnet --version 2.0.1 --digest sha256:abc --merge
want rc_is 2
want no_gh_at_all
check "(d) a malformed digest is rejected"

# --- (e) mainnet is never merged here
fresh
run --network mainnet --version 2.0.1 --digest "$d1" --merge
want rc_is 2
want out_has "devnet only"
want no_gh "pr merge"
want no_push
want no_result
check "(e) mainnet --merge is refused, no gh pr merge recorded"

# --- (h) devnet merged, then mainnet cut from the main that merge produced
fresh
run --network devnet --version 2.0.1 --digest "$d1" --merge
want rc_is 0
want result merged
want grep -q "^pr_url=$PRS/100$" "$W/output"
check "(h)/(o) devnet: result=merged"
after_devnet=$(og rev-parse main)
run --network mainnet --version 2.0.1 --digest "$d1"
want rc_is 0
want result opened
check "(h)/(o) mainnet: result=opened"
want eq "$(og rev-parse auto/archive-node-api-mainnet-2.0.1~1)" "$after_devnet"
want eq "$(og diff --numstat main auto/archive-node-api-mainnet-2.0.1)" "2${tab}2${tab}$P/image-mainnet.yaml"
check "(h) the mainnet branch is cut from origin/main after the devnet merge"
want eq "$(gh_count "pr merge")" 1
want gh_has "^pr merge 100 .*--match-head-commit $(git -C "$W/gi" rev-parse auto/archive-node-api-devnet-2.0.1)$"
want eq "$(pr_state 101)" OPEN
want grep -q "$PRS/100" "$W/body-101.md"
want grep -q "24 hours" "$W/body-101.md"
want grep -q "imagetools inspect europe-west3-docker.pkg.dev" "$W/body-101.md"
check "(h) mainnet is opened, not merged, and its body links devnet's PR and the soak checklist"

# --- (f) a second run of the same release pushes nothing
: >"$W/push.log"
: >"$W/gh.log"
before_refs=$(refs)
run --network devnet --version 2.0.1 --digest "$d1" --merge
want rc_is 0
want result noop
check "(f)/(o) re-run: devnet result=noop"
run --network mainnet --version 2.0.1 --digest "$d1"
want rc_is 0
want result reused
check "(f)/(o) re-run: mainnet result=reused"
want no_push
want no_gh "pr create"
want no_gh "pr merge"
want eq "$(refs)" "$before_refs"
check "(f) the re-run pushes nothing, opens nothing, leaves every ref"

# --- (g) a missing key fails and is never created
for key in tag digest; do
  fresh
  NET=devnet KEY=$key yq -i 'del(.[strenv(NET)].image[strenv(KEY)])' "$W/seed/$P/image-devnet.yaml"
  seed_commit "drop $key"
  git -C "$W/seed" push --quiet origin HEAD:refs/heads/main 2>/dev/null
  : >"$W/push.log"
  run --network devnet --version 2.0.1 --digest "$d1" --merge
  want rc_is 1
  want out_has "has no devnet.image.$key"
  want no_push
  want no_result
  want no_gh "pr "
  check "(g) a missing $key key fails"
done

# --- (i) a closed, unmerged pull request: a person rejected it
fresh
add_pr 50 CLOSED auto/archive-node-api-devnet-2.0.1
run --network devnet --version 2.0.1 --digest "$d1" --merge
want rc_is 0
want result rejected
want out_has "::notice::"
want no_push
want no_gh "pr create"
want no_gh "pr merge"
check "(i)/(o) a closed-unmerged PR: notice, result=rejected, nothing pushed"

fresh
add_pr 50 MERGED auto/archive-node-api-devnet-2.0.1
run --network devnet --version 2.0.1 --digest "$d1" --merge
want rc_is 0
want result rejected
want no_push
want no_gh "pr create"
check "(i) a merged PR that main no longer holds (rolled back by hand): result=rejected"

# --- (j) superseding compares semver, not strings
fresh
add_pr 60 OPEN auto/archive-node-api-mainnet-2.0.9
add_pr 61 OPEN auto/archive-node-api-mainnet-1.10.0
add_pr 62 OPEN auto/archive-node-api-devnet-2.0.9
run --network mainnet --version 2.0.10 --digest "$d1"
want rc_is 0
want result opened
want gh_has "^pr close 60 .*Superseded by #63\."
want gh_has "^pr close 61 .*Superseded by #63\."
want no_gh "pr close 62"
want eq "$(jq -r '[.[] | select(.state == "OPEN") | .number] | join(",")' "$W/prs.json")" "62,63"
check "(j) 2.0.10 supersedes open mainnet 2.0.9 and 1.10.0 (semver order), leaves devnet's"

# --- (k) an open pull request with other content is never pushed to
fresh
seed_branch auto/archive-node-api-mainnet-2.0.1 mainnet 2.0.1 "$d2"
add_pr 70 OPEN auto/archive-node-api-mainnet-2.0.1
before_refs=$(refs)
run --network mainnet --version 2.0.1 --digest "$d1"
want rc_is 1
want out_has "is not exactly this change"
want no_push
want no_result
want no_gh "pr create"
want eq "$(refs)" "$before_refs"
check "(k) an open mainnet PR with other content: fails, nothing pushed"
fresh
seed_branch auto/archive-node-api-devnet-2.0.1 devnet 2.0.1 "$d2"
add_pr 71 OPEN auto/archive-node-api-devnet-2.0.1
run --network devnet --version 2.0.1 --digest "$d1" --merge
want rc_is 1
want no_push
want no_gh "pr merge"
check "(k) an open devnet PR with other content: fails, not merged"

# --- (l) one version, one image
fresh
run --network devnet --version 2.0.0 --digest "$d1" --merge
want rc_is 1
want out_has "one version has one image"
want no_push
want no_result
check "(l) the same version with another digest fails"

# --- (m) the del() check catches an edit beyond tag and digest
fresh
extra_path=$tmp/shim
run --network devnet --version 2.0.1 --digest "$d1" --merge
extra_path=''
want rc_is 1
want out_has "beyond devnet.image.tag and .digest"
want no_push
want no_gh "pr create"
check "(m) an extra edit hidden in a two-line diff is caught by the del() check"

# --- (n) no lower mainnet pull request while a higher one is open
fresh
add_pr 80 OPEN auto/archive-node-api-mainnet-2.0.2
run --network mainnet --version 2.0.1 --digest "$d1"
want rc_is 0
want result skipped-higher-open
want out_has "::notice::"
want no_push
want no_gh "pr create"
want no_gh "pr close"
check "(n)/(o) a higher mainnet PR is open: result=skipped-higher-open, nothing opened"

# --- (o) an open devnet pull request that holds the target is merged, not re-pushed
fresh
seed_branch auto/archive-node-api-devnet-2.0.1 devnet 2.0.1 "$d1"
add_pr 90 OPEN auto/archive-node-api-devnet-2.0.1
run --network devnet --version 2.0.1 --digest "$d1" --merge
want rc_is 0
want result merged
want no_push
want no_gh "pr create"
want gh_has "^pr merge 90 .*--squash"
want eq "$(origin_value devnet tag)" 2.0.1
check "(o) an open devnet PR with the target and --merge: result=merged, nothing pushed"

# --- (p) an empty digest (a file seeded before its release existed) is never compared or filled
for target in 2.1.0 2.1.1; do
  fresh
  image_file devnet 2.1.0 '' >"$W/seed/$P/image-devnet.yaml"
  seed_commit "devnet at 2.1.0, digest not yet known"
  git -C "$W/seed" push --quiet origin HEAD:refs/heads/main 2>/dev/null
  : >"$W/push.log"
  run --network devnet --version "$target" --digest "$d1" --merge
  want rc_is 1
  want out_has "::error::devnet: image-devnet.yaml has no digest; fill it by hand from the release before automated deploys"
  want eq "$(grep -c 'one version has one image' "$W/out")" 0
  want eq "$(origin_value devnet digest)" ''
  want no_push
  want no_result
  want no_gh_at_all
  check "(p) an empty current digest fails, deploying $target, and is not filled"
done

# --- (q) someone pushes to the branch between the checks and the merge
fresh
echo view >"$W/move-head"
run --network devnet --version 2.0.1 --digest "$d1" --merge
want rc_is 1
want out_has "is not the checked commit"
want no_gh "pr merge"
want eq "$(origin_value devnet tag)" 2.0.0
want eq "$(pr_state 100)" OPEN
check "(q) the head moves before the merge: no merge is attempted, devnet does not move"
fresh
echo merge >"$W/move-head"
run --network devnet --version 2.0.1 --digest "$d1" --merge
want rc_is 1
want gh_has "^pr merge 100 .*--match-head-commit $(git -C "$W/gi" rev-parse auto/archive-node-api-devnet-2.0.1)$"
want eq "$(origin_value devnet tag)" 2.0.0
want eq "$(pr_state 100)" OPEN
want no_result
check "(q) the head moves during the merge: --match-head-commit refuses it, devnet does not move"

# --- (r) an open pull request cut from an older main holds the right file but reverts
# another: right by its own merge base, wrong against main now
fresh
seed_branch auto/archive-node-api-devnet-2.0.1 devnet 2.0.1 "$d1"
echo "# archive-node-api, edited on main after the branch was cut" >"$W/seed/$P/README.md"
seed_commit "edit the README on main"
git -C "$W/seed" push --quiet origin HEAD:refs/heads/main 2>/dev/null
: >"$W/push.log"
add_pr 95 OPEN auto/archive-node-api-devnet-2.0.1
run --network devnet --version 2.0.1 --digest "$d1" --merge
want rc_is 1
want out_has "is not exactly this change"
want no_gh "pr merge"
want no_push
want eq "$(origin_value devnet tag)" 2.0.0
check "(r) a branch from an older main that changes another file dies, not merged"

# --- (s) only the App's own pull requests, from GI into main, on the exact branch count
fresh
add_pr 40 CLOSED auto/archive-node-api-devnet-2.0.1 someone
add_pr 41 CLOSED auto/archive-node-api-devnet-2.0.1 archive-node-api-deploy release
add_pr 42 CLOSED auto/archive-node-api-devnet-2.0.1 archive-node-api-deploy main true
add_pr 43 CLOSED auto/archive-node-api-devnet-2.0.10
run --network devnet --version 2.0.1 --digest "$d1" --merge
want rc_is 0
want result merged
want gh_has "^pr list .*--app archive-node-api-deploy"
check "(s) closed PRs by someone else, into another base, cross-repository or for 2.0.10 are ignored"
fresh
add_pr 44 OPEN auto/archive-node-api-mainnet-2.0.2 someone
add_pr 45 OPEN auto/archive-node-api-mainnet-1.9.0 someone
run --network mainnet --version 2.0.1 --digest "$d1"
want rc_is 0
want result opened
want no_gh "pr close"
want eq "$(pr_state 44) $(pr_state 45)" "OPEN OPEN"
check "(s) higher and lower open mainnet PRs by someone else neither block nor get closed"

# --- beyond (a)-(s): the rest of the 3a.1 contract
fresh
seed_branch auto/archive-node-api-devnet-2.0.1 devnet 2.0.1 "$d2"
run --network devnet --version 2.0.1 --digest "$d1" --merge
want rc_is 0
want result merged
want eq "$(origin_value devnet digest)" "$d1"
want grep -q " 0\{40\} refs/heads/auto/archive-node-api-devnet-2.0.1$" "$W/push.log"
check "a stale branch without a PR is deleted and pushed fresh"

fresh
echo 2 >"$W/merge-unknown"
run --network devnet --version 2.0.1 --digest "$d1" --merge
want rc_is 0
want result merged
want eq "$(gh_count "pr merge")" 3
check "the merge is retried while mergeability is UNKNOWN"

fresh
echo 9 >"$W/merge-unknown"
run --network devnet --version 2.0.1 --digest "$d1" --merge
want rc_is 1
want eq "$(gh_count "pr merge")" 5
want no_result
check "the merge gives up after 5 attempts"

fresh
run --network mainnet --version 2.0.1 --digest "$d1" --dry-run
want rc_is 0
want result opened
want no_push
want no_gh "pr create"
want no_gh "pr merge"
check "--dry-run pushes, opens and merges nothing"

echo
if ((fails)); then
  echo "$fails check(s) failed"
  exit 1
fi
echo "all checks passed"
