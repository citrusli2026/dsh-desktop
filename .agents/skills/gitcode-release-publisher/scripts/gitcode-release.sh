#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

gc_usage() {
  cat <<'EOF'
Usage:
  gitcode-release.sh upload --session NAME --repo OWNER/REPO --file PATH [--content-type MIME]
  gitcode-release.sh create --session NAME --repo OWNER/REPO --tag TAG --ref COMMIT \
    --title TITLE --description-file PATH --assets-file PATH \
    [--status prerelease|latest|unset]
  gitcode-release.sh verify --repo OWNER/REPO --tag TAG --assets-file PATH
EOF
}

gc_die() {
  echo "gitcode-release: $*" >&2
  exit 1
}

gc_need() {
  command -v "$1" >/dev/null 2>&1 || gc_die "required command not found: $1"
}

gc_no_newlines() {
  case "$2" in
    *$'\n'*|*$'\r'*) gc_die "$1 must not contain newlines" ;;
  esac
}

gc_encode() {
  jq -rn --arg value "$1" '$value | @uri'
}

gc_file_size() {
  if stat -f '%z' "$1" >/dev/null 2>&1; then
    stat -f '%z' "$1"
  else
    stat -c '%s' "$1"
  fi
}

gc_make_temp() {
  umask 077
  gc_tmp_dir=$(mktemp -d "${TMPDIR:-/tmp}/gitcode-release.XXXXXX")
  trap 'rm -rf "$gc_tmp_dir"' EXIT HUP INT TERM
}

gc_browser_headers() {
  local gc_request gc_response gc_auth_json

  gc_request=$(jq -cn --arg session "$gc_session" '{
    action: "evaluate",
    args: {code: "JSON.stringify({token:localStorage.getItem(\"access_token\"),cookie:document.cookie,ua:navigator.userAgent,origin:location.origin})"},
    session: $session
  }')
  gc_response=$(curl -sS --max-time 15 -X POST 'http://127.0.0.1:10086/command' \
    -H 'Content-Type: application/json' --data-binary "$gc_request")
  gc_auth_json=$(printf '%s' "$gc_response" | jq -er '.data.value | fromjson') \
    || gc_die "could not read authorization from browser session: $gc_session"

  gc_token=$(printf '%s' "$gc_auth_json" | jq -er '.token | select(type == "string" and length > 0)') \
    || gc_die "browser tab has no GitCode access token"
  gc_cookie=$(printf '%s' "$gc_auth_json" | jq -er '.cookie | select(type == "string")') \
    || gc_die "could not read GitCode browser cookies"
  gc_user_agent=$(printf '%s' "$gc_auth_json" | jq -er '.ua | select(type == "string" and length > 0)') \
    || gc_die "could not read browser User-Agent"
  gc_origin=$(printf '%s' "$gc_auth_json" | jq -er '.origin | select(type == "string")') \
    || gc_die "could not read browser origin"

  [ "$gc_origin" = 'https://gitcode.com' ] \
    || gc_die "browser session must be focused on a logged-in https://gitcode.com tab"
  gc_no_newlines token "$gc_token"
  gc_no_newlines cookie "$gc_cookie"
  gc_no_newlines user-agent "$gc_user_agent"

  {
    printf 'Authorization: Bearer %s\n' "$gc_token"
    printf 'Cookie: %s\n' "$gc_cookie"
    printf 'User-Agent: %s\n' "$gc_user_agent"
    printf 'Origin: https://gitcode.com\n'
    printf 'Referer: https://gitcode.com/%s/releases\n' "$gc_repo"
    printf 'Content-Type: application/json\n'
    printf 'X-App-Version: 0\n'
    printf 'X-Platform: web\n'
    printf 'X-Device-Type: desktop\n'
    printf 'X-App-Channel: gitcode-fe\n'
    printf 'X-Network-Type: 4g\n'
    printf 'X-Device-ID: unknown\n'
  } > "$gc_tmp_dir/browser-headers.txt"

  unset gc_token gc_cookie gc_user_agent gc_origin gc_auth_json gc_response gc_request
}

gc_validate_repo() {
  case "$1" in
    */*) ;;
    *) gc_die "repo must be OWNER/REPOSITORY" ;;
  esac
  gc_no_newlines repo "$1"
}

gc_upload() {
  local gc_session='' gc_repo='' gc_file='' gc_content_type=''
  local gc_repo_encoded gc_project_id gc_name gc_size gc_payload gc_status
  local gc_upload_url gc_attachment_id gc_cdn_url gc_put_content_type
  local gc_acl gc_project_header gc_callback

  while [ "$#" -gt 0 ]; do
    case "$1" in
      --session) gc_session=${2:-}; shift 2 ;;
      --repo) gc_repo=${2:-}; shift 2 ;;
      --file) gc_file=${2:-}; shift 2 ;;
      --content-type) gc_content_type=${2:-}; shift 2 ;;
      *) gc_die "unknown upload argument: $1" ;;
    esac
  done

  [ -n "$gc_session" ] || gc_die "upload requires --session"
  [ -n "$gc_repo" ] || gc_die "upload requires --repo"
  [ -f "$gc_file" ] || gc_die "upload file not found: $gc_file"
  gc_validate_repo "$gc_repo"
  gc_no_newlines session "$gc_session"
  gc_no_newlines file "$gc_file"

  gc_name=$(basename "$gc_file")
  gc_size=$(gc_file_size "$gc_file")
  case "$gc_size" in
    ''|*[!0-9]*) gc_die "could not determine file size" ;;
  esac
  [ "$gc_size" -gt 0 ] || gc_die "refusing to upload an empty file"
  if [ -z "$gc_content_type" ]; then
    case "$gc_name" in
      *.sha256|*.txt|*.yml|*.yaml) gc_content_type='text/plain' ;;
      *) gc_content_type='application/octet-stream' ;;
    esac
  fi
  gc_no_newlines filename "$gc_name"
  gc_no_newlines content-type "$gc_content_type"

  gc_make_temp
  gc_browser_headers
  gc_repo_encoded=$(gc_encode "$gc_repo")
  gc_project_id=$(gc_encode "$gc_repo_encoded")
  gc_payload=$(jq -cn \
    --arg file_name "$gc_name" \
    --arg content_type "$gc_content_type" \
    --arg project_id "$gc_project_id" \
    --argjson size "$gc_size" \
    '{type:"RELEASE",size:$size,file_name:$file_name,content_type:$content_type,project_id:$project_id}')

  gc_status=$(curl -sS --max-time 60 -o "$gc_tmp_dir/reservation.json" -w '%{http_code}' \
    -X POST "https://web-api.gitcode.com/api/v2/projects/$gc_repo_encoded/releases/upload" \
    -H "@$gc_tmp_dir/browser-headers.txt" --data-binary "$gc_payload")
  [ "$gc_status" = '200' ] || gc_die "attachment reservation failed with HTTP $gc_status"
  jq -e 'type == "object" and length == 1 and (to_entries[0].value.attachment_id | type == "string") and (to_entries[0].value["cdn-addr"] | type == "string")' \
    "$gc_tmp_dir/reservation.json" >/dev/null \
    || gc_die "unexpected attachment reservation response"

  gc_upload_url=$(jq -er 'keys[0]' "$gc_tmp_dir/reservation.json")
  gc_attachment_id=$(jq -er '.[keys[0]].attachment_id' "$gc_tmp_dir/reservation.json")
  gc_cdn_url=$(jq -er '.[keys[0]]["cdn-addr"]' "$gc_tmp_dir/reservation.json")
  gc_put_content_type=$(jq -er '.[keys[0]]["Content-Type"]' "$gc_tmp_dir/reservation.json")
  gc_acl=$(jq -er '.[keys[0]]["x-obs-acl"]' "$gc_tmp_dir/reservation.json")
  gc_project_header=$(jq -er '.[keys[0]]["x-obs-meta-project-id"]' "$gc_tmp_dir/reservation.json")
  gc_callback=$(jq -er '.[keys[0]]["x-obs-callback"]' "$gc_tmp_dir/reservation.json")
  gc_no_newlines signed-url "$gc_upload_url"
  gc_no_newlines upload-content-type "$gc_put_content_type"
  gc_no_newlines upload-acl "$gc_acl"
  gc_no_newlines upload-project "$gc_project_header"
  gc_no_newlines callback "$gc_callback"
  case "$gc_upload_url$gc_callback" in
    *\"*|*\\*) gc_die "signed upload metadata contains unsupported config characters" ;;
  esac

  {
    printf 'Content-Type: %s\n' "$gc_put_content_type"
    printf 'x-obs-acl: %s\n' "$gc_acl"
    printf 'x-obs-meta-project-id: %s\n' "$gc_project_header"
    printf 'x-obs-callback: %s\n' "$gc_callback"
  } > "$gc_tmp_dir/upload-headers.txt"
  printf 'url = "%s"\n' "$gc_upload_url" > "$gc_tmp_dir/upload.conf"

  gc_status=$(curl -sS --max-time 1800 -o "$gc_tmp_dir/upload-response.txt" -w '%{http_code}' \
    --config "$gc_tmp_dir/upload.conf" -X PUT -H "@$gc_tmp_dir/upload-headers.txt" \
    --upload-file "$gc_file")
  case "$gc_status" in
    200|201|204) ;;
    *) gc_die "signed asset upload failed with HTTP $gc_status" ;;
  esac

  jq -cn \
    --arg name "$gc_name" \
    --arg url "$gc_cdn_url" \
    --arg attachment_id "$gc_attachment_id" \
    --argjson size "$gc_size" \
    '{name:$name,url:$url,attachment_id:$attachment_id,action:"create",size:$size}'
}

gc_create() {
  local gc_session='' gc_repo='' gc_tag='' gc_ref='' gc_title=''
  local gc_description_file='' gc_assets_file='' gc_release_status='prerelease'
  local gc_repo_encoded gc_status_value gc_payload gc_status gc_expected_count

  while [ "$#" -gt 0 ]; do
    case "$1" in
      --session) gc_session=${2:-}; shift 2 ;;
      --repo) gc_repo=${2:-}; shift 2 ;;
      --tag) gc_tag=${2:-}; shift 2 ;;
      --ref) gc_ref=${2:-}; shift 2 ;;
      --title) gc_title=${2:-}; shift 2 ;;
      --description-file) gc_description_file=${2:-}; shift 2 ;;
      --assets-file) gc_assets_file=${2:-}; shift 2 ;;
      --status) gc_release_status=${2:-}; shift 2 ;;
      *) gc_die "unknown create argument: $1" ;;
    esac
  done

  [ -n "$gc_session" ] || gc_die "create requires --session"
  [ -n "$gc_repo" ] || gc_die "create requires --repo"
  [ -n "$gc_tag" ] || gc_die "create requires --tag"
  [ -n "$gc_ref" ] || gc_die "create requires --ref"
  [ -n "$gc_title" ] || gc_die "create requires --title"
  [ -f "$gc_description_file" ] || gc_die "description file not found: $gc_description_file"
  [ -f "$gc_assets_file" ] || gc_die "assets file not found: $gc_assets_file"
  gc_validate_repo "$gc_repo"
  gc_no_newlines tag "$gc_tag"
  gc_no_newlines ref "$gc_ref"
  gc_no_newlines title "$gc_title"
  [ "${#gc_ref}" -eq 40 ] || gc_die "--ref must be a full 40-character commit hash"
  case "$gc_ref" in
    *[!0-9a-fA-F]*) gc_die "--ref must be a full 40-character commit hash" ;;
  esac

  case "$gc_release_status" in
    prerelease) gc_status_value=1 ;;
    latest) gc_status_value=2 ;;
    unset) gc_status_value=0 ;;
    *) gc_die "--status must be prerelease, latest, or unset" ;;
  esac
  jq -e '
    type == "array" and length > 0 and
    all(.[]; (.name | type == "string" and length > 0) and
             (.url | type == "string" and startswith("https://gitcode.com/")) and
             (.attachment_id | type == "string" and length > 0) and
             .action == "create" and
             (.size | type == "number" and . > 0)) and
    ((map(.name) | unique | length) == length)
  ' "$gc_assets_file" >/dev/null || gc_die "assets file is invalid or contains duplicate names"
  gc_expected_count=$(jq 'length' "$gc_assets_file")

  gc_make_temp
  gc_browser_headers
  gc_repo_encoded=$(gc_encode "$gc_repo")
  gc_payload=$(jq -cn \
    --arg tag_name "$gc_tag" \
    --arg ref "$gc_ref" \
    --arg name "$gc_title" \
    --rawfile description "$gc_description_file" \
    --arg repo_id "$gc_repo_encoded" \
    --argjson release_status "$gc_status_value" \
    --slurpfile links "$gc_assets_file" \
    '{tag_name:$tag_name,ref:$ref,name:$name,description:$description,release_status:$release_status,repoId:$repo_id,links:$links[0],assets:[],inCodeTag_name:$tag_name}')

  gc_status=$(curl -sS --max-time 60 -o "$gc_tmp_dir/release.json" -w '%{http_code}' \
    -X POST "https://web-api.gitcode.com/api/v2/projects/$gc_repo_encoded/releases" \
    -H "@$gc_tmp_dir/browser-headers.txt" --data-binary "$gc_payload")
  case "$gc_status" in
    200|201) ;;
    *) gc_die "release creation failed with HTTP $gc_status" ;;
  esac

  jq -e --arg tag "$gc_tag" --arg ref "$gc_ref" --argjson count "$gc_expected_count" '
    .tag_name == $tag and .commit.id == $ref and (.assets.links | length) == $count
  ' "$gc_tmp_dir/release.json" >/dev/null \
    || gc_die "release response does not match requested tag, commit, or asset count"
  jq '{id,tag_name,name,release_status,commit:.commit.id,asset_count:(.assets.links | length)}' \
    "$gc_tmp_dir/release.json"
}

gc_verify() {
  local gc_repo='' gc_tag='' gc_assets_file='' gc_tag_encoded
  local gc_name gc_name_encoded gc_code gc_count

  while [ "$#" -gt 0 ]; do
    case "$1" in
      --repo) gc_repo=${2:-}; shift 2 ;;
      --tag) gc_tag=${2:-}; shift 2 ;;
      --assets-file) gc_assets_file=${2:-}; shift 2 ;;
      *) gc_die "unknown verify argument: $1" ;;
    esac
  done

  [ -n "$gc_repo" ] || gc_die "verify requires --repo"
  [ -n "$gc_tag" ] || gc_die "verify requires --tag"
  [ -f "$gc_assets_file" ] || gc_die "assets file not found: $gc_assets_file"
  gc_validate_repo "$gc_repo"
  jq -e 'type == "array" and length > 0 and all(.[]; .name | type == "string" and length > 0)' \
    "$gc_assets_file" >/dev/null || gc_die "assets file is invalid"
  gc_tag_encoded=$(gc_encode "$gc_tag")
  gc_count=0

  while IFS= read -r gc_name; do
    gc_no_newlines filename "$gc_name"
    gc_name_encoded=$(gc_encode "$gc_name")
    gc_code=$(curl -sSL --range 0-0 --max-time 60 -o /dev/null -w '%{http_code}' \
      "https://gitcode.com/$gc_repo/releases/download/$gc_tag_encoded/$gc_name_encoded")
    case "$gc_code" in
      200|206) ;;
      *) gc_die "public range GET failed for $gc_name with HTTP $gc_code" ;;
    esac
    gc_count=$((gc_count + 1))
  done < <(jq -r '.[].name' "$gc_assets_file")

  jq -cn --arg repo "$gc_repo" --arg tag "$gc_tag" --argjson asset_count "$gc_count" \
    '{repo:$repo,tag:$tag,asset_count:$asset_count,range_get:"ok"}'
}

gc_need curl
gc_need jq

gc_command=${1:-}
case "$gc_command" in
  upload) shift; gc_upload "$@" ;;
  create) shift; gc_create "$@" ;;
  verify) shift; gc_verify "$@" ;;
  -h|--help|help|'') gc_usage ;;
  *) gc_usage >&2; gc_die "unknown command: $gc_command" ;;
esac
