export const CHECK_PR_STATUS_QUERY = `
  query getPullRequestStatus($pullRequestNumber: Int!, $repo: String!, $owner: String!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $pullRequestNumber) {
        statusCheckRollup {
          state
        }
      }
    }
  }
`

export const ENABLE_AUTO_MERGE_MUTATION = `
  mutation($pullRequestId: ID!, $mergeMethod: PullRequestMergeMethod!) {
    enablePullRequestAutoMerge(input: {
      pullRequestId: $pullRequestId
      mergeMethod: $mergeMethod
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
