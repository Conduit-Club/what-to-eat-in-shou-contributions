import assert from 'node:assert/strict';
import test from 'node:test';
import { GitHubClient } from '../src/export/github.js';

test('GitHub client creates a PR with the dev base and auth headers', async () => {
  let request;
  const client = new GitHubClient({ owner: 'example', repository: 'site', token: 'secret', apiBase: 'https://github.test', fetchImpl: async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ number: 7, html_url: 'https://github.test/pr/7' }), { status: 201, headers: { 'Content-Type': 'application/json' } });
  } });
  const result = await client.createPullRequest({ head: 'contrib/abc', title: 'Publish restaurant', body: 'Automated publication.' });
  assert.equal(result.number, 7);
  assert.equal(request.url, 'https://github.test/repos/example/site/pulls');
  assert.equal(request.options.headers.Authorization, 'Bearer secret');
  assert.deepEqual(JSON.parse(request.options.body), { head: 'contrib/abc', base: 'dev', title: 'Publish restaurant', body: 'Automated publication.' });
});
