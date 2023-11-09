import {getInput} from '@actions/core';
import {context} from '@actions/github';

export interface Configuration {
    serverUrl: string;
    token: string;
    project: string;
    branchName: string;
    fileFormat: string;
    gitRepo: string;
}

function getBranchName(): string {
    if (context.payload && context.payload.pull_request) {
        return context.payload.pull_request.head.ref;
    }

    return context.ref.replace(/refs\/heads\/(.*)/, '$1');
}

export function getConfiguration(): Configuration {
    return {
        serverUrl: getInput('serverUrl'),
        token: getInput('token'),
        project: getInput('project'),
        branchName: getBranchName(),
        fileFormat: getInput('fileFormat'),
        gitRepo: context.repo.repo,
    };
}
