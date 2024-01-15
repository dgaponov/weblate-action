import {getInput} from '@actions/core';
import {context} from '@actions/github';

export enum ActionMode {
    VALIDATE_PULL_REQUEST = 'VALIDATE_PULL_REQUEST',
    SYNC_MASTER = 'SYNC_MASTER',
    REMOVE_BRANCH = 'REMOVE_BRANCH',
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

type PullRequest = {
    title: string;
    number: number;
    rebaseable: boolean;
    merged: boolean;
    draft: boolean;
    html_url: string;
    state: 'open' | 'closed';
    head?: {
        repo?: {
            html_url: string;
        };
    };
    user?: {
        login?: string;
    };
};

function getBranchName(): string {
    if (context.payload && context.payload.pull_request) {
        return context.payload.pull_request.head.ref;
    }

    return context.ref.replace(/refs\/heads\/(.*)/, '$1');
}

export function getConfiguration(): Configuration {
    const pullRequest = context.payload.pull_request
        ? (context.payload.pull_request as PullRequest)
        : undefined;

    let mode: ActionMode;

    const masterBranch = getInput('MASTER_BRANCH');
    const branchName = getBranchName();

    let gitRepo: string;
    let pullRequestAuthor: string | undefined;

    if (pullRequest) {
        if (!pullRequest?.head?.repo?.html_url) {
            throw Error('Repository url for pull request not found');
        }

        gitRepo = pullRequest.head.repo.html_url;
        pullRequestAuthor = pullRequest.user?.login;
        mode =
            pullRequest.state === 'closed'
                ? ActionMode.REMOVE_BRANCH
                : ActionMode.VALIDATE_PULL_REQUEST;
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
        mode = ActionMode.SYNC_MASTER;
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
