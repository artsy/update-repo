import tmp from "tmp"
import { spawnSync } from "child_process"
import chalk from "kleur"
import { Octokit } from "@octokit/rest"

interface Repo {
  owner: string
  repo: string
}

export async function updateRepo(_args: {
  repo: Repo
  branch: string
  targetBranch?: string
  title: string
  body: string
  commitMessage?: string
  assignees?: string[]
  labels?: string[]
  automerge?: boolean
  update: (dir: string) => void
}) {
  const args = {
    targetBranch: "master",
    commitMessage: _args.title,
    assignees: [],
    labels: [],
    automerge: false,
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
  automerge,
  dir,
}: {
  repo: Repo
  branch: string
  targetBranch: string
  title: string
  body: string
  commitMessage: string
  assignees: string[]
  labels: string[]
  automerge: boolean
  update: (dir: string) => void
  dir: string
}) {
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
  const prId = await createAndMergePullRequest({
    repo,
    branch,
    targetBranch,
    title,
    assignees,
    labels,
    body,
  })

  if (automerge) {
    log.step("Enabling auto-merge")
    await enablePullRequestAutoMerge({ pullRequestId: prId })
  }
}

function clone({ repo, dir }: { repo: Repo; dir: string }) {
  exec(
    `git clone https://${process.env.GH_TOKEN}@github.com/${repo.owner}/${repo.repo} ${dir}`,
    process.cwd(),
  )
}

function push({
  dir,
  branch,
  commitMessage,
}: {
  dir: string
  branch: string
  commitMessage: string
}) {
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
}: {
  branch: string
  repo: Repo
}) {
  const octokit = new Octokit({
    auth: process.env.GH_TOKEN,
  })
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
}: {
  repo: Repo
  branch: string
  targetBranch: string,
  title: string
  assignees: string[]
  labels: string[]
  body: string
}) {
  const octokit = new Octokit({
    auth: process.env.GH_TOKEN,
  })
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
  return res.data.node_id
}

async function enablePullRequestAutoMerge({
  pullRequestId,
}: {
  pullRequestId: string
}): Promise<void> {
  const octokit = new Octokit({
    auth: process.env.GH_TOKEN,
  })

  // ensure at least one running check
  // re-check if no checks running
  // if re run a certain amount of times and still no checks, merge? come back to this later probably?

  const mutation = `
    mutation($pullRequestId: ID!) {
      enablePullRequestAutoMerge(input: {
        pullRequestId: $pullRequestId
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

  await octokit.graphql(mutation, {
    pullRequestId: pullRequestId,
  })

  log.substep(`Auto-merge enabled!`)
}

function pollPrChecks(pullRequestId: string) {
 const octokit = new Octokit({
  auth: process.env.GH_TOKEN
 })
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
}: {
  branch: string
  targetBranch: string,
  dir: string
}) {
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
