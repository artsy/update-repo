export interface Repo {
  owner: string
  repo: string
}

export type AutomergeMethod = "SQUASH" | "MERGE" | undefined

export type CheckStateStatus = "SUCCESS" | "PENDING" | "FAILURE" | "ERROR" | "EXPECTED" | null

export interface UpdateRepoArgs {
  repo: Repo
  branch: string
  targetBranch?: string
  title: string
  body: string
  commitMessage?: string
  assignees?: string[]
  labels?: string[]
  automergeMethod?: AutomergeMethod
  update: (dir: string) => void
}

export interface UpdateRepoInternalArgs {
  repo: Repo
  branch: string
  targetBranch: string
  title: string
  body: string
  commitMessage: string
  assignees: string[]
  labels: string[]
  automergeMethod: AutomergeMethod
  update: (dir: string) => void
  dir: string
}

export interface CloneArgs {
  repo: Repo
  dir: string
}

export interface PushArgs {
  dir: string
  branch: string
  commitMessage: string
}

export interface PullRequestExistsArgs {
  branch: string
  repo: Repo
}

export interface CreatePullRequestArgs {
  repo: Repo
  branch: string
  targetBranch: string
  title: string
  assignees: string[]
  labels: string[]
  body: string
}

export interface EnableAutoMergeArgs {
  pullRequestId: string
  pullRequestNumber: number
  repo: Repo
  autoMergeMethod: AutomergeMethod
}

export interface ForceCheckoutArgs {
  branch: string
  targetBranch: string
  dir: string
}
