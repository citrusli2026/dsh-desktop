# GitCode release protocol

## Flow

GitCode custom release assets use two steps:

1. Reserve an attachment with an authenticated JSON request.
2. PUT the file bytes to the returned, short-lived signed storage URL using the returned OBS headers.

After every attachment is uploaded, create the release with the stable attachment descriptors. The stable URL is based on the release tag and filename; never publish the signed storage URL.

## Browser authorization

The bundled script reads `access_token`, `document.cookie`, and `navigator.userAgent` from a logged-in GitCode tab through the local browser-control daemon. It writes them to a mode-0600 temporary header file and removes the directory on exit.

Direct CLI requests containing only the bearer token may be rejected by GitCode CloudWAF with HTTP 418. Preserve the browser User-Agent, cookies, Origin, Referer, and GitCode web-client headers. Do not print their values while diagnosing failures.

## Attachment reservation

Endpoint:

```text
POST https://web-api.gitcode.com/api/v2/projects/{encoded-owner%2Frepository}/releases/upload
```

Body:

```json
{
  "type": "RELEASE",
  "size": 123456,
  "file_name": "product-1.2.3.exe",
  "content_type": "application/octet-stream",
  "project_id": "owner%252Frepository"
}
```

The response is a one-entry object. Its key is the signed PUT URL. Its value contains `Content-Type`, `x-obs-acl`, `x-obs-meta-project-id`, `x-obs-callback`, `attachment_id`, and `cdn-addr`.

PUT the exact local file with the returned content and OBS headers. Accept only HTTP 200, 201, or 204.

The reusable descriptor is:

```json
{
  "name": "product-1.2.3.exe",
  "url": "https://gitcode.com/owner/repository/releases/download/untagger_ID/product-1.2.3.exe",
  "attachment_id": "ATTACHMENT_ID",
  "action": "create",
  "size": 123456
}
```

## Release creation

Endpoint:

```text
POST https://web-api.gitcode.com/api/v2/projects/{encoded-owner%2Frepository}/releases
```

Relevant payload:

```json
{
  "tag_name": "v1.2.3",
  "ref": "full-release-commit",
  "name": "Product v1.2.3",
  "description": "Release notes",
  "release_status": 1,
  "repoId": "owner%2Frepository",
  "links": [],
  "assets": [],
  "inCodeTag_name": "v1.2.3"
}
```

Set `links` to the attachment descriptors. Status values are `0` unset, `1` prerelease, and `2` latest.

Validate the response's `tag_name`, `commit.id`, and `assets.links` count. A successful API response is not sufficient on its own; inspect the release page and verify stable downloads.

## Public verification

Stable asset URL:

```text
https://gitcode.com/{owner}/{repository}/releases/download/{tag}/{filename}
```

Use `Range: bytes=0-0`, follow redirects, cancel/discard the response body, and accept HTTP 200 or 206. HEAD may return 401 even for a valid public asset.

## Recovery

- HTTP 418 on API request: the browser cookies/User-Agent or web-client headers are missing; return to the logged-in GitCode tab and retry through the bundled script.
- Reservation succeeds but PUT fails: reserve a fresh attachment because signed URLs expire; do not reuse an old signed URL.
- Attachment exists but release creation fails: retain only the non-secret descriptor JSON, correct the release payload, and retry creation after checking that the tag is still unused.
- Same-tag release already exists: inspect it. Edit only when the user explicitly authorizes repair; never create a second or move the tag silently.
