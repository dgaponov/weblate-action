import {getInput} from '@actions/core';
import type {TaskRunSettings} from './types';

export async function getInputs(): Promise<TaskRunSettings> {
    const settings = {} as unknown as TaskRunSettings;
    // TODO parse other settings

    settings.weblateUrl = getInput('weblateUrl');
    settings.weblateToken = getInput('weblateToken');

    return settings;
}
