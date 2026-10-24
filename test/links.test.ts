/**
 * The update prompt is a download invitation, not a GitHub tour: it must open
 * the community site's download page in the user's locale (both mirror and
 * install notes live there), never a GitHub release URL.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { COMMUNITY_WEBSITE_URL, communityDownloadUrl } from '../src/main/links.ts'

test('the update prompt opens the community download page per locale', () => {
  assert.equal(communityDownloadUrl('zh'), 'https://dsh-desktop.com/download')
  assert.equal(communityDownloadUrl('en'), 'https://dsh-desktop.com/en/download')
  assert.ok(communityDownloadUrl('zh').startsWith(COMMUNITY_WEBSITE_URL))
  for (const locale of ['zh', 'en'] as const) {
    assert.doesNotMatch(communityDownloadUrl(locale), /github\.com/)
  }
})
