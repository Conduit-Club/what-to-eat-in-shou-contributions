export class GitHubClient {
  constructor({ owner, repository, token, apiBase = 'https://api.github.com', fetchImpl = fetch }) {
    this.owner = owner;
    this.repository = repository;
    this.token = token;
    this.apiBase = apiBase.replace(/\/$/, '');
    this.fetch = fetchImpl;
  }

  async createPullRequest({ head, base = 'dev', title, body }) {
    return this.request(`/repos/${this.owner}/${this.repository}/pulls`, { method: 'POST', body: { head, base, title, body } });
  }

  async getPullRequest(number) {
    return this.request(`/repos/${this.owner}/${this.repository}/pulls/${number}`);
  }

  async closePullRequest(number) {
    return this.request(`/repos/${this.owner}/${this.repository}/pulls/${number}`, { method: 'PATCH', body: { state: 'closed' } });
  }

  async request(path, { method = 'GET', body } = {}) {
    const response = await this.fetch(`${this.apiBase}${path}`, {
      method,
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${this.token}`, 'X-GitHub-Api-Version': '2022-11-28', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.message || `GitHub API returned ${response.status}`);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  }
}
