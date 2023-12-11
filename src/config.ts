import {getInput} from '@actions/core';
import {context} from '@actions/github';

export interface Configuration {
    serverUrl: string;
    token: string;
    project: string;
    branchName: string;
    fileFormat: string;
    gitRepo: string;
    pullRequestNumber: number;
    keysetsPath: string;
    masterBranch: string;
    githubToken: string;
}

function getBranchName(): string {
    if (context.payload && context.payload.pull_request) {
        return context.payload.pull_request.head.ref;
    }

    return context.ref.replace(/refs\/heads\/(.*)/, '$1');
}

export function getConfiguration(): Configuration {
    console.log(JSON.stringify(context.payload, null, 4));

    if (!context.payload.pull_request) {
        throw Error('Weblate-action works only with pull requests');
    }

    if (!context.payload.pull_request.head?.repo?.html_url) {
        throw Error('Repository url not found');
    }

    return {
        serverUrl: getInput('SERVER_URL'),
        token: getInput('TOKEN'),
        project: getInput('PROJECT'),
        branchName: getBranchName(),
        fileFormat: getInput('FILE_FORMAT'),
        gitRepo: context.payload.pull_request.head.repo.html_url as string,
        pullRequestNumber: context.payload.pull_request.number,
        keysetsPath: getInput('KEYSETS_PATH'),
        masterBranch: getInput('MASTER_BRANCH'),
        githubToken: getInput('GITHUB_TOKEN'),
    };
}
