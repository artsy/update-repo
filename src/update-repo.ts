import tmp from "tmp"
import { spawnSync } from "child_process"
import chalk from "kleur"
import { Octokit } from "@octokit/rest"
import { CHECK_PR_STATUS_QUERY, ENABLE_AUTO_MERGE_MUTATION } from "./graphql-queries"
import type {
  UpdateRepoArgs,
  UpdateRepoInternalArgs,
  CloneArgs,
  PushArgs,
  PullRequestExistsArgs,
  CreatePullRequestArgs,
  EnableAutoMergeArgs,
  ForceCheckoutArgs,
  CheckStateStatus
} from "./types"


function createOctokit() {
  if (!process.env.GH_TOKEN) {
    throw new Error("GH_TOKEN environment variable is required")
  }
  return new Octokit({ auth: process.env.GH_TOKEN })
}

/**
 * Create a single Octokit instance to be reused across function calls
 */
const octokit = createOctokit()

export async function updateRepo(_args: UpdateRepoArgs) {
  const args = {
    targetBranch: "master",
    commitMessage: _args.title,
    assignees: [],
    labels: [],
    automergeMethod: _args.automergeMethod ?? undefined,
    ..._args,
  }
  log.task(`Updating ${args.repo.owner}/${args.repo.repo}`)

  const dirHandle = tmp.dirSync({ unsafeCleanup: true })
  const dir = dirHandle.name

  try {
    await _updateRepo({ ...args, dir })
    log.success(`${args.repo.owner}/${args.repo.repo} is up to date!`)
  } finally {
    dirHandle.removeCallback()
  }
}

async function _updateRepo({
  repo,
  branch,
  targetBranch,
  update,
  title,
  body,
  commitMessage,
  assignees,
  labels,
  automergeMethod,
  dir
}: UpdateRepoInternalArgs) {
  log.step("Cloning repo")
  clone({ repo, dir })
  await forceCheckout({ branch, targetBranch, dir })

  update(dir)

  log.step("Checking for changes")
  if (!hasChanges(dir)) {
    log.substep(`Repo remains unchanged so no further action required :)`)
    return
  }

  log.step("Pushing changes")
  push({ dir, branch, commitMessage })

  if (await pullRequestAlreadyExists({ repo, branch })) {
    log.step(
      `PR for branch ${branch} already exists so there's nothing left to do :)`,
    )
    return
  }

  log.step("Creating and merging pull request")
  const { prId, prNumber } = await createAndMergePullRequest({
    repo,
    branch,
    targetBranch,
    title,
    assignees,
    labels,
    body,
  })

  if (automergeMethod) {
    log.step("Enabling auto-merge")
    await enablePullRequestAutoMerge({ pullRequestId: prId, pullRequestNumber: prNumber, repo: repo, autoMergeMethod: automergeMethod })
  }
}

function clone({ repo, dir }: CloneArgs) {
  exec(
    `git clone https://${process.env.GH_TOKEN}@github.com/${repo.owner}/${repo.repo} ${dir}`,
    process.cwd(),
  )
}

function push({
  dir,
  branch,
  commitMessage,
}: PushArgs) {
  exec(`git add -A`, dir)
  const result = spawnSync("git", ["commit", "-m", commitMessage, "--no-verify"], { cwd: dir })
  if (result.status !== 0) {
    throw new Error(`Failed comitting: ${result.output.toString()}`)
  }
  exec(`git push origin ${branch} --force --no-verify`, dir)
}

function exec(command: string, cwd: string) {
  log.substep(command)
  const task = spawnSync(command, { shell: true, cwd })
  if (task.status != 0) {
    throw new ShellError(command, task.stderr.toString())
  }
  return task.stdout.toString()
}

class ShellError extends Error {
  constructor(public command: string, public output: string) {
    super(
      `Failed running command '${command}' \n\n${prefixLines(output, "  ")}`,
    )
    this.command = command
    this.output = output
  }
}

async function pullRequestAlreadyExists({
  branch,
  repo,
}: PullRequestExistsArgs) {
  const res = await octokit.pulls.list({
    ...repo,
    state: "open",
  })
  return res.data.some((pr) => pr.head.ref === branch)
}

async function createAndMergePullRequest({
  repo,
  branch,
  targetBranch,
  title,
  assignees,
  labels,
  body,
}: CreatePullRequestArgs) {
  log.substep("Creating initial PR")
  const res = await octokit.pulls.create({
    ...repo,
    head: branch,
    base: targetBranch,
    title: title,
    body,
  })
  if (assignees.length) {
    log.substep(`Adding assignees: [${assignees.join(", ")}]`)
    await octokit.issues.addAssignees({
      ...repo,
      issue_number: res.data.number,
      assignees,
    })
  }
  if (labels.length) {
    log.substep(`Adding labels: ${JSON.stringify(labels)}`)
    await octokit.issues.addLabels({
      ...repo,
      issue_number: res.data.number,
      labels,
    })
  }
  return {
    prId: res.data.node_id,
    prNumber: res.data.number,
  }
}

async function enablePullRequestAutoMerge({
  pullRequestId,
  pullRequestNumber,
  autoMergeMethod,
  repo
}: EnableAutoMergeArgs): Promise<void> {

  // Poll for status to be available.
  // This is necessary because GitHub sometimes takes a moment to
  // calculate the status checks after creating the PR and enabling
  // auto-merge before that will fail. Will retry up to 10 times with
  // a 1 second delay between attempts.
  let counter: number = 0
  let status: CheckStateStatus = null
  while (status == null && counter < 10) {
    const response = await octokit.graphql(CHECK_PR_STATUS_QUERY, {
      pullRequestNumber: pullRequestNumber,
      owner: repo.owner,
      repo: repo.repo
    })
    status = response?.repository?.pullRequest?.statusCheckRollup?.state ?? null
    await new Promise((resolve) => setTimeout(resolve, 1000)) // wait for 1 second
    counter++
    log.substep(`Poll attempt ${counter}: status is ${status}`)
  }

  await octokit.graphql(ENABLE_AUTO_MERGE_MUTATION, {
    pullRequestId: pullRequestId,
    mergeMethod: autoMergeMethod
  })

  log.substep(`Auto-merge enabled with method ${autoMergeMethod}`)
}

/**
 * Puts prefix at the start of every line of text
 */
function prefixLines(text: string, prefix: string) {
  return prefix + text.split("\n").join(`\n${prefix}`)
}

const log = {
  /**
   * @param {string} str
   */
  task: (str: string) =>
    console.log(chalk.green("\n::"), chalk.bold(str), chalk.green("::\n")),
  /**
   * @param {string} str
   */
  step: (str: string) => console.log(chalk.cyan(`•`), str),
  /**
   * @param {string} str
   */
  substep: (str: string) => console.log(chalk.grey("  " + str)),
  /**
   * @param {string} str
   */
  success: (str: string) =>
    console.log("\n" + chalk.green(`✔`), chalk.bold(str)),
}

/**
 * Checks out the branch, creating it if it doesn't already exist
 */
async function forceCheckout({
  branch,
  targetBranch,
  dir,
}: ForceCheckoutArgs) {
  try {
    exec(`git checkout ${branch}`, dir)
    exec(`git reset ${targetBranch} --hard`, dir)
  } catch (_) {
    exec(`git checkout -b ${branch}`, dir)
  }
}

function hasChanges(dir: string) {
  return exec("git status --porcelain", dir) !== ""
}
