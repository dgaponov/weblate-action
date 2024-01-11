import {getInput} from '@actions/core';
import {context} from '@actions/github';

export enum ActionMode {
    VALIDATE_PULL_REQUEST = 'VALIDATE_PULL_REQUEST',
    SYNC_MASTER = 'SYNC_MASTER',
}

export type Configuration = {
    mode: ActionMode;
    serverUrl: string;
    token: string;
    project: string;
    branchName: string;
    fileFormat: string;
    gitRepo: string;
    keysetsPath: string;
    masterBranch: string;
    githubToken: string;
    pullRequestNumber?: number;
    pullRequestAuthor?: string;
};

function getBranchName(): string {
    if (context.payload && context.payload.pull_request) {
        return context.payload.pull_request.head.ref;
    }

    return context.ref.replace(/refs\/heads\/(.*)/, '$1');
}

export function getConfiguration(): Configuration {
    const mode = context.payload.pull_request
        ? ActionMode.VALIDATE_PULL_REQUEST
        : ActionMode.SYNC_MASTER;

    const masterBranch = getInput('MASTER_BRANCH');
    const branchName = getBranchName();

    let gitRepo: string;
    let pullRequestAuthor: string | undefined;

    if (mode === 'VALIDATE_PULL_REQUEST') {
        if (!context.payload.pull_request?.head?.repo?.html_url) {
            throw Error('Repository url for pull request not found');
        }

        gitRepo = context.payload.pull_request.head.repo.html_url;
        pullRequestAuthor = context.payload.pull_request.user?.login;
    } else {
        if (!context.payload.repository?.html_url) {
            throw Error('Repository url for master branch not found');
        }

        if (branchName !== masterBranch) {
            throw Error(
                `The branch '${branchName}' doesn't match the master branch '${masterBranch}'`,
            );
        }

        gitRepo = context.payload.repository.html_url;
    }

    return {
        mode,
        serverUrl: getInput('SERVER_URL'),
        token: getInput('TOKEN'),
        project: getInput('PROJECT'),
        branchName,
        fileFormat: getInput('FILE_FORMAT'),
        gitRepo,
        pullRequestNumber: context.payload.pull_request?.number,
        keysetsPath: getInput('KEYSETS_PATH'),
        masterBranch,
        githubToken: getInput('GITHUB_TOKEN'),
        pullRequestAuthor,
    };
}
