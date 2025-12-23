export const CHECK_PR_STATUS_QUERY = `
  query($pullRequestId: ID!, $repo: String!, $owner: String!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $pullRequestId) {
        statusCheckRollup {
          state
        }
      }
    }
  }
`

export const ENABLE_AUTO_MERGE_MUTATION = `
  mutation($pullRequestId: ID!, $autoMergeMethod: PullRequestAutoMergeMethod!) {
    enablePullRequestAutoMerge(input: {
      pullRequestId: $pullRequestId
      autoMergeMethod: $autoMergeMethod
    }) {
      pullRequest {
        id
        autoMergeRequest {
          enabledAt
        }
      }
    }
  }
`
