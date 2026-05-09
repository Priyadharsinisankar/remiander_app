const LINEAR_GRAPHQL_URL = 'https://api.linear.app/graphql';

function hasLinearConfig() {
  return Boolean(process.env.LINEAR_PERSONAL_API_KEY && process.env.LINEAR_TEAM_ID);
}

function getMissingLinearConfig() {
  return ['LINEAR_PERSONAL_API_KEY', 'LINEAR_TEAM_ID'].filter((key) => !process.env[key]);
}

function assertLinearConfig() {
  const missing = getMissingLinearConfig();

  if (missing.length > 0) {
    const error = new Error(`Linear is missing: ${missing.join(', ')}`);
    error.status = 400;
    throw error;
  }
}

async function linearRequest(query, variables = {}) {
  if (!process.env.LINEAR_PERSONAL_API_KEY) {
    const error = new Error('Linear is missing: LINEAR_PERSONAL_API_KEY');
    error.status = 400;
    throw error;
  }

  const response = await fetch(LINEAR_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      Authorization: process.env.LINEAR_PERSONAL_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok || body.errors?.length) {
    const error = new Error(body.errors?.[0]?.message || 'Linear request failed');
    error.status = response.status || 400;
    throw error;
  }

  return body.data;
}

async function getViewer() {
  const data = await linearRequest(`
    query Viewer {
      viewer {
        id
        name
        email
      }
    }
  `);

  return data.viewer;
}

async function createLinearIssue(reminder) {
  assertLinearConfig();

  const data = await linearRequest(
    `
      mutation CreateIssue($input: IssueCreateInput!) {
        issueCreate(input: $input) {
          success
          issue {
            id
            identifier
            url
          }
        }
      }
    `,
    {
      input: {
        teamId: process.env.LINEAR_TEAM_ID,
        title: reminder.title,
        description: reminder.description || `Reminder scheduled for ${reminder.start_time}.`,
      },
    }
  );

  if (!data.issueCreate?.success) {
    const error = new Error('Could not create Linear issue');
    error.status = 400;
    throw error;
  }

  return data.issueCreate.issue;
}

async function updateLinearIssue(reminder) {
  assertLinearConfig();

  if (!reminder.linear_issue_id) {
    return null;
  }

  const data = await linearRequest(
    `
      mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) {
        issueUpdate(id: $id, input: $input) {
          success
          issue {
            id
            identifier
            url
          }
        }
      }
    `,
    {
      id: reminder.linear_issue_id,
      input: {
        title: reminder.title,
        description: reminder.description || `Reminder scheduled for ${reminder.start_time}.`,
      },
    }
  );

  if (!data.issueUpdate?.success) {
    const error = new Error('Could not update Linear issue');
    error.status = 400;
    throw error;
  }

  return data.issueUpdate.issue;
}

async function deleteLinearIssue(issueId) {
  assertLinearConfig();

  if (!issueId) {
    return null;
  }

  const data = await linearRequest(
    `
      mutation DeleteIssue($id: String!) {
        issueDelete(id: $id) {
          success
        }
      }
    `,
    { id: issueId }
  );

  if (!data.issueDelete?.success) {
    const error = new Error('Could not delete Linear issue');
    error.status = 400;
    throw error;
  }

  return true;
}

module.exports = {
  createLinearIssue,
  updateLinearIssue,
  deleteLinearIssue,
  getMissingLinearConfig,
  getViewer,
  hasLinearConfig,
};
