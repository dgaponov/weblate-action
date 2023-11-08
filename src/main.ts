import {debug} from '@actions/core';
import {getInputs} from './input-helper';

async function run(): Promise<void> {
    const taskRunSettings = await getInputs();
    debug(JSON.stringify(taskRunSettings));
}

run();
