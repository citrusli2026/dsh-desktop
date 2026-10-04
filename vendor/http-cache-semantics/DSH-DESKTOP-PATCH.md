# Dsh Desktop downstream security repair

This package is a local, reproducible build of `http-cache-semantics` 4.2.0
with version `4.2.1-dsh.0`. It contains the security repair from upstream
pull request 60 at commit `11fb104275349bbd84bf21eafd40b18220c29c46`.

The patch prevents `max-stale` and stale extensions from reusing responses
that require validation, including shared responses carrying `Set-Cookie` and
responses with `proxy-revalidate`. `test/http-cache-semantics.test.ts` covers
the affected paths and ordinary stale reuse.

Replace this local package with the first upstream release that includes the
repair, then remove this directory and both workspace overrides.
