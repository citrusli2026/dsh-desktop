import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'

type CachePolicy = {
  evaluateRequest(request: { url: string; method: string; headers: Record<string, string> }): {
    response?: unknown
    revalidation?: { synchronous: boolean }
  }
  revalidatedPolicy(request: { url: string; method: string; headers: Record<string, string> }, response: { status: number; headers: Record<string, string> }): {
    modified: boolean
    matches: boolean
  }
}

type CachePolicyConstructor = new (
  request: { url: string; method: string; headers: Record<string, string> },
  response: { status: number; headers: Record<string, string> },
) => CachePolicy

const require = createRequire(import.meta.url)
const HttpCacheSemantics = require('../vendor/http-cache-semantics') as CachePolicyConstructor
const request = { url: '/resource', method: 'GET', headers: { host: 'example.test' } }

function stalePolicy(headers: Record<string, string>): CachePolicy {
  return new HttpCacheSemantics(request, {
    status: 200,
    headers: { age: '600000000', 'cache-control': 'max-age=1', ...headers },
  })
}

test('patched cache policy never reuses restricted responses through max-stale', () => {
  const restrictedHeaders: Array<Record<string, string>> = [
    { 'set-cookie': 'session=secret' },
    { 'cache-control': 'max-age=1, proxy-revalidate' },
    { 'cache-control': 's-maxage=1' },
  ]
  for (const headers of restrictedHeaders) {
    const policy = stalePolicy(headers)
    const requestWithMaxStale = { ...request, headers: { ...request.headers, 'cache-control': 'max-stale' } }
    const result = policy.evaluateRequest(requestWithMaxStale)
    assert.equal(result.response, undefined)
    assert.equal(result.revalidation?.synchronous, true)

    const errorFallback = policy.revalidatedPolicy(request, { status: 503, headers: {} })
    assert.equal(errorFallback.modified, true)
    assert.equal(errorFallback.matches, false)
  }
})

test('patched cache policy retains ordinary stale reuse', () => {
  const result = stalePolicy({}).evaluateRequest({
    ...request,
    headers: { ...request.headers, 'cache-control': 'max-stale' },
  })
  assert.ok(result.response)
})
