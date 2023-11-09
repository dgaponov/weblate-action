import {getInput} from '@actions/core';

export interface Configuration {
    weblateUrl: string;
    weblateToken: string;
}

export function getConfiguration(): Configuration {
    const settings = {} as unknown as Configuration;
    // TODO parse other settings

    settings.weblateUrl = getInput('weblateUrl');
    settings.weblateToken = getInput('weblateToken');

    return settings;
}
