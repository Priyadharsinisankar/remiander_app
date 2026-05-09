function hasJiraConfig() {
  return Boolean(
    process.env.JIRA_API_TOKEN &&
      process.env.JIRA_BASE_URL &&
      process.env.JIRA_EMAIL &&
      process.env.JIRA_PROJECT_KEY
  );
}

function getMissingJiraConfig() {
  return ['JIRA_API_TOKEN', 'JIRA_BASE_URL', 'JIRA_EMAIL', 'JIRA_PROJECT_KEY'].filter(
    (key) => !process.env[key]
  );
}

function assertJiraConfig() {
  const missing = getMissingJiraConfig();

  if (missing.length > 0) {
    const error = new Error(`Jira is missing: ${missing.join(', ')}`);
    error.status = 400;
    throw error;
  }
}

function getAuthHeader() {
  const token = Buffer.from(`${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`).toString('base64');
  return `Basic ${token}`;
}

function getBaseUrl() {
  return process.env.JIRA_BASE_URL.replace(/\/+$/, '');
}

async function createJiraIssue(reminder) {
  assertJiraConfig();

  const response = await fetch(`${getBaseUrl()}/rest/api/3/issue`, {
    method: 'POST',
    headers: {
      Authorization: getAuthHeader(),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fields: {
        project: {
          key: process.env.JIRA_PROJECT_KEY,
        },
        summary: reminder.title,
        description: {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: reminder.description || `Reminder scheduled for ${reminder.start_time}.`,
                },
              ],
            },
          ],
        },
        issuetype: {
          name: process.env.JIRA_ISSUE_TYPE || 'Task',
        },
      },
    }),
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = body.errorMessages?.[0] || body.errors?.summary || 'Could not create Jira issue';
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return {
    key: body.key,
    url: `${getBaseUrl()}/browse/${body.key}`,
  };
}

async function updateJiraIssue(reminder) {
  assertJiraConfig();

  if (!reminder.jira_issue_key) {
    return null;
  }

  const response = await fetch(`${getBaseUrl()}/rest/api/3/issue/${reminder.jira_issue_key}`, {
    method: 'PUT',
    headers: {
      Authorization: getAuthHeader(),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fields: {
        summary: reminder.title,
        description: {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: reminder.description || `Reminder scheduled for ${reminder.start_time}.`,
                },
              ],
            },
          ],
        },
      },
    }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message = body.errorMessages?.[0] || body.errors?.summary || 'Could not update Jira issue';
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return true;
}

async function deleteJiraIssue(jiraIssueKey) {
  assertJiraConfig();

  if (!jiraIssueKey) {
    return null;
  }

  const response = await fetch(`${getBaseUrl()}/rest/api/3/issue/${jiraIssueKey}`, {
    method: 'DELETE',
    headers: {
      Authorization: getAuthHeader(),
    },
  });

  if (!response.ok && response.status !== 404) {
    const body = await response.json().catch(() => ({}));
    const message = body.errorMessages?.[0] || 'Could not delete Jira issue';
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return true;
}

module.exports = {
  createJiraIssue,
  updateJiraIssue,
  deleteJiraIssue,
  getMissingJiraConfig,
  hasJiraConfig,
};
