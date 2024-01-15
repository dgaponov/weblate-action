# weblate-action

## Getting Started

To use `weblate-action` you'll need to set up a few things:

1. Create a GitHub account to use for bot
activity. This will be the account login and
profile photo that you'll see when the bot
comments on a pull request.

2. Add the GitHub bot account to your project as a collaborator.
`https://github.com/<owner>/<repo>/settings/collaboration`.
Be sure to accept the invite email! This will enable the bot
to set PR statuses.

3. [Create a personal access token for the
GitHub bot account](https://github.com/settings/tokens).
The access token must at least have the `public_repo` scope
enabled.

4. In the Actions secrets for your repository,
set the personal access token as repository
secret called `WEBLATE_BOT_GITHUB_TOKEN`.

5. Create a new Weblate project without components.
Create a user in Weblate and give them full access rights to the new project.

6. Get an API token for a new user in Weblate and set it in the Actions secrets
of your repository as repository secret called `WEBLATE_TOKEN`.

7. Add workflow to your repository. For example, `.github/workflows/i18n-check.yml`:

    ```
    name: i18n-check

    on:
        # pull_request_target is needed instead of just pull_request
        # because secret is needed to sync with weblate
        # Attention! Read more at https://nathandavison.com/blog/github-actions-and-the-threat-of-malicious-pull-requests
        pull_request_target:
            types: ['opened', 'reopened', 'synchronize', 'closed']
            branches:
            - main
            paths:
            - "src/i18n-keysets/**"
        push:
            branches:
            - main
            paths:
            - "src/i18n-keysets/**"
        workflow_dispatch:

    jobs:
        i18n_check:
            runs-on: ubuntu-latest
            if: github.actor != 'WeblateGravity' # Ignore pull requests from bot
            steps:
            - uses: actions/checkout@v4
                with:
                ref: ${{ github.event.pull_request.head.sha }}
    
            - name: Verifying changes with Weblate
                uses: dgaponov/weblate-action@v1.33.0
                with:
                    SERVER_URL: "http://SOME_WEBLATE_SERVER_URL" # Weblate server URL
                    TOKEN: ${{ secrets.WEBLATE_TOKEN }}
                    PROJECT: "project_slug"
                    GITHUB_TOKEN: ${{ secrets.WEBLATE_BOT_GITHUB_TOKEN }}
    ```
