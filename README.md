# @artsy/update-repo

Update github repos with a pull request.

## Installation

    yarn add @artsy/update-repo

## Usage

Aside from node, you need two things in your execution environment to make this work:

- A [`GH_TOKEN` environment variable](https://help.github.com/en/github/authenticating-to-github/creating-a-personal-access-token-for-the-command-line) which has permissions to create a PR to the repo you want to update.
- A git installation with `user.email` and `user.name` configured [or the equivalent environment variables](https://git-scm.com/book/en/v2/Git-Internals-Environment-Variables)

```ts
import { updateRepo } from "@artsy/update-repo"

await updateRepo({
  repo: { owner: "artsy", repo: "metaphysics" },
  branch: "update-npm-dependency",
  targetBranch: "master",
  title: "Update the version for my-npm-package",
  body: "bleep bloop :robot:",
  commitMessage: "update version",
  assignees: ["ds300"],
  labels: ["automated"],
  update: (dir) => {
    // This update function gets executed in a freshly-checked-out version
    // of the repo you specified. If you make any changes here they will
    // be committed and added to a PR.
    execSync(`yarn add my-npm-package@${newVersion}`, { cwd: dir })
  },
})
```

## About Artsy

<a href="https://www.artsy.net/">
  <img align="left" src="https://avatars2.githubusercontent.com/u/546231?s=200&v=4"/>
</a>

This project is the work of engineers at [Artsy][footer_website], the world's
leading and largest online art marketplace and platform for discovering art.
One of our core [Engineering Principles][footer_principles] is being [Open
Source by Default][footer_open] which means we strive to share as many details
of our work as possible.

You can learn more about this work from [our blog][footer_blog] and by following
[@ArtsyOpenSource][footer_twitter] or explore our public data by checking out
[our API][footer_api]. If you're interested in a career at Artsy, read through
our [job postings][footer_jobs]!

[footer_website]: https://www.artsy.net/
[footer_principles]: https://github.com/artsy/README/blob/master/culture/engineering-principles.md
[footer_open]: https://github.com/artsy/README/blob/master/culture/engineering-principles.md#open-source-by-default
[footer_blog]: https://artsy.github.io/
[footer_twitter]: https://twitter.com/ArtsyOpenSource
[footer_api]: https://developers.artsy.net/
[footer_jobs]: https://www.artsy.net/jobs
